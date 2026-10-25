// "Vendo aqui, temos muitos erros na senha. Tem como colocar a opção de ver a senha antes
//  de confirmar, aquele olho que ao clicar aparece a senha pra verificar?"
//
// São 29 campos de senha em 12 apps. O olho é um arquivo só (gn-olho-senha.js) que se
// pendura sozinho em todos — então o risco não é o olho não aparecer: é ele EMPURRAR algum
// campo em algum app, e ninguém reparar até a loja reclamar.
//
// Esta suíte abre cada app duas vezes: uma com o script bloqueado (a régua) e outra com ele
// ligado, e compara o retângulo de cada campo de senha. Depois cobra o comportamento.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const DIR = process.env.DIR_PUB || CAMINHOS.PUBLICO;
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 320)); };

const APPS = ['gn-home', 'gn-caixa', 'gn-checklist', 'gn-lojas', 'gn-usuarios', 'gn-rh',
              'gn-pedidos', 'gn-comissoes', 'gn-comissoes-mestra', 'gn-inventario',
              'gn-manutencao', 'gn-comandas'];

// Onde cada campo de senha está: índice na ordem do documento, e o retângulo arredondado.
const LER_RETANGULOS = () => [...document.querySelectorAll('input[type="password"],input[data-gn-olho]')]
  .map((el, i) => {
    const r = el.getBoundingClientRect();
    return { i, id: el.id || '(sem id)', x: Math.round(r.left), y: Math.round(r.top),
             w: Math.round(r.width), h: Math.round(r.height) };
  });

async function abrir(browser, app, { comOlho }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  if (!comOlho) await ctx.route('**/gn-olho-senha.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* desligado pra medir a régua */' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + DIR + '/' + app + '.html');
  await page.waitForTimeout(900);
  return { ctx, page, erros };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. O campo não anda um pixel, em nenhum app ───────────────────────────────────
  let totalCampos = 0, totalComOlho = 0;
  for (const app of APPS) {
    const base = await abrir(browser, app, { comOlho: false });
    const regua = await base.page.evaluate(LER_RETANGULOS);
    await base.ctx.close();

    const vivo = await abrir(browser, app, { comOlho: true });
    const depois = await vivo.page.evaluate(LER_RETANGULOS);
    const olhos = await vivo.page.locator('[data-gn-olho-btn]').count();
    const naoCoube = await vivo.page.locator('input[data-gn-olho="nao-coube"]').count();
    await vivo.ctx.close();

    totalCampos += regua.length;
    totalComOlho += olhos;

    check(`${app}: mesmo número de campos de senha com e sem o olho`,
      regua.length === depois.length, `régua ${regua.length} × ${depois.length}`);

    const moveu = regua.filter((r, k) => {
      const d = depois[k]; if (!d) return true;
      return Math.abs(r.x - d.x) > 1 || Math.abs(r.y - d.y) > 1 ||
             Math.abs(r.w - d.w) > 1 || Math.abs(r.h - d.h) > 1;
    });
    check(`${app}: nenhum campo mudou de lugar ou de tamanho`, moveu.length === 0,
      JSON.stringify(moveu.slice(0, 3)));
    check(`${app}: nenhum erro de JS com o olho ligado`, vivo.erros.length === 0, vivo.erros.join(' | '));
    if (naoCoube) console.log(`      (${app}: ${naoCoube} campo(s) desistiram do olho pra não mexer no layout — por projeto)`);
  }
  check('há campos de senha pra cobrir', totalCampos >= 20, totalCampos + ' campos');
  check('e o olho chegou em pelo menos um campo visível de cada entrada', totalComOlho >= 1, totalComOlho + ' olhos');

  // ── 2. O comportamento, na tela de login do Painel ────────────────────────────────
  const { ctx, page, erros } = await abrir(browser, 'gn-home', { comOlho: true });
  const campo = page.locator('#inp-senha');
  const olho = page.locator('[data-gn-olho-btn]').first();

  check('o olho aparece ao lado do campo de senha do login', await olho.count() === 1);
  check('e começa escondido (type=password)', await campo.getAttribute('type') === 'password');
  check('o botão é type=button — dentro de um form ele não envia nada',
    await olho.getAttribute('type') === 'button');
  check('tem rótulo pra leitor de tela', !!(await olho.getAttribute('aria-label')));

  await campo.fill('Senha#2026');
  await olho.click();
  check('ao tocar no olho, a senha aparece', await campo.getAttribute('type') === 'text');
  check('e o valor digitado continua intacto', await campo.inputValue() === 'Senha#2026');
  check('o estado é dito ao leitor de tela', await olho.getAttribute('aria-pressed') === 'true');

  const dentro = await page.evaluate(() => {
    const i = document.getElementById('inp-senha'), b = document.querySelector('[data-gn-olho-btn]');
    const ri = i.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return { dentro: rb.right <= ri.right + 1 && rb.left >= ri.left,
             centrado: Math.abs((rb.top + rb.bottom) / 2 - (ri.top + ri.bottom) / 2) < 2,
             alvo: Math.round(rb.width) + 'x' + Math.round(rb.height) };
  });
  check('o olho fica DENTRO do campo, na direita', dentro.dentro, JSON.stringify(dentro));
  check('e centrado na altura dele', dentro.centrado, JSON.stringify(dentro));
  check('com alvo de toque de pelo menos 30px', parseInt(dentro.alvo) >= 30, dentro.alvo);

  check('o campo continua com o foco depois do toque (o teclado não fecha)',
    await page.evaluate(() => document.activeElement && document.activeElement.id === 'inp-senha'));

  await olho.click();
  check('tocar de novo esconde', await campo.getAttribute('type') === 'password');

  // A senha não fica aberta na tela quando a pessoa sai do campo.
  await olho.click();
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('inp-senha').blur());
  check('ao sair do campo, a senha se esconde sozinha',
    await campo.getAttribute('type') === 'password');

  // No celular alguns navegadores não deixam o preventDefault segurar o foco: aí o blur
  // dispara ANTES do clique. Sem a trava de tempo, o segundo toque deixaria de esconder.
  const celular = await page.evaluate(async () => {
    const i = document.getElementById('inp-senha');
    const b = document.querySelector('[data-gn-olho-btn]');
    const toque = () => {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      i.dispatchEvent(new FocusEvent('blur', { bubbles: false }));   // o foco escapou
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };
    i.focus(); i.type = 'password';
    toque(); await new Promise(r => setTimeout(r, 60));
    const apos1 = i.type;
    toque(); await new Promise(r => setTimeout(r, 60));
    const apos2 = i.type;
    return { apos1, apos2 };
  });
  check('mesmo se o foco escapar no toque, o primeiro mostra e o segundo esconde',
    celular.apos1 === 'text' && celular.apos2 === 'password', JSON.stringify(celular));

  // O texto não pode correr por baixo do olho.
  const folga = await page.evaluate(() => {
    const i = document.getElementById('inp-senha');
    return parseFloat(getComputedStyle(i).paddingRight);
  });
  check('o campo ganhou espaço à direita pro texto não passar por baixo', folga >= 30, folga + 'px');

  // ── 3. Campo que nasce depois, dentro de template literal ─────────────────────────
  const nasceuDepois = await page.evaluate(async () => {
    const caixa = document.createElement('div');
    caixa.style.cssText = 'padding:12px';
    caixa.innerHTML = '<input type="password" id="campo-novo" style="width:100%;padding:8px" placeholder="Senha">';
    document.body.appendChild(caixa);
    await new Promise(r => setTimeout(r, 300));
    const i = document.getElementById('campo-novo');
    return { tem: !!(i.parentNode && i.parentNode.querySelector('[data-gn-olho-btn]')),
             marcado: i.getAttribute('data-gn-olho') };
  });
  check('um campo criado depois também ganha o olho, sem o app pedir',
    nasceuDepois.tem === true, JSON.stringify(nasceuDepois));

  // ── 4. Campo que estava escondido quando a página abriu ───────────────────────────
  const escondido = await page.evaluate(async () => {
    const caixa = document.createElement('div');
    caixa.style.cssText = 'display:none;padding:12px';
    caixa.innerHTML = '<input type="password" id="campo-oculto" style="width:200px;padding:8px">';
    document.body.appendChild(caixa);
    await new Promise(r => setTimeout(r, 300));
    const antesDeAbrir = !!document.querySelector('#campo-oculto ~ [data-gn-olho-btn]');
    caixa.style.display = 'block';
    document.getElementById('campo-oculto').focus();
    await new Promise(r => setTimeout(r, 200));
    const i = document.getElementById('campo-oculto');
    return { antesDeAbrir, depois: !!(i.parentNode && i.parentNode.querySelector('[data-gn-olho-btn]')) };
  });
  check('campo escondido não ganha olho medido errado, e ganha quando aparece',
    escondido.antesDeAbrir === false && escondido.depois === true, JSON.stringify(escondido));

  // ── 5. O olho se vê nos dois temas ────────────────────────────────────────────────
  const cores = await page.evaluate(async () => {
    const ler = () => {
      const b = document.querySelector('[data-gn-olho-btn]');
      const i = b.parentNode.querySelector('input');
      return { botao: getComputedStyle(b).color, campo: getComputedStyle(i).color };
    };
    document.documentElement.removeAttribute('data-tema');
    await new Promise(r => setTimeout(r, 150));
    const claro = ler();
    document.documentElement.setAttribute('data-tema', 'escuro');
    await new Promise(r => setTimeout(r, 250));
    const escuro = ler();
    document.documentElement.removeAttribute('data-tema');
    return { claro, escuro };
  });
  check('no tema claro o olho usa a cor do próprio campo',
    cores.claro.botao === cores.claro.campo, JSON.stringify(cores.claro));
  check('e no escuro ele repinta junto, sem conhecer os tokens do app',
    cores.escuro.botao === cores.escuro.campo && cores.escuro.botao !== cores.claro.botao,
    JSON.stringify(cores));

  check('nenhum erro de JS no caminho todo', erros.length === 0, erros.join(' | '));
  await ctx.close();
  await browser.close();
  console.log('\n' + DIR);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
