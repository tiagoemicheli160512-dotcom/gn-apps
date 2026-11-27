// Gorjetas › Saldo Pool (27/11/2026):
//  1. "Saldo retido atual" = saldo depois da semana ATUAL. Antes era depois da última semana do
//     calendário, e as semanas futuras (vazias, "distribuir tudo") zeravam a conta: R$ 0,00 com
//     dinheiro retido.
//  2. Saída não pode passar do saldo retido disponível. Antes o app aceitava qualquer valor e o
//     excesso saía do pool da semana seguinte — do rateio dos funcionários (Bangu S35: R$ 300 de
//     saída com R$ 90 retidos). Saída numa semana antiga cujo saldo já foi distribuído depois
//     refazia o rateio de semana paga: também bloqueada.
// Loja de exemplo, nada vai pro banco. Semana atual = S48 (relógio em 27/11/2026).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-comissoes.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };
const P = d => Array(7).fill('PRESENTE').map((x, i) => d && d[i] ? d[i] : x);
const FUNCS = [
  { nome: 'ANA', dias: P({ 1: 'FOLGA' }) }, { nome: 'BRUNO', dias: P({ 2: 'FOLGA' }) },
  { nome: 'CARLA', dias: P({ 0: 'FOLGA', 3: 'FALTA' }) }, { nome: 'DIEGO', dias: P({ 1: 'FOLGA' }) },
  { nome: 'ELISA', dias: P({ 2: 'FOLGA', 4: 'ATESTADO' }) }, { nome: 'FELIPE', tipo: 'JOVEM APRENDIZ', dias: P({ 0: 'FOLGA' }) },
  { nome: 'GABRIELA', dias: P({ 3: 'FOLGA' }) }, { nome: 'HUGO', dias: P({ 0: 'FOLGA' }) },
].map((f, i) => ({ id: i, tipo: 'CLT / MENSALISTA', ...f }));
const WEEK = (brutos, dist, vDist) => ({ brutos, funcs: JSON.parse(JSON.stringify(FUNCS)), dist, vDist, saldoSaida: 0, motivo: '', saidas: [] });
const B47 = [800, 600, 700, 900, 1500, 2200, 1800], B48 = [700, 650, 800, 950, 1600, 2300, 1900];

async function abrir(browser, S47, S48) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-27T16:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => r.request().method() !== 'GET' ? r.fulfill({ status: 204, body: '' }) : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  page.on('dialog', d => d.accept());
  for (let t = 1; ; t++) {
    await page.goto('file://' + ARQ);
    try { await page.waitForFunction(() => { try { return typeof renderSaldo === 'function' && typeof CAL !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('o app Gorjetas não carregou'); }
  }
  await page.evaluate(({ S47, S48 }) => {
    _syncNow = () => {}; carregarDaNuvem = async () => {}; _logAuditoriaCom = () => {};
    window.__toasts = []; showToast = m => window.__toasts.push(m);
    LOJA = 'LOJA TESTE'; LOJA_NOME = 'Loja Teste'; usuarioAtual = 'Ana'; abasPermitidas = null;
    const i = calcSemIdxAtual(); window.__i48 = i;
    state.allData = { [String(i - 1)]: { ...S47, semIdx: i - 1 }, [String(i)]: { ...S48, semIdx: i } };
    state.semIdx = i; state.tab = 'saldo';
    ['seletor-loja', 'login'].forEach(id => document.getElementById(id).style.display = 'none');
    document.getElementById('app').style.display = 'flex'; render();
  }, { S47, S48 });
  return { ctx, page, erros };
}
const estado = page => page.evaluate(() => {
  const i = window.__i48, c = idx => calcSemana(getWD(idx), getSaldoAntes(idx));
  const kpi = document.querySelector('.saldo-kpi-val');
  return { sem: CAL[i].num, kpi: kpi ? kpi.textContent.trim() : '', saidas47: getSaidasWD(getWD(i - 1)).map(x => x.valor), saidas48: getSaidasWD(getWD(i)).map(x => x.valor),
    ef48: Math.round(c(i).efetivo * 100) / 100, ret48: Math.round(c(i).retido * 100) / 100,
    disp47: (document.getElementById('sav-' + (i - 1)) || {}).textContent || '', disp48: (document.getElementById('sav-' + i) || {}).textContent || '',
    toast: window.__toasts.slice(-1)[0] || '' };
});
const saida = (page, off, v) => page.evaluate(([off, v]) => { const i = window.__i48 + off; document.getElementById('sv-' + i).value = v; document.getElementById('sm-' + i).value = 'Extra'; confirmarSaida(i); }, [off, v]);

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  // ── A: S47 retém tudo; S48 distribui R$ 1.200 e retém R$ 1.210,31 ──
  {
    const { ctx, page, erros } = await abrir(browser, WEEK(B47, 'NÃO', 0), WEEK(B48, 'SIM', 1200));
    let r = await estado(page);
    check(`semana atual é a S48 (relógio 27/11)`, r.sem === 48, r.sem);
    check('quadro do topo mostra o saldo retido de agora (R$ 1.210,31), não R$ 0,00', /1\.210,31/.test(r.kpi), r.kpi);
    check('S48 mostra "Disponível pra saída: R$ 1.210,31"', /Disponível pra saída: R\$\s*1\.210,31/.test(r.disp48), r.disp48);
    await saida(page, 0, '2000'); r = await estado(page);
    check('saída de R$ 2.000 na S48 (saldo R$ 1.210,31) é recusada e avisa o disponível', r.saidas48.length === 0 && /maior que o saldo retido disponível \(R\$\s*1\.210,31\)/.test(r.toast), r);
    check('…e o rateio da S48 não muda (R$ 1.200,00)', r.ef48 === 1200, r.ef48);
    await saida(page, 0, '150'); r = await estado(page);
    check('saída de R$ 150 dentro do saldo é aceita', JSON.stringify(r.saidas48) === '[150]', r.saidas48);
    check('quadro do topo cai pra R$ 1.060,31', /1\.060,31/.test(r.kpi), r.kpi);
    check('S47: disponível = o menor saldo até a semana atual (R$ 1.060,31, não R$ 1.175,63)', /Disponível pra saída: R\$\s*1\.060,31/.test(r.disp47), r.disp47);
    await saida(page, -1, '1100'); r = await estado(page);
    check('saída de R$ 1.100 na S47 é recusada (passaria do que ainda está retido na S48)', r.saidas47.length === 0 && /1\.060,31/.test(r.toast), r);
    await saida(page, -1, '1000'); r = await estado(page);
    check('saída de R$ 1.000 na S47 é aceita e o rateio pago na S48 continua R$ 1.200,00', JSON.stringify(r.saidas47) === '[1000]' && r.ef48 === 1200 && Math.abs(r.ret48 - 210.31) < 0.02, r);
    check('nenhum erro de JavaScript (A)', erros.length === 0, erros);
    await ctx.close();
  }
  // ── B: S47 retém, mas a S48 distribui TUDO — o saldo da S47 já foi pro rateio ──
  {
    const { ctx, page, erros } = await abrir(browser, WEEK(B47, 'NÃO', 0), WEEK(B48, 'SIM', 0));
    let r = await estado(page);
    const ef = r.ef48;
    check('S47 com saldo já distribuído na S48: disponível R$ 0,00 e explica por quê', /Disponível pra saída: R\$\s*0,00/.test(r.disp47) && /já foi distribuído/.test(r.disp47), r.disp47);
    await saida(page, -1, '100'); r = await estado(page);
    check('saída de R$ 100 na S47 é recusada — não refaz o rateio já pago da S48', r.saidas47.length === 0 && r.ef48 === ef && /não tem saldo retido disponível/.test(r.toast), r);
    check('nenhum erro de JavaScript (B)', erros.length === 0, erros);
    await ctx.close();
  }
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
