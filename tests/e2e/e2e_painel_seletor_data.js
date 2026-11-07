// "No dia colocar pra abrir o calendário e poder colocar o dia no calendário e ir, pois se
//  quiser ver um dia de outubro tem que ir na seta dia a dia, mesma coisa no mês, colocar o
//  seletor do mês" (07/11/2026). No Diário o rótulo do período abre um calendário; no
//  Mensal, o seletor de mês. Escolheu, o Painel vai direto pra lá e recarrega. Futuro não.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-07T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard', '_setPer', '_dashIrPara', '_dashAbrirSeletor']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    window._carregou = []; _fetchFat = async dates => { window._carregou.push(dates[0] + '..' + dates[dates.length - 1]); return {}; };
    window.gnFetchJson = async (u, h, c, fb) => fb;
  });
  const esperar = () => page.evaluate(async () => { for (let i = 0; i < 200 && (_dashLoading || !_dashFat); i++) await new Promise(r => setTimeout(r, 20)); });
  const estado = () => page.evaluate(() => {
    const i = document.getElementById('dash-periodo-pick');
    return { label: document.querySelector('.period-label').innerText.replace(/\s+/g, ' '), off: _dashOff(),
      tipo: i ? i.type : null, max: i ? i.max : null, valor: i ? i.value : null, carregou: window._carregou.slice() };
  });

  // ── Diário: calendário ────────────────────────────────────────────────────────────────
  await page.evaluate(() => _setPer('dia')); await esperar();
  let e = await estado();
  check('Diário: o rótulo tem um calendário (campo de data), com o dia atual dele e máximo = hoje',
    e.tipo === 'date' && e.valor === '2026-11-06' && e.max === '2026-11-07', JSON.stringify(e));
  await page.evaluate(() => { window._carregou = []; });
  await page.fill('#dash-periodo-pick', '2026-10-15'); await esperar();
  e = await estado();
  check('escolher 15/10 no calendário vai direto pra Qui, 15/10 (sem clicar 23 vezes na seta)', /Qui, 15\/10/.test(e.label) && e.off === -23, JSON.stringify(e));
  check('…e recarrega os números daquele dia', e.carregou.includes('2026-10-15..2026-10-15'), JSON.stringify(e.carregou));
  await page.evaluate(() => _dashIrPara('2026-12-25')); await esperar();
  e = await estado();
  check('data no futuro não passa de hoje', e.off === 0 && /Sáb, 07\/11/.test(e.label), JSON.stringify(e));
  // Tocar no rótulo abre o seletor do navegador.
  const abriu = await page.evaluate(() => { const i = document.getElementById('dash-periodo-pick'); let n = 0; i.showPicker = () => { n++; }; document.querySelector('.period-label-pick').click(); return n; });
  check('tocar no rótulo abre o calendário do navegador', abriu >= 1, abriu);

  // ── Mensal: seletor de mês ───────────────────────────────────────────────────────────
  await page.evaluate(() => _setPer('mes')); await esperar();
  e = await estado();
  check('Mensal: seletor de mês, no mês atual, máximo = este mês', e.tipo === 'month' && e.valor === '2026-11' && e.max === '2026-11', JSON.stringify(e));
  await page.fill('#dash-periodo-pick', '2026-08'); await esperar();
  e = await estado();
  check('escolher agosto vai direto pra Ago 2026', /Ago 2026/.test(e.label) && e.off === -3, JSON.stringify(e));
  await page.evaluate(() => _dashIrPara('2025-12')); await esperar();
  e = await estado();
  check('atravessa o ano: dezembro de 2025', /Dez 2025/.test(e.label) && e.off === -11, JSON.stringify(e));
  check('o mês escolhido não mexeu no Diário', await page.evaluate(() => _dashDoff === 0));

  // ── Semana e Trimestre continuam só com as setas ─────────────────────────────────────
  for (const p of ['sem', 'tri3']) {
    await page.evaluate(p => _setPer(p), p); await esperar();
    e = await estado();
    check(`${p === 'sem' ? 'Semana' : 'Trimestre'}: sem seletor (continua nas setas)`, e.tipo === null, JSON.stringify(e));
  }
  // 320 px: o rótulo com o 📅 não alarga a página.
  await page.setViewportSize({ width: 320, height: 800 });
  const w = await page.evaluate(async () => { _setPer('dia'); renderDashboard(); return document.documentElement.scrollWidth; });
  check('320 px: o rótulo com o calendário não faz a página rolar de lado', w <= 321, w);
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
