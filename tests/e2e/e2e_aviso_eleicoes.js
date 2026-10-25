// "Colocar msg no app home lojas falando sobre a importância de fazer uma boa escala devido
//  as eleições, planejar pra não passar sufoco. Colocar acima do card da informação de vendas."
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
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _renderVendaMesHome === 'function' && typeof LOJAS_LISTA !== 'undefined'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: o Home não carregou'); falhou++; await browser.close(); process.exit(1); } }
  }

  const existe = await page.evaluate(() => {
    // _eleicaoFase deixou de existir: as datas saíram do meio do gn-home.html e passaram a
    // vir do registro de avisos (public/gn-avisos.js). O contrato que este teste protege é o
    // CARD, não de onde vêm os dados — as 12 checagens abaixo seguem iguais.
    try { return typeof _renderAvisoEleicoesHome === 'function' && typeof gnAvisosAtivos === 'function'; }
    catch (e) { return false; }
  });
  if (!existe) {
    console.log('FALHOU: o aviso de eleição não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 12 falhou');
    await browser.close(); process.exit(1);
  }

  // ── 1. Onde o card fica ────────────────────────────────────────────────────────────
  const ordem = await page.evaluate(() => {
    const a = document.getElementById('eleicoes-escala-home-card');
    const b = document.getElementById('venda-mes-home-card');
    if (!a || !b) return null;
    // compareDocumentPosition: 4 = "b vem depois de a"
    return { existe: true, antes: !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  check('o aviso existe na Home', !!ordem && ordem.existe);
  check('e fica ACIMA do card de venda, como pedido', !!ordem && ordem.antes);

  const render = (dataISO, loja) => page.evaluate(({ dataISO, loja }) => {
    const Real = Date;
    // "Hoje" fixo: senão o teste passaria hoje e quebraria depois da eleição.
    class Fake extends Real {
      constructor(...a) { if (!a.length) return new Real(dataISO + 'T12:00:00'); return new Real(...a); }
      static now() { return new Real(dataISO + 'T12:00:00').getTime(); }
    }
    window.Date = Fake;
    try {
      masterLoja = null;
      _renderAvisoEleicoesHome(true, { nome: 'Carol', loja, cargo: 'gerente' }, false);
      return document.getElementById('eleicoes-escala-home-card').innerHTML;
    } finally { window.Date = Real; }
  }, { dataISO, loja });

  // ── 2. Antes do 1º turno ───────────────────────────────────────────────────────────
  const antes = await render('2026-10-02', 'BANGU');
  check('fala da escala e do planejamento, que é o pedido',
    /escala/i.test(antes) && /planeje agora/i.test(antes));
  check('traz a data do 1º turno (04/10) e diz que é domingo',
    /04\/10/.test(antes) && /1º turno, domingo/.test(antes));
  check('conta quantos dias faltam (02/10 → faltam 2)', /faltam 2 dias/.test(antes));
  check('lembra do horário das urnas, que é o que decide a janela de quem trabalha',
    /8h/.test(antes) && /17h/.test(antes));
  check('e avisa que ainda vem o 2º turno em 25/10', /2º turno em 25\/10/.test(antes));

  // ── 3. Véspera e dia ───────────────────────────────────────────────────────────────
  const vespera = await render('2026-10-03', 'BANGU');
  const dia = await render('2026-10-04', 'BANGU');
  check('na véspera diz "é amanhã"', /é amanhã/.test(vespera));
  check('no próprio domingo diz "é hoje" e continua no ar', /é hoje/.test(dia));

  // ── 4. Depois do 1º turno vira o 2º, e some depois dele ───────────────────────────
  const entre = await render('2026-10-07', 'BANGU');
  check('passado o 1º turno, o card passa a falar do 2º (25/10)',
    /25\/10/.test(entre) && /2º turno, domingo/.test(entre) && !/04\/10/.test(entre));
  check('e já não repete "ainda vem o 2º turno"', !/2º turno em/.test(entre));

  const depois = await render('2026-10-26', 'BANGU');
  check('depois do 2º turno o aviso some sozinho (não fica vencido na tela)', depois.trim() === '');

  // ── 5. Escopo ──────────────────────────────────────────────────────────────────────
  const maglia = await render('2026-10-02', 'MAGLIA');
  check('Maglia fica fora (CLAUDE.md — não foi citada no pedido)', maglia.trim() === '');
  const geral = await render('2026-10-02', 'GERAL');
  check('quem não está lotado numa loja não vê o aviso de escala', geral.trim() === '');
  const semSessao = await page.evaluate(() => {
    _renderAvisoEleicoesHome(true, null, false);
    return document.getElementById('eleicoes-escala-home-card').innerHTML;
  });
  check('sem sessão não desenha nada', semSessao.trim() === '');

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
