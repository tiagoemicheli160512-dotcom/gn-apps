// "Pode corrigir no Check-list" (18/11/2026): a regra da CLT (Art. 134 §3º — férias não
// começam nos 2 dias antes de folga semanal ou feriado) não conhecia o 20/11, Consciência
// Negra, feriado nacional desde a Lei 14.759/2023. Cobra: férias começando em 18 ou 19/11
// são recusadas por causa do 20/11; em 16/11 passa; e os outros feriados continuam valendo.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext();
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try { return typeof _inicioProibidoDSRFeriado === 'function'; } catch (e) { return false; } }, null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    try { comissoesWD = null; } catch (e) {}
    return {
      f20: _ehFeriadoISO('2026-11-20'), f20b: _ehFeriadoISO('2027-11-20'),
      i18: _inicioProibidoDSRFeriado('2026-11-18', 'x'), i19: _inicioProibidoDSRFeriado('2026-11-19', 'x'),
      i16: _inicioProibidoDSRFeriado('2026-11-16', 'x'), natal: _inicioProibidoDSRFeriado('2026-12-23', 'x'),
    };
  });
  check('20/11 é feriado nacional (2026 e 2027)', r.f20 && r.f20b, r);
  check('férias começando em 18/11 ou 19/11 são recusadas por causa do 20/11', /20\/11\/2026 é feriado/.test(r.i18 || '') && /20\/11\/2026 é feriado/.test(r.i19 || ''), r);
  check('começando em 16/11 passa', r.i16 === null, r);
  check('os outros feriados continuam valendo (23/12 → Natal)', /25\/12\/2026 é feriado/.test(r.natal || ''), r);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
