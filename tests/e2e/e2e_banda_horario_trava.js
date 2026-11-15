// 15/11/2026 — "a apresentação de hoje que ainda vai acontecer já está confirmada com a loja e
// lançado o couver... tá errado." Norte Shopping: o trio de domingo (13h) foi confirmado às
// 0h14 (a sub ainda fechava o sábado, mas o Check-list já estava no domingo) e ganhou o
// couvert de sábado às 8h49.
//
//  1. Presença só a partir de 2 h antes do início; couvert só depois do início.
//  2. Entre 0h e 5h, quem está no dia de hoje é avisado e volta pra ontem com um toque.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

const SHOW = { id: 'show-dom', data: '2026-11-15', horario_inicio: '13:00', horario_fim: '17:00', loja: 'norte_shopping',
  artista: 'Trio Alma Brasileira', cache: 800, presenca_confirmada: false, banda_nao_veio: false, couver_qtd: 0, couver_valor: 0, couver_lancado_em: null };

async function abrir(browser, iso) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, iso);
  const gravou = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    if (/gn_trios_agenda/.test(req.url()) && req.method() === 'PATCH') { gravou.push(JSON.parse(req.postData() || '{}')); return r.fulfill({ status: 204, body: '' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  const alertas = []; page.on('dialog', d => { alertas.push(d.message()); d.accept(); });
  await page.goto('file://' + ARQ);
  await CAMINHOS.esperarApp(page, ['_renderBandaHoje'], ['_confirmarPresencaBandaCard', '_salvarCouvertBandaHoje'], 25000);
  return { ctx, page, gravou, erros, alertas };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todosErros = [];

  // ── 0h14 de domingo: o que aconteceu no Norte Shopping ──
  let a = await abrir(browser, '2026-11-15T00:14:00');
  if (!(await a.page.evaluate(() => typeof _bandaPresencaLiberaEm === 'function'))) {
    console.log('FALHOU: a trava pelo horário do show não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  let r = await a.page.evaluate(async (show) => {
    _triosHojeRecords = [Object.assign({}, show)]; _triosHojeRecord = _triosHojeRecords[0];
    const card = _bandaHojeCardHtml(_triosHojeRecords[0]);
    const couv = _bandaHojeCouvertHtml(_triosHojeRecords);
    await _confirmarPresencaBandaCard('show-dom');
    document.body.insertAdjacentHTML('beforeend', '<input id="banda-hoje-qtd" value="133"><input id="banda-hoje-valor" value="931"><button id="banda-hoje-btn"></button>');
    await _salvarCouvertBandaHoje();
    return { card, couv, conf: _triosHojeRecords[0].presenca_confirmada };
  }, SHOW);
  check('0h14, show às 13h: o botão de presença vem travado, dizendo que libera às 11:00', /🔒 Libera às 11:00/.test(r.card) && /disabled/.test(r.card) && /a partir das 11:00/.test(r.card), r.card.slice(0, 300));
  check('…e tocar mesmo assim não confirma (nada gravado, aviso na tela)', a.gravou.length === 0 && r.conf === false && /a partir das 11:00/.test(a.alertas[0] || ''), { gravou: a.gravou, alertas: a.alertas });
  check('o couvert vem travado até o início do show (13:00)', /🔒 Libera às 13:00/.test(r.couv) && /depois que o show começa/.test(r.couv), r.couv.slice(-400));
  check('…e salvar mesmo assim não grava (o couvert de sábado não cai no domingo)', a.gravou.length === 0 && /libera às 13:00/.test(a.alertas[1] || ''), a.alertas);
  todosErros.push(...a.erros); await a.ctx.close();

  // ── 12h26: a banda chegou (como o Felix confirmou em 07/11) ──
  a = await abrir(browser, '2026-11-15T12:26:00');
  r = await a.page.evaluate(async (show) => {
    _triosHojeRecords = [Object.assign({}, show)]; _triosHojeRecord = _triosHojeRecords[0];
    const card = _bandaHojeCardHtml(_triosHojeRecords[0]);
    await _confirmarPresencaBandaCard('show-dom');
    return { card, couv: _bandaHojeCouvertHtml(_triosHojeRecords), conf: _triosHojeRecords[0].presenca_confirmada };
  }, SHOW);
  check('12h26 (34 min antes, banda chegando): confirma a presença normalmente', !/Libera às/.test(r.card) && a.gravou.length === 1 && a.gravou[0].presenca_confirmada === true && r.conf === true, a.gravou);
  check('…mas o couvert ainda espera o show começar', /🔒 Libera às 13:00/.test(r.couv));
  todosErros.push(...a.erros); await a.ctx.close();

  // ── 17h30: show acontecendo/acabou ──
  a = await abrir(browser, '2026-11-15T17:30:00');
  r = await a.page.evaluate(async (show) => {
    _triosHojeRecords = [Object.assign({}, show, { presenca_confirmada: true })]; _triosHojeRecord = _triosHojeRecords[0];
    const couv = _bandaHojeCouvertHtml(_triosHojeRecords);
    document.body.insertAdjacentHTML('beforeend', '<input id="banda-hoje-qtd" value="120"><input id="banda-hoje-valor" value="840"><button id="banda-hoje-btn"></button>');
    await _salvarCouvertBandaHoje();
    return { couv };
  }, SHOW);
  check('depois do início, o couvert é lançado normalmente', !/Libera às/.test(r.couv) && /💾 Salvar Couvert/.test(r.couv) && a.gravou.length === 1 && Number(a.gravou[0].couver_valor) === 840, a.gravou);
  todosErros.push(...a.erros); await a.ctx.close();

  // ── Dia que já passou e show sem horário ficam livres ──
  a = await abrir(browser, '2026-11-16T09:00:00');
  r = await a.page.evaluate((show) => ({
    passado: _bandaPresencaLiberaEm(show) === null && _bandaCouvertLiberaEm([show]) === null,
    semHora: _bandaPresencaLiberaEm(Object.assign({}, show, { data: '2026-11-20', horario_inicio: null })) === null,
  }), SHOW);
  check('lançamento atrasado (show de ontem) continua liberado', r.passado);
  check('show sem horário na agenda não trava (não há o que comparar)', r.semHora);
  todosErros.push(...a.erros); await a.ctx.close();

  // ── Madrugada: aviso pra voltar pro dia de ontem ──
  a = await abrir(browser, '2026-11-15T00:10:00');
  r = await a.page.evaluate(async () => {
    state.data = hojeLocal(); _dadosDiaBotoes();
    const el = document.getElementById('aviso-madrugada');
    const visivel = el && el.style.display !== 'none' ? el.innerText : '';
    return { visivel };
  });
  check('0h10, Check-list no dia 15/11: aparece o aviso com "Voltar pro 14/11"', /meia-noite — você está no dia 15\/11/.test(r.visivel) && /Voltar pro 14\/11/.test(r.visivel), r.visivel);
  // Sem login a página fica escondida atrás da tela de entrada — dispara o botão pelo DOM.
  await a.page.evaluate(() => [...document.querySelectorAll('#aviso-madrugada button')].find(b => /Voltar pro 14\/11/.test(b.textContent)).click());
  await a.page.waitForTimeout(800);
  r = await a.page.evaluate(() => ({ data: state.data, aviso: document.getElementById('aviso-madrugada').style.display }));
  check('…o botão leva pro dia 14/11 e o aviso some', r.data === '2026-11-14' && r.aviso === 'none', r);
  r = await a.page.evaluate(() => { state.data = hojeLocal(); _dadosDiaBotoes(); const v1 = document.getElementById('aviso-madrugada').style.display;
    _avisoMadrugadaOk(); return { antes: v1, depois: document.getElementById('aviso-madrugada').style.display }; });
  check('"Já é o 15/11" esconde o aviso (abertura de madrugada existe)', r.antes === '' && r.depois === 'none', r);
  todosErros.push(...a.erros); await a.ctx.close();

  a = await abrir(browser, '2026-11-15T09:00:00');
  r = await a.page.evaluate(() => { state.data = hojeLocal(); _dadosDiaBotoes(); return document.getElementById('aviso-madrugada').style.display; });
  check('de manhã (9h) o aviso não aparece', r === 'none', r);
  todosErros.push(...a.erros); await a.ctx.close();

  check('nenhum erro de JavaScript', todosErros.length === 0, todosErros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
