// Painel: queda de faturamento comparando só os DIAS FECHADOS (28/11/2026).
// Num sábado de manhã as 11 lojas apareciam "caindo 36–50%": o período atual tinha o sábado
// (hoje, ainda sem lançamento) em R$ 0 contra o sábado passado inteiro. Agora hoje fica fora
// dos dois lados; sem nenhum dia fechado (segunda de manhã) não compara; e feriado só no
// período anterior (20/11, Consciência Negra) vem escrito junto e o alerta deixa de ser urgente.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };
// Bangu: 10 mil por dia; sexta 20/11 (feriado) 25 mil; sábados 30 mil; hoje (28/11) ainda 0.
const DIA = {};
['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27','2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04'].forEach(d => DIA[d] = 10000);
DIA['2026-11-20'] = 25000; DIA['2026-11-21'] = 30000; DIA['2026-11-22'] = 12000; DIA['2026-11-28'] = 0;
DIA['2026-11-29'] = 0; DIA['2026-12-05'] = 0;
async function rodar(browser, quando) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, quando);
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) { await page.goto('file://' + HOME); try { await page.waitForFunction(() => { try { return typeof _loadDashAll === 'function' && typeof _fetchFatLongo === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
  const r = await page.evaluate(async DIA => {
    window._fetchFatLongo = async dates => ({ BANGU: dates.reduce((s, d) => s + (DIA[d] || 0), 0) });
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block'; document.getElementById('dash-section').style.display = 'block';
    _dashPer = 'sem'; _dashWoff = 0;
    await _loadDashAll(); _setDashTab('fat'); renderDashboard();
    const q = _computeAlertas().filter(a => a.ico === '📉' && a.loja === 'BANGU');
    return { atual: (_dashFat || {}).BANGU, comp: (typeof _dashFatComp !== 'undefined' ? (_dashFatComp || {}) : {}).BANGU, prev: _dashFatPrev ? _dashFatPrev.BANGU : null,
      alerta: q.map(a => a.sev + ' | ' + a.msg + ' | ' + a.sub)[0] || '', kpi: ((document.querySelector('.kpi-row') || {}).innerText || '').replace(/\s+/g, ' ') };
  }, DIA);
  await ctx.close(); return { r, erros };
}
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  // Sábado 28/11 de manhã: seg–sex fechados (50 mil) × seg–sex anterior (40 mil + 25 mil do feriado).
  {
    const { r, erros } = await rodar(browser, '2026-11-28T10:00:00-03:00');
    check('sábado de manhã: o total mostrado continua sendo o da semana (R$ 50 mil)', r.atual === 50000, r);
    check('a comparação deixa o sábado (hoje, sem lançamento) fora dos dois lados: 50 mil × 65 mil', r.comp === 50000 && r.prev === 65000, r);
    check('alerta mostra −23% (não −47%) e explica o feriado do anterior, sem ser urgente', /^2 \| Bangu caiu 23% vs período anterior \| R\$ 50,0k vs R\$ 65,0k ant\. \(até ontem, mesmos dias\) · anterior teve feriado: Consciência Negra 20\/11/.test(r.alerta), r.alerta);
    check('KPI: "até ontem · mesmos dias do anterior" e o aviso do feriado', /até ontem · mesmos dias do anterior/.test(r.kpi) && /anterior teve feriado: Consciência Negra 20\/11/.test(r.kpi), r.kpi);
    check('nenhum erro de JavaScript (sábado)', erros.length === 0, erros);
  }
  // Segunda 30/11 de manhã: nenhum dia fechado → não compara.
  {
    const { r, erros } = await rodar(browser, '2026-11-30T09:00:00-03:00');
    check('segunda de manhã: sem dia fechado, não há "queda" nem variação', r.alerta === '' && r.prev === null && /comparação a partir do 1º dia fechado/.test(r.kpi), r);
    check('nenhum erro de JavaScript (segunda)', erros.length === 0, erros);
  }
  // Sábado 05/12: semana anterior sem feriado → comparação normal, sem aviso.
  {
    const { r, erros } = await rodar(browser, '2026-12-05T10:00:00-03:00');
    check('semana sem feriado no anterior: 50 mil × 50 mil, sem alerta e sem aviso de feriado', r.comp === 50000 && r.prev === 50000 && r.alerta === '' && !/feriado/.test(r.kpi), r);
    check('nenhum erro de JavaScript (05/12)', erros.length === 0, erros);
  }
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
