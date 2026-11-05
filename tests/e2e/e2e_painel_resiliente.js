// "Tem algo estranho: agora pra voltar a aparecer tenho que sair e entrar novamente, não era
//  assim." — o Painel de Gestão sumindo inteiro, sem título, sem erro na tela.
//
// Não consegui reproduzir a causa exata, então o alvo aqui é outro: garantir que esse MODO de
// falhar não exista mais. Duas proteções:
//   1. O painel é UMA atribuição de innerHTML com quatro cards dentro. Um card que estourasse
//      levava o painel todo — tela vazia, sem título, sem erro visível. Agora cada card é
//      isolado.
//   2. _loadDashAll tem o guard `if (_dashLoading) return`. Se uma carga ficava pendurada,
//      toda carga seguinte era descartada na porta, e só o botão Atualizar destravava — entrar
//      de novo na Home não. Agora showHome destrava igual.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => {
    try { return typeof showHome === 'function' && typeof renderDashboard === 'function'; }
    catch (e) { return false; }
  }, { timeout: 25000 });

  const temProtecao = await page.evaluate(() => {
    try { return typeof _dashCardsComErro !== 'undefined'; } catch (e) { return false; }
  });
  if (!temProtecao) {
    console.log('FALHOU: a proteção do painel não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 9 falhou');
    await browser.close(); process.exit(1);
  }

  const mestre = () => page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    masterLoja = null;
  });

  // ── 1. Um card quebrado não leva o painel junto ────────────────────────────────────
  await mestre();
  const comCardQuebrado = await page.evaluate(() => {
    const original = window._buildAlertasUrgentesCard;
    window._buildAlertasUrgentesCard = () => { throw new Error('card estourou de propósito'); };
    _dashCardsComErro = {};
    const el = document.getElementById('dash-section');
    el.style.display = 'block'; el.innerHTML = '';
    let erroFatal = null;
    try { renderDashboard(); } catch (e) { erroFatal = String(e); }
    window._buildAlertasUrgentesCard = original;
    return { erroFatal, html: el.innerHTML, registrado: _dashCardsComErro.alertas || null };
  });
  check('renderDashboard não estoura quando um card falha', comCardQuebrado.erroFatal === null);
  check('o PAINEL DE GESTÃO continua na tela (era isso que sumia)',
    /Painel de Gestão/.test(comCardQuebrado.html) && comCardQuebrado.html.length > 5000);
  check('no lugar do card quebrado fica um aviso, não um buraco mudo',
    /não pôde ser montado/.test(comCardQuebrado.html) && /alertas/.test(comCardQuebrado.html));
  check('e o motivo fica registrado pra diagnóstico',
    /card estourou de propósito/.test(comCardQuebrado.registrado || ''));
  check('os outros cards e as abas do painel continuam montados',
    /Faturamento/.test(comCardQuebrado.html) && /dash-tab/.test(comCardQuebrado.html));

  // ── 2. Carga pendurada não trava as próximas ──────────────────────────────────────
  await mestre();
  const destrava = await page.evaluate(() => {
    // Simula o estado em que uma carga anterior ficou pendurada e nunca liberou o guard.
    _dashLoading = true;
    _dashLoadedAt = null;
    const el = document.getElementById('dash-section');
    el.style.display = 'none'; el.innerHTML = '';
    showHome(session);
    return { display: el.style.display, painel: /Painel de Gestão/.test(el.innerHTML) };
  });
  await page.waitForTimeout(900);
  // Se o guard tivesse barrado, _loadDashAll teria voltado na porta: _dashLoadedAt ficaria
  // null pra sempre e o painel nunca receberia dados.
  const carregou = await page.evaluate(() => ({ loadedAt: !!_dashLoadedAt, loading: _dashLoading }));
  check('entrar na Home destrava a carga travada (antes só o botão Atualizar fazia isso)',
    carregou.loadedAt === true && carregou.loading === false);
  check('e o painel aparece já no primeiro desenho, com o título',
    destrava.display === 'block' && destrava.painel === true);

  // ── 3. Resposta estranha do banco não envenena o painel ───────────────────────────
  // Era o caminho mais provável pro sintoma: _dashUsuariosAtivos recebia o que viesse de
  // gn_usuarios_publico sem conferir. Qualquer coisa que não fosse lista fazia o .filter()
  // dos destinatários estourar em TODO render seguinte — e o painel inteiro ia junto.
  await ctx.route('**/rest/v1/gn_usuarios_publico**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  const envenenado = await page.evaluate(async () => {
    session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    masterLoja = null;
    _dashUsuariosAtivos = [];
    _dashAlertasUrgentes = [{ id: 1, loja: 'BANGU', cargos: ['gerente'], resolvido: false,
      criado_por: 'Tiago', criado_em: new Date().toISOString(), motivo: 'x' }];
    await _carregarLeiturasAlertas();
    const el = document.getElementById('dash-section');
    el.style.display = 'block'; el.innerHTML = '';
    let erro = null;
    try { renderDashboard(); } catch (e) { erro = String(e); }
    return { tipo: Array.isArray(_dashUsuariosAtivos) ? 'lista' : typeof _dashUsuariosAtivos,
             erro, painel: /Painel de Gestão/.test(el.innerHTML),
             cardOk: !/não pôde ser montado/.test(el.innerHTML) };
  });
  check('resposta que não é lista vira lista vazia, em vez de envenenar o estado',
    envenenado.tipo === 'lista');
  check('e o painel desenha normalmente, sem card quebrado',
    envenenado.erro === null && envenenado.painel === true && envenenado.cardOk === true);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
