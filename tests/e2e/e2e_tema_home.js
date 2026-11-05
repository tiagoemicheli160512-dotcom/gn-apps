// "Quero replicar em todo o app sim, com essa opção de alterar pro claro ou escuro.
//  App home lojas, painel de gestão. Todos."
//
// O Painel não tinha camada de tokens: 1.691 cores escritas à mão, e a mesma #1A1D23
// repetida 239 vezes. A escala de pretos translúcidos (.6, .45, .3…) era a hierarquia de
// texto disfarçada. Criar a camada veio antes de escurecer qualquer coisa.
//
// O risco é o mesmo do Check-list e não é quebrar: é texto invisível sobre fundo invisível,
// que não dá erro nenhum. Então o teste percorre cada elemento visível de cada aba do
// Painel, resolve a cor REAL do texto e a do fundo atrás dele, e mede o contraste.
//
// E repete a lição que o usuário me deu no Check-list: não basta o botão EXISTIR. Ele
// precisa estar visível e tocável na largura do aparelho — lá eu o pus na barra lateral,
// que só existe a partir de 768px, e entreguei um botão que no celular não era desenhado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const MEDIDOR = () => {
  const num = c => { const m = (c || '').match(/[\d.]+/g) || []; return m.map(Number); };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const razao = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const fundoDe = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs2 = getComputedStyle(n);
      const v = num(cs2.backgroundColor);
      if (v.length >= 3 && (v.length < 4 || v[3] > 0.5)) return v.slice(0, 3);
      // Gradiente: backgroundColor vem transparente e a busca seguia subindo, medindo
      // contra o fundo errado. Aproxima pela MÉDIA das paradas de cor — foi um gradiente
      // claro com texto claro em cima que passou batido por aqui.
      const bi = cs2.backgroundImage || '';
      if (/gradient/.test(bi)) {
        const paradas = bi.match(/rgba?\([^)]+\)/g) || [];
        const solidas = paradas.map(num).filter(c => c.length >= 3 && (c.length < 4 || c[3] > 0.5));
        if (solidas.length) return [0, 1, 2].map(i => Math.round(solidas.reduce((s2, c) => s2 + c[i], 0) / solidas.length));
      }
      n = n.parentElement;
    }
    const v = num(getComputedStyle(document.body).backgroundColor);
    return v.length >= 3 ? v.slice(0, 3) : [255, 255, 255];
  };
  const ruins = [];
  for (const el of document.querySelectorAll('*')) {
    if (!el.getClientRects().length) continue;
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!txt) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.3) continue;
    // Texto translúcido NÃO é pulado: ele é COMPOSTO sobre o fundo, que é o que o olho
    // vê. Pular rgba(0,0,0,.22) fazia duas coisas ruins — escondia texto de verdade que
    // está fraco, e na comparação com o arquivo antigo fazia um texto que MELHOROU (de
    // translúcido pra token opaco) aparecer como "não existia antes", ou seja, regressão.
    let cor = num(cs.color);
    if (cor.length >= 4 && cor[3] === 0) continue;   // invisível de propósito, não é ilegível
    if (cor.length >= 4 && cor[3] < 1) {
      const f = fundoDe(el), al = cor[3];
      cor = [0, 1, 2].map(i => Math.round(cor[i] * al + f[i] * (1 - al)));
    }
    const r = razao(cor.slice(0, 3), fundoDe(el));
    if (r < 3.0) ruins.push({ txt: txt.slice(0, 42), cor: cs.color, fundo: 'rgb(' + fundoDe(el).join(',') + ')', r: +r.toFixed(2) });
  }
  return ruins;
};

const ABAS = ['fat', 'att', 'ferias', 'xadrez', 'bi', 'barris', 'dre', 'metas'];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try {
      return typeof showHome === 'function' && typeof renderDashboard === 'function' && typeof gnTrocarTema === 'function';
    } catch (e) { return false; } }, { timeout: 15000 }); break; }
    catch (e) { if (t >= 5) throw new Error('o Home não carregou em 5 tentativas'); }
  }

  const entrar = (pg) => pg.evaluate(async () => {
    const sess = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    session = sess; masterLoja = '';
    window.gnFetchJson = async (u, h, c, fb) => fb;
    showHome(sess);
    await new Promise(r => setTimeout(r, 500));
    const el = document.getElementById('dash-section');
    if (el) el.style.display = 'block';
  });
  await entrar(page);

  // ── O botão ──────────────────────────────────────────────────────────────────────────
  const padrao = await page.evaluate(() => document.documentElement.getAttribute('data-tema'));
  check('o Painel abre no claro por padrão', padrao === null);

  const vis = await page.evaluate(() => {
    const b = document.querySelector('[data-botao-tema]');
    if (!b) return { existe: false };
    const r = b.getBoundingClientRect();
    return { existe: true, naTela: r.width > 18 && r.height > 18 && r.top >= 0 && r.left >= 0 && r.right <= innerWidth,
             w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('o botão do tema existe no Painel', vis.existe === true);
  check('e está visível e tocável a 390px (a lição do Check-list)', vis.naTela === true);
  if (vis.existe && !vis.naTela) console.log(`      medido: ${vis.w}x${vis.h}`);

  const trocou = await page.evaluate(() => { gnTrocarTema();
    return { attr: document.documentElement.getAttribute('data-tema'),
             guardado: localStorage.getItem('gn_tema'),
             icone: document.querySelector('[data-botao-tema]').textContent.trim(),
             barra: (document.querySelector('meta[name="theme-color"]') || {}).content }; });
  check('o botão liga o escuro', trocou.attr === 'escuro');
  check('guardando no aparelho, com a chave compartilhada entre os apps', trocou.guardado === 'escuro');
  check('o ícone vira o de voltar pro claro', trocou.icone === '☀️');
  check('e a barra do sistema acompanha', /14171C/i.test(trocou.barra || ''));

  const claroDeVolta = await page.evaluate(() => { gnTrocarTema();
    return (document.querySelector('meta[name="theme-color"]') || {}).content; });
  // O Painel declara o amarelo da identidade dele no theme-color. O arquivo compartilhado
  // não pode trocar isso por um cinza genérico no tema claro — ninguém pediu.
  check('voltando pro claro, a barra volta pro AMARELO do Painel, não um cinza genérico',
    /FACC15/i.test(claroDeVolta || ''));

  // ── Dá pra ler? ──────────────────────────────────────────────────────────────────────
  const varrer = async (pg) => {
    // Esperar a TRANSIÇÃO acabar antes de medir. Vários apps têm
    // `transition:all .15s` nos chips e botões: medir no mesmo instante em que o tema
    // troca pega a cor NO MEIO do caminho, e o teste acusa (ou esconde) um contraste
    // que não existe em tela parada. Duas rodadas seguidas davam números diferentes.
    await pg.waitForTimeout(400);
    const achados = [];
    for (const aba of ABAS) {
      await pg.evaluate(async (a) => { try { _setDashTab(a); } catch (e) {}
        await new Promise(r => setTimeout(r, 120)); window.scrollTo(0, 0); }, aba);
      await pg.waitForTimeout(140);
      const ruins = await pg.evaluate(MEDIDOR);
      if (ruins.length) achados.push({ aba, ruins });
    }
    return achados;
  };

  await page.evaluate(() => gnTema.aplicar('escuro'));
  const escuro = await varrer(page);
  check('nenhum texto ilegível no tema ESCURO, em nenhuma aba do Painel', escuro.length === 0);
  for (const a of escuro.slice(0, 6)) {
    console.log(`      aba "${a.aba}" — ${a.ruins.length} caso(s):`);
    a.ruins.slice(0, 5).forEach(x => console.log(`        contraste ${x.r}:1  "${x.txt}"  cor ${x.cor} sobre ${x.fundo}`));
  }

  // ── E no claro, nada pode ter piorado ────────────────────────────────────────────────
  // Padrão absoluto não serve: o Painel que está NO AR já tem casos abaixo de 3:1. O que
  // importa é a regressão, medida contra o próprio arquivo do origin/main.
  await page.evaluate(() => gnTema.aplicar('claro'));
  const claro = await varrer(page);

  const BASE = process.env.ARQ_BASE || CAMINHOS.BASE_HOME;
  const pb = await ctx.newPage();
  for (let t = 1; ; t++) {
    await pb.goto('file://' + BASE);
    try { await pb.waitForFunction(() => { try { return typeof showHome === 'function' && typeof renderDashboard === 'function'; } catch (e) { return false; } }, { timeout: 15000 }); break; }
    catch (e) { if (t >= 5) throw new Error('o arquivo de comparação não carregou'); }
  }
  await entrar(pb);
  // O arquivo de comparação abre no MESMO contexto e herdaria o gn_tema='escuro' guardado
  // acima — eu mediria o escuro achando que era o claro, e o escuro está limpo.
  await pb.evaluate(() => document.documentElement.removeAttribute('data-tema'));
  const baseRuins = {};
  for (const aba of ABAS) {
    await pb.evaluate(async (a) => { try { _setDashTab(a); } catch (e) {}
      await new Promise(r => setTimeout(r, 120)); window.scrollTo(0, 0); }, aba);
    await pb.waitForTimeout(140);
    for (const x of await pb.evaluate(MEDIDOR)) {
      const k = aba + '|' + x.txt;
      if (baseRuins[k] === undefined || x.r < baseRuins[k]) baseRuins[k] = x.r;
    }
  }
  await pb.close();

  const piorou = [];
  for (const a of claro) for (const x of a.ruins) {
    const antes = baseRuins[a.aba + '|' + x.txt];
    if (antes === undefined || x.r < antes - 0.01) piorou.push({ ...x, aba: a.aba, antes: antes === undefined ? 'não existia' : antes });
  }
  const chavesAgora = new Set();
  claro.forEach(a => a.ruins.forEach(x => chavesAgora.add(a.aba + '|' + x.txt)));
  check(`no tema CLARO nada piorou (o que está no ar já tinha ${Object.keys(baseRuins).length} caso(s))`, piorou.length === 0);
  piorou.slice(0, 8).forEach(x => console.log(`      aba "${x.aba}" "${x.txt}": era ${x.antes}:1, ficou ${x.r}:1`));
  console.log(`      (no claro: ${Object.keys(baseRuins).length} antes, ${chavesAgora.size} depois)`);

  const errosReais = erros.filter(e => !/createClient|Failed to fetch/.test(e));
  check('nenhum erro de JS', errosReais.length === 0);
  errosReais.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
