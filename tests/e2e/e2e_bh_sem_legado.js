// "No app check-list aba banco de horas tem loja que tá puxando os 6 meses antigos, como Nova
//  América e Nova Iguaçu [...] o ciclo é de 26/09 [...] não pode puxar meses antes, pois gera
//  erro e grande." (06/11/2026)
//
// Até aqui o 1º ciclo de cada loja somava os meses lançados ANTES dele ("legado"). Nova
// América: âncora 26/09/2026 e lançamentos de Jun a Set — o saldo do ciclo saía −682,5h,
// com só +80,7h de fato do ciclo. Agora nenhum ciclo soma mês anterior ao seu 1º mês.
// Fixture: as somas reais por mês da Nova América (banco, 06/11), uma pessoa por mês.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try { return typeof _bhContexto === 'function' && typeof _bhSaldoFunc === 'function'; } catch (e) { return false; } }, null, { timeout: 30000 });

  const caso = (ancora, meses) => page.evaluate(({ ancora, meses }) => {
    _bhConfig = { periodo_inicio: ancora };
    _bhRegistros = {};
    Object.keys(meses).forEach(m => { _bhRegistros[m] = [{ nome: 'Fulana', horas: meses[m] }]; });
    const c = _bhContexto();
    return { meses: c.meses, saldo: c.mesesSaldo, legado: c.mesesLegado, total: _bhSaldoFunc('Fulana', c.mesesSaldo) };
  }, { ancora, meses });

  // Nova América: 1º ciclo 26/09/2026 → Out/26..Mar/27.
  const na = await caso('2026-09-26', { '2026-06': -201.8, '2026-07': -258.6, '2026-08': -152.0, '2026-09': -150.8, '2026-10': 80.7 });
  check('Nova América: o ciclo é Out/26 a Mar/27', JSON.stringify(na.meses) === JSON.stringify(['2026-10','2026-11','2026-12','2027-01','2027-02','2027-03']), JSON.stringify(na.meses));
  check('Nova América: Jun–Set (antes do ciclo) NÃO entram no saldo', JSON.stringify(na.saldo) === JSON.stringify(na.meses) && na.legado.length === 0, JSON.stringify(na.saldo));
  check('Nova America: saldo do ciclo = +80,7h (era −682,5h com os meses antigos)', Math.abs(na.total - 80.7) < 0.01, String(na.total));

  // Nova Iguaçu (Rancho): mesma âncora, lançamentos de Abr a Set.
  const ni = await caso('2026-09-26', { '2026-04': 17.6, '2026-05': 39.1, '2026-06': 30.7, '2026-07': -0.7, '2026-08': -8.4, '2026-10': -35.3 });
  check('Nova Iguaçu: só Out/26 conta (−35,3h), Abr–Ago ficam de fora', Math.abs(ni.total + 35.3) < 0.01, String(ni.total));

  // Pedreira e Norte Shopping: ciclo próprio, 26/06 → Jul..Dez. Nada antes de Jul soma.
  const pe = await caso('2026-06-26', { '2026-05': -10, '2026-07': -115.1, '2026-10': -132.7 });
  check('Pedreira: ciclo Jul..Dez, Mai (antes) não soma', Math.abs(pe.total + 247.8) < 0.01 && !pe.saldo.includes('2026-05'), String(pe.total));

  // Loja no 2º ciclo (âncora 26/03): o ciclo vigente é Out..Mar e Abr–Set ficam no ciclo fechado.
  const bg = await caso('2026-03-26', { '2026-06': -207.6, '2026-09': 88.4, '2026-10': 30 });
  check('Bangu (2º ciclo): só Out/26 no saldo do ciclo vigente', Math.abs(bg.total - 30) < 0.01, String(bg.total));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
