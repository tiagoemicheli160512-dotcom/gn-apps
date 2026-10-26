// A conta já está coberta pelo e2e_meio_turno.js. Este aqui cobre o que o usuário pediu
// explicitamente e que nenhum teste de cálculo pega: "ao selecionar essa opção de meio
// turno TEM QUE APARECER O COLETOR para dia ou noite".
//
// E cobre a armadilha deste arquivo: 23 funções estão declaradas duas vezes, com corpos
// diferentes, e quem vale é a SEGUNDA. Mexer na cópia errada não dá erro nenhum — a tela
// simplesmente não muda. Por isso aqui tudo é conferido pelo DOM de verdade, clicando.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-comissoes.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + extra); };
const perto = (a, b) => Math.abs(a - b) < 0.02;
const num = (t) => parseFloat(String(t).replace(/\./g, '').replace(',', '.')) || 0;

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => {
    const u = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'BANGU',
                permissoes: { master: true, comissoes: true }, ts: Date.now() };
    try { localStorage.setItem('gn_session_v1', JSON.stringify(u));
      localStorage.setItem('gn_BANGU_usuario', JSON.stringify('Tiago'));
      localStorage.setItem('gn_aviso_guia_v1', '1'); } catch (e) {}
  });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));

  await page.goto('file://' + ARQ);
  // TABS é const avaliado na ordem, no fim do bloco — declaração de função é içada e
  // existe com o script ainda no meio da execução.
  // TABS sozinho nao prova que o script terminou — LOJA e selecionarLoja sao usados logo
  // abaixo e vinham depois. Sob carga isso virava timeout no reload.
  await CAMINHOS.esperarApp(page, ['TABS', 'LOJA'], ['selecionarLoja'], 15000);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    try { if (!LOJA) selecionarLoja('BANGU', 'Bangu'); } catch (e) {}
    try { document.getElementById('seletor-loja').style.display = 'none';
      document.getElementById('login').style.display = 'none';
      document.getElementById('app').style.display = 'flex'; } catch (e) {}
    // Uma segunda de R$ 1.000 e duas pessoas cadastradas: cota do dia = 900 / 2 = 450.
    const wd = getWD(state.semIdx);
    wd.brutos = [1000, 0, 0, 0, 0, 0, 0];
    wd.funcs[0] = { ...wd.funcs[0], nome: 'Ana',   dias: Array(7).fill('PRESENTE') };
    wd.funcs[1] = { ...wd.funcs[1], nome: 'Bruno', dias: Array(7).fill('PRESENTE') };
    setWD(state.semIdx, wd);
    setTab('funcs');
    state.expanded = { 0: true, 1: true };
    render();
  });
  await page.waitForTimeout(400);

  const cel = (i, d) => `#fc-${i} .dias-g > .dia-c:nth-child(${d + 1})`;

  check('a opção Meio Turno existe no seletor do dia', await page.evaluate(() =>
    [...document.querySelectorAll('#fc-1 .dia-sel')][0].options.length > 0 &&
    [...document.querySelectorAll('#fc-1 .dia-sel')][0].options.some(o => o.value === 'MEIO TURNO')
  ).catch(() => page.evaluate(() => {
    const sel = document.querySelector('#fc-1 .dia-sel');
    return !!sel && [...sel.options].some(o => o.value === 'MEIO TURNO');
  })));

  check('antes de marcar, não existe coletor de turno nenhum na tela',
    (await page.locator('.turno-sel').count()) === 0);

  const antesVal = await page.locator(`${cel(1, 0)} .dia-val`).textContent();
  check('a cota cheia da segunda é 450,00 (900 ÷ 2)', perto(num(antesVal), 450), 'tela: ' + antesVal);

  // ── O pedido: marcar meio turno faz o coletor aparecer ──────────────────────────────
  await page.selectOption(`${cel(1, 0)} .dia-sel`, 'MEIO TURNO');
  await page.waitForTimeout(350);

  const coletor = page.locator(`${cel(1, 0)} .turno-sel`);
  check('ao marcar MEIO TURNO, o coletor de turno APARECE no mesmo dia',
    (await coletor.count()) === 1, 'coletores na tela: ' + (await page.locator('.turno-sel').count()));
  check('e ele está visível e tocável a 390px', await coletor.count() ? await coletor.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 12 && r.left >= 0 && r.right <= innerWidth;
  }) : false);
  check('o coletor oferece dia e noite, e nasce em Dia',
    JSON.stringify(await page.evaluate(() => { const s = document.querySelector('.turno-sel');
      return s ? { ops: [...s.options].map(o => o.value), v: s.value } : null; }))
      === JSON.stringify({ ops: ['DIA', 'NOITE'], v: 'DIA' }));
  check('o coletor não vaza pros outros dias nem pros outros funcionários',
    (await page.locator('.turno-sel').count()) === 1);

  // ── Dia paga 70% ────────────────────────────────────────────────────────────────────
  const vDia = await page.locator(`${cel(1, 0)} .dia-val`).textContent();
  check('meio turno DIA mostra 315,00 na tela (70% de 450)', perto(num(vDia), 315), 'tela: ' + vDia);

  // ── Noite paga 30% ──────────────────────────────────────────────────────────────────
  await page.selectOption(`${cel(1, 0)} .turno-sel`, 'NOITE');
  await page.waitForTimeout(350);
  const vNoite = await page.locator(`${cel(1, 0)} .dia-val`).textContent();
  check('trocando pra NOITE, a tela passa a 135,00 (30% de 450)', perto(num(vNoite), 135), 'tela: ' + vNoite);
  check('e o coletor continua lá, marcado em Noite',
    (await page.locator(`${cel(1, 0)} .turno-sel`).inputValue()) === 'NOITE');

  // ── O que sobrou foi pro rateio de quem tem direito ─────────────────────────────────
  const dados = await page.evaluate(() => {
    const wd = getWD(state.semIdx), c = calcSemana(wd, getSaldoAntes(state.semIdx));
    const [a, b] = c.funcCalc;
    return { pool: c.poolRateio, anaCota: a.cota, anaAF: a.AF, brunoAF: b.AF, turnoGravado: wd.funcs[1].turnos[0] };
  });
  check('o turno fica gravado no dado da semana', dados.turnoGravado === 'NOITE');
  check('os 315 que o meio turno noite não levou foram pro pool',
    perto(dados.pool, 315), 'pool=' + dados.pool.toFixed(2));
  check('e quem fez o turno inteiro recebeu esse dinheiro: cota maior que a cota base',
    dados.anaCota > dados.anaAF, 'base=' + dados.anaAF.toFixed(2) + ' cota=' + dados.anaCota.toFixed(2));

  // ── Desmarcar some com o coletor e devolve a cota cheia ─────────────────────────────
  await page.selectOption(`${cel(1, 0)} .dia-sel`, 'PRESENTE');
  await page.waitForTimeout(350);
  check('voltando pra PRESENTE, o coletor some', (await page.locator('.turno-sel').count()) === 0);
  check('e a cota do dia volta pros 450,00',
    perto(num(await page.locator(`${cel(1, 0)} .dia-val`).textContent()), 450));
  check('o turno guardado é apagado junto, pra não sobrar dado órfão',
    await page.evaluate(() => getWD(state.semIdx).funcs[1].turnos[0]) === null);

  // ── Sobreviver a um recarregamento ──────────────────────────────────────────────────
  await page.selectOption(`${cel(1, 0)} .dia-sel`, 'MEIO TURNO');
  await page.waitForTimeout(250);
  await page.selectOption(`${cel(1, 0)} .turno-sel`, 'NOITE');
  await page.waitForTimeout(350);

  // A GRAVAÇÃO é contrato do app e se confere aqui, direto no localStorage: setWD grava na
  // hora em gn_<LOJA>_allData. Antes isso só era cobrado de lado, pelo que aparecia depois
  // do reload — e aí quem falhava era o navegador, não o app (ver recarregarPreservando).
  const gravado = await page.evaluate(() => {
    try {
      const ad = JSON.parse(localStorage.getItem(`gn_${LOJA}_allData`) || 'null');
      const wd = ad && ad[String(state.semIdx)];
      return wd && wd.funcs && wd.funcs[1] && wd.funcs[1].turnos ? wd.funcs[1].turnos[0] : null;
    } catch (e) { return 'erro: ' + e.message; }
  });
  check('o turno vai pro localStorage na hora, não só pra memória',
    gravado === 'NOITE', 'no localStorage: ' + JSON.stringify(gravado));

  await CAMINHOS.recarregarPreservando(page);
  // TABS sozinho nao prova que o script terminou — LOJA e selecionarLoja sao usados logo
  // abaixo e vinham depois. Sob carga isso virava timeout no reload.
  await CAMINHOS.esperarApp(page, ['TABS', 'LOJA'], ['selecionarLoja'], 15000);
  await page.waitForTimeout(800);
  await page.evaluate(() => { try { setTab('funcs'); state.expanded = { 0: true, 1: true }; render(); } catch (e) {} });
  await page.waitForTimeout(400);
  check('depois de recarregar, o dia continua meio turno NOITE e o coletor volta marcado',
    (await page.locator(`${cel(1, 0)} .turno-sel`).count()) === 1 &&
    (await page.locator(`${cel(1, 0)} .turno-sel`).inputValue()) === 'NOITE');
  check('e o valor do dia continua 135,00',
    perto(num(await page.locator(`${cel(1, 0)} .dia-val`).textContent()), 135),
    'tela: ' + await page.locator(`${cel(1, 0)} .dia-val`).textContent());

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0);
  reais.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
