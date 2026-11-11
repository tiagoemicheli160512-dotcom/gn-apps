// "Já temos em venda, caixa e equipe o padrão dia, semana, mês e trimestral … agora preciso
//  da opção livre, onde possa escolher um período livre" (12/11/2026).
//
// Cobra:
//  - botão Livre no seletor; abre no mês corrente até hoje, com DE e ATÉ editáveis;
//  - escolher 20/10–29/10 consulta exatamente esses dias, e o "anterior" são os 10 dias
//    logo antes (10/10–19/10), escrito "10 dias anteriores";
//  - Caixa (cancelamento/sem 10%) usa o mesmo intervalo;
//  - ‹ › andam uma janela do mesmo tamanho e não passam da escolhida;
//  - datas invertidas são trocadas, futuro vira hoje, mais de 366 dias é cortado com aviso;
//  - relatório 📄 e raio-x abrem no período livre; 320 px sem rolagem de lado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 500)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-07T12:00:00');   // sábado
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  const alertas = []; page.on('dialog', d => { alertas.push(d.message()); d.accept(); });
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard', '_setPer', '_dashNav', '_loadDashAll', '_dashLivreDefinir', '_livreRange']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    window._chamadasFat = []; window._chamadasCaixa = [];
    // Cada loja vende R$ 1.000 por dia; 15/10 vale R$ 3.000 (cai no "anterior" de 20–29/10).
    _fetchFat = async dates => {
      window._chamadasFat.push([dates[0], dates[dates.length - 1], dates.length]);
      const o = {}; LOJAS_LISTA.forEach(k => { o[k] = dates.reduce((s, d) => s + (d === '2026-10-15' ? 3000 : 1000), 0); }); return o;
    };
    window.gnFetchJson = async (u, h, c, fb) => {
      if (c === 'dash:cancelRows') { const m = u.match(/data=gte\.([\d-]+)&data=lte\.([\d-]+)/); window._chamadasCaixa.push([m[1], m[2]]); }
      return fb;
    };
  });
  const esperar = () => page.evaluate(async () => { for (let i = 0; i < 200 && (_dashLoading || !_dashFat); i++) await new Promise(r => setTimeout(r, 20)); renderDashboard(); });
  const estado = () => page.evaluate(() => ({
    per: _dashPer, off: _dashOff(), label: document.querySelector('.period-label').innerText.replace(/\s+/g, ' '),
    botoes: [...document.querySelectorAll('.period-toggle button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')),
    de: (document.getElementById('dash-livre-de') || {}).value, ate: (document.getElementById('dash-livre-ate') || {}).value,
    prox: document.querySelectorAll('.period-arrow')[1] && document.querySelectorAll('.period-arrow')[1].disabled,
    fat: window._chamadasFat.slice(), caixa: window._chamadasCaixa.slice(),
    kpis: [...document.querySelectorAll('#dash-section .kpi-tile')].map(e => e.innerText.replace(/\s+/g, ' ')),
    larga: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
  const definir = async (de, ate) => {
    await page.evaluate(([de, ate]) => { window._chamadasFat = []; window._chamadasCaixa = [];
      document.getElementById('dash-livre-de').value = de; document.getElementById('dash-livre-ate').value = ate; _dashLivreDefinir(); }, [de, ate]);
    await esperar(); return estado();
  };

  // ── Abrir ────────────────────────────────────────────────────────────────────────────
  await page.evaluate(() => _setPer('sem')); await esperar();
  await page.evaluate(() => { window._chamadasFat = []; _setPer('livre'); }); await esperar();
  let r = await estado();
  check('o seletor ganhou "Livre" (e ele fica marcado)', r.botoes.join('|') === 'Dia|Semana|Mês|Trimestre|Livre*', r.botoes.join('|'));
  check('Livre abre no mês corrente até hoje: 01/11 a 07/11, com DE e ATÉ na tela',
    r.de === '2026-11-01' && r.ate === '2026-11-07' && /01\/11–07\/11/.test(r.label), JSON.stringify(r));
  check('…e consulta exatamente esses 7 dias', r.fat.some(c => c[0] === '2026-11-01' && c[1] === '2026-11-07' && c[2] === 7), JSON.stringify(r.fat));
  check('o período que chega até hoje não deixa avançar (›)', r.prox === true, r.prox);

  // ── Escolher 20/10 a 29/10 ───────────────────────────────────────────────────────────
  r = await definir('2026-10-20', '2026-10-29');
  check('20/10–29/10: rótulo e consulta dos 10 dias', /20\/10–29\/10/.test(r.label) && r.fat.some(c => c[0] === '2026-10-20' && c[1] === '2026-10-29' && c[2] === 10), JSON.stringify({ l: r.label, f: r.fat }));
  check('o "anterior" são os 10 dias logo antes (10/10–19/10)', r.fat.some(c => c[0] === '2026-10-10' && c[1] === '2026-10-19' && c[2] === 10), JSON.stringify(r.fat));
  check('KPI: 10 dias × R$ 1.000 × 11 lojas = R$ 110,0k, contra "10 dias anteriores" (que teve o dia de R$ 3.000)',
    /R\$ 110,0k/.test(r.kpis[0]) && /10 dias anteriores/.test(r.kpis[0]) && /▼/.test(r.kpis[0]), r.kpis[0]);
  check('Caixa (cancelamento/sem 10%) busca o mesmo intervalo', r.caixa.some(c => c[0] === '2026-10-20' && c[1] === '2026-10-29'), JSON.stringify(r.caixa));
  check('meta (semana/mês) não é comparada com um período livre', !r.kpis.some(k => /MÉDIA META/i.test(k)), JSON.stringify(r.kpis));

  // ── Setas ────────────────────────────────────────────────────────────────────────────
  await page.evaluate(() => _dashNav(-1)); await esperar(); r = await estado();
  check('‹ volta uma janela do mesmo tamanho: 10/10–19/10', /10\/10–19\/10/.test(r.label) && r.off === -1, r.label);
  check('…sem mexer nos campos (continuam no período escolhido)', r.de === '2026-10-20' && r.ate === '2026-10-29', JSON.stringify(r));
  await page.evaluate(() => _dashNav(1)); await page.evaluate(() => _dashNav(1)); await esperar(); r = await estado();
  check('› volta até o período escolhido e não passa dele', /20\/10–29\/10/.test(r.label) && r.off === 0, r.label);

  // ── Datas fora do lugar ──────────────────────────────────────────────────────────────
  r = await definir('2026-10-29', '2026-10-20');
  check('DE depois do ATÉ: troca os dois', r.de === '2026-10-20' && r.ate === '2026-10-29', JSON.stringify(r));
  r = await definir('2026-11-03', '2026-11-20');
  check('ATÉ no futuro vira hoje', r.ate === '2026-11-07' && /03\/11–07\/11/.test(r.label), JSON.stringify(r));
  r = await definir('2025-01-01', '2026-11-07');
  check('mais de 366 dias: corta o início e avisa', r.de === '2025-11-07' && alertas.some(a => /366 dias/.test(a)), JSON.stringify({ de: r.de, alertas }));
  check('ano diferente aparece no rótulo (07/11/25–07/11)', /07\/11\/25–07\/11/.test(r.label), r.label);
  r = await definir('2026-10-20', '2026-10-29');

  // ── Relatório e raio-x ───────────────────────────────────────────────────────────────
  const rel = await page.evaluate(async () => {
    await _gerarRelatorio();
    const d = window._relData || {};
    const pills = [...document.querySelectorAll('#_rel-modal button')].map(b => b.textContent.trim());
    const out = { tipo: d.perTipo, label: d.range && d.range.label, livre: pills.includes('Livre') };
    fecharTelaSobreposta(); return out;
  });
  check('o relatório 📄 abre no período livre (Personalizado, 20/10–29/10)', rel.tipo === 'Personalizado' && rel.label === '20/10–29/10' && rel.livre, JSON.stringify(rel));
  const rx = await page.evaluate(async () => {
    await _raioxAbrir(LOJAS_LISTA[0]);
    const out = { label: _raioxDados && _raioxDados.range.label, n: _raioxDados && _raioxDados.range.dates.length };
    fecharTelaSobreposta(); return out;
  });
  check('o raio-x da loja abre no mesmo período livre', rx.label === '20/10–29/10' && rx.n === 10, JSON.stringify(rx));

  // ── Telas ────────────────────────────────────────────────────────────────────────────
  for (const w of [390, 320]) {
    await page.setViewportSize({ width: w, height: 800 }); await page.evaluate(() => renderDashboard());
    const lay = await page.evaluate(() => { const de = document.getElementById('dash-livre-de').getBoundingClientRect(), ate = document.getElementById('dash-livre-ate').getBoundingClientRect();
      return { larga: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, ladoALado: Math.abs(de.top - ate.top) < 4, w: Math.round(de.width) }; });
    check(`${w} px: DE e ATÉ lado a lado, sem rolagem de lado`, !lay.larga && lay.ladoALado && lay.w >= 100, JSON.stringify(lay));
  }
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
