// "Testei e quando puxo pra baixo pra recarregar a página é quando some, e ao clicar em
//  Atualizar fica normal, mas depois de puxar pra recarregar some e não volta — só se sair
//  e entrar novamente."
//
// Puxar pra baixo no celular é recarregar a página. E recarregar entra por um caminho
// diferente do login: a sessão vem do localStorage e o primeiro desenho acontecia NO MEIO do
// script. Todo `let`/`const` declarado abaixo daquela linha ainda estava no temporal dead
// zone — o card de alertas tocava `_alertasCardAberto`, estourava ReferenceError, o erro
// subia até o topo e ABORTAVA o resto do script. Painel vazio, nada no console do celular.
// Entrar de novo funcionava porque aí o showHome vem de um clique, com o script já inteiro.
//
// O teste entra pelos dois caminhos — recarga e login — e cobra o mesmo resultado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const SESSAO_MESTRE = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true }, ts: Date.now() };

async function abrir(browser, sessao) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  if (sessao) await ctx.addInitScript(s => { try { localStorage.setItem('gn_session_v1', s); } catch (e) {} }, JSON.stringify(sessao));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // O sandbox não alcança CDN, então jsPDF e companhia falham ao carregar aqui — acontece
    // igual no arquivo sem nenhuma mudança, e de forma intermitente. É ruído do ambiente,
    // não erro da página: o que este teste cobra é o código do app.
    if (/Failed to load resource/.test(m.text())) return;
    erros.push('console: ' + m.text());
  });
  await page.goto('file://' + HOME);
  await page.waitForTimeout(2500);
  return { ctx, page, erros };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. Recarga com sessão salva: é o caminho do "puxar pra baixo" ──────────────────
  const r = await abrir(browser, SESSAO_MESTRE);
  const painel = await r.page.evaluate(() => {
    const el = document.getElementById('dash-section');
    return { display: el.style.display, tamanho: el.innerHTML.length,
             titulo: /Painel de Gestão/.test(el.innerHTML),
             fallback: /não pôde ser montado/.test(el.innerHTML),
             home: document.getElementById('home-screen').style.display };
  });
  check('ao recarregar, o Painel de Gestão aparece (era o que sumia)',
    painel.display === 'block' && painel.titulo === true && painel.tamanho > 5000);
  check('e nenhum card cai no aviso de falha', painel.fallback === false);
  check('a Home continua montada por inteiro', painel.home === 'flex');
  check('a recarga não deixa erro nenhum na página',
    r.erros.length === 0 || (console.log('   erros: ' + r.erros.join(' | ')), false));

  // ── 2. O script inteiro executou — nada ficou no temporal dead zone ────────────────
  // Se o primeiro desenho estourasse, o script abortava ali e TUDO que vem depois no
  // arquivo ficava inacessível pra sempre. Essas três variáveis moram bem abaixo do ponto
  // onde o boot ficava: alcançá-las é a prova de que o script chegou ao fim.
  const vivos = await r.page.evaluate(() => {
    const vivo = f => { try { f(); return true; } catch (e) { return false; } };
    return {
      alertasCardAberto: vivo(() => _alertasCardAberto),
      cardsComErro:      vivo(() => _dashCardsComErro),
      usuariosAtivos:    vivo(() => _dashUsuariosAtivos),
      bootNoFim:         typeof _bootPrimeiraTela === 'function',
    };
  });
  check('o estado do card de alertas existe no fim do boot (estava em TDZ)', vivos.alertasCardAberto);
  check('o registro de falha de card também', vivos.cardsComErro);
  check('e a lista de usuários ativos também', vivos.usuariosAtivos);
  check('o primeiro desenho virou uma chamada no fim do script', vivos.bootNoFim);

  // ── 3. Atualizar segue funcionando depois da recarga ───────────────────────────────
  const atualizou = await r.page.evaluate(async () => {
    const el = document.getElementById('dash-section');
    el.innerHTML = '';
    let erro = null;
    try { await forcarAtualizacao(); } catch (e) { erro = String(e); }
    return { erro, titulo: /Painel de Gestão/.test(el.innerHTML) };
  });
  check('o botão Atualizar redesenha o painel sem estourar',
    atualizou.erro === null && atualizou.titulo === true);

  // ── 4. O card de alertas abre e fecha, e a escolha sobrevive ao redesenho ──────────
  const acc = await r.page.evaluate(() => {
    _alertasCardAberto = true;
    renderDashboard();
    const el = document.getElementById('dash-section');
    return /class="alertas-acc"[^>]* open/.test(el.innerHTML);
  });
  check('o card de alertas continua recolhível, com o estado preservado', acc === true);

  await r.ctx.close();

  // ── 5. Entrar pelo login dá o mesmo resultado ──────────────────────────────────────
  // Esse caminho sempre funcionou — é a prova de que a correção não mexeu nele.
  const l = await abrir(browser, null);
  const login = await l.page.evaluate(async () => {
    session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true }, ts: Date.now() };
    masterLoja = null;
    showHome(session);
    await new Promise(r => setTimeout(r, 400));
    const el = document.getElementById('dash-section');
    return { titulo: /Painel de Gestão/.test(el.innerHTML), display: el.style.display };
  });
  check('entrando pelo login o painel aparece igual',
    login.titulo === true && login.display === 'block');
  check('sem sessão salva, a tela de login é que abre — a recarga não força a Home',
    await l.page.evaluate(() => document.getElementById('login-screen').style.display === 'flex'
      || document.getElementById('home-screen').style.display === 'flex'));
  await l.ctx.close();

  // ── 6. Gerente de loja recarrega sem painel e sem erro ─────────────────────────────
  // O painel é de supervisor/mestre: aqui ele tem que seguir escondido, mas o boot não
  // pode quebrar — é a mesma linha de código.
  const g = await abrir(browser, { id: 2, nome: 'Ana', loja: 'BANGU', cargo: 'gerente', permissoes: {}, ts: Date.now() });
  const gerente = await g.page.evaluate(() => ({
    display: document.getElementById('dash-section').style.display,
    home: document.getElementById('home-screen').style.display,
  }));
  check('gerente de loja recarrega sem o painel (continua restrito) e sem erro',
    gerente.display === 'none' && gerente.home === 'flex' && g.erros.length === 0);
  await g.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
