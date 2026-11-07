// "Agora, quero colocar no ... painel gestão, semanal e mensal, quero criar também dia e
//  trimestre." (07/11/2026) — o seletor do Painel vira Dia · Semana · Mês · Trimestre.
//
// Cobra:
//  - os quatro períodos com o intervalo certo, e a navegação ‹ › por tipo;
//  - Diário abre em ONTEM (a venda de hoje só entra à noite) e compara com o MESMO dia da
//    semana passada; a tendência mostra os 4 dias seguidos, com a data;
//  - Trimestre na regra da rede (Set–Nov/2026) e buscado em pedaços de até 31 dias — o banco
//    devolve no máximo 1.000 linhas e um trimestre passa disso (checklist e fechamentos);
//  - meta (um número só por loja) não é comparada com dia nem trimestre;
//  - o relatório 📄 abre no mesmo período navegado; nada rola de lado a 320 px.
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
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard', '_setPer', '_dashNav', '_loadDashAll', '_fetchFatLongo', '_fetchEmPedacos']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  // Faturamento sintético: cada loja vende R$ 1.000 por dia; o dia 30/10 (sexta da semana
  // passada) vale R$ 2.000 — dá pra saber de que dia veio cada número.
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    window._chamadasFat = []; window._chamadasCaixa = [];
    _fetchFat = async dates => {
      window._chamadasFat.push([dates[0], dates[dates.length - 1], dates.length]);
      const o = {}; LOJAS_LISTA.forEach(k => { o[k] = dates.reduce((s, d) => s + (d === '2026-10-30' ? 2000 : 1000), 0); }); return o;
    };
    window.gnFetchJson = async (u, h, c, fb) => {
      if (c === 'dash:cancelRows') { const m = u.match(/data=gte\.([\d-]+)&data=lte\.([\d-]+)/); window._chamadasCaixa.push([m[1], m[2]]); }
      return fb;
    };
    localStorage.setItem('gn_home_metas', JSON.stringify(Object.fromEntries(LOJAS_LISTA.map(k => [k, 5000]))));
  });
  const ir = per => page.evaluate(async per => {
    window._chamadasFat = []; window._chamadasCaixa = [];
    _setPer(per);   // o próprio _setPer dispara a carga; espera ela terminar
    for (let i = 0; i < 200 && (_dashLoading || !_dashFat); i++) await new Promise(r => setTimeout(r, 20));
    renderDashboard();
    const kpis = [...document.querySelectorAll('#dash-section .kpi-tile')].map(e => e.innerText.replace(/\s+/g, ' '));
    const tend = [...document.querySelectorAll('#dash-section svg text')].map(t => t.textContent);
    return { per: _dashPer, off: _dashOff(), label: document.querySelector('.period-label').innerText.replace(/\s+/g, ' '),
      botoes: [...document.querySelectorAll('.period-toggle button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')),
      fat: window._chamadasFat.slice(), caixa: window._chamadasCaixa.slice(), kpis, tend,
      meta: !!document.querySelector('.kpi-meta-aviso') || kpis.some(k => /MÉDIA META/i.test(k)),
      larga: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
  }, per);

  // ── Os botões ────────────────────────────────────────────────────────────────────────
  let r = await ir('sem');
  check('o seletor tem Dia · Semana · Mês · Trimestre', r.botoes.join('|') === 'Dia|Semana*|Mês|Trimestre', r.botoes.join('|'));
  check('Semana: 02/11–08/11 e meta comparada (quadro de meta)', /02\/11–08\/11/.test(r.label) && r.meta, JSON.stringify(r));

  // ── Diário ───────────────────────────────────────────────────────────────────────────
  r = await ir('dia');
  check('Dia abre em ONTEM (Sex, 06/11), não em hoje zerado', /Sex, 06\/11/.test(r.label) && r.off === -1, r.label);
  check('Dia compara com o MESMO dia da semana passada (Sex, 30/10 valeu o dobro: ▼ 50%)',
    r.fat.some(c => c[0] === '2026-10-30' && c[1] === '2026-10-30') && /mesmo dia da semana passada/.test(r.kpis[0]) && /▼ 50%/.test(r.kpis[0]), JSON.stringify({ k: r.kpis[0], f: r.fat }));
  check('a tendência do Diário são os 4 dias seguidos, com a data (03/11 a 06/11)',
    ['Ter, 03/11', 'Qua, 04/11', 'Qui, 05/11', 'Sex, 06/11'].every(d => r.tend.includes(d)) && r.fat.some(c => c[0] === '2026-11-05' && c[1] === '2026-11-05'), JSON.stringify(r.tend));
  check('Dia: meta não é comparada (é um número da semana/mês)', !r.meta, JSON.stringify(r.kpis));
  await page.evaluate(() => _dashNav(1)); r = await page.evaluate(() => ({ label: document.querySelector('.period-label').innerText, off: _dashOff() }));
  check('› leva de ontem a hoje (Sáb, 07/11 · atual)', /Sáb, 07\/11/.test(r.label) && r.off === 0, r.label);
  await page.evaluate(() => _dashNav(1)); r = await page.evaluate(() => _dashOff());
  check('e não passa de hoje', r === 0, r);

  // ── Mês ──────────────────────────────────────────────────────────────────────────────
  r = await ir('mes');
  check('Mês: Nov 2026, com meta', /Nov 2026/.test(r.label) && r.meta, r.label);

  // ── Trimestre ────────────────────────────────────────────────────────────────────────
  r = await ir('tri3');
  check('Trimestre na regra da rede: Set–Nov 2026', /Set–Nov 2026/.test(r.label), r.label);
  const longa = c => (new Date(c[1]) - new Date(c[0])) / 864e5 + 1;
  check('o faturamento do trimestre vem em pedaços de no máximo 31 dias (limite de 1.000 linhas)',
    r.fat.length >= 3 && r.fat.every(c => longa(c) <= 31), JSON.stringify(r.fat));
  check('…e a soma dos pedaços é o trimestre inteiro: 91 dias × R$ 1.000 × 11 lojas = R$ 1,0M',
    /R\$ 1,0M/.test(r.kpis[0]), r.kpis[0]);
  check('os fechamentos de caixa (cancelamento, sem 10%) também vêm em pedaços',
    r.caixa.length >= 3 && r.caixa.every(c => longa(c) <= 31) && r.caixa[0][0] === '2026-09-01' && r.caixa[r.caixa.length - 1][1] === '2026-11-30', JSON.stringify(r.caixa));
  check('Trimestre: meta não é comparada', !r.meta, JSON.stringify(r.kpis));
  check('a tendência do Trimestre fala em trimestres', r.tend.some(t => /trim\./.test(t)), JSON.stringify(r.tend));
  await page.evaluate(() => _dashNav(-1)); r = await page.evaluate(() => document.querySelector('.period-label').innerText);
  check('‹ volta um trimestre inteiro: Jun–Ago 2026', /Jun–Ago 2026/.test(r), r);
  check('cada tipo guarda a sua navegação: voltar o trimestre não mexeu no mês', await page.evaluate(() => _dashMoff === 0 && _dashToff === -1));

  // ── Relatório abre no mesmo período ─────────────────────────────────────────────────
  const rel = await page.evaluate(async () => {
    _gerarRelatorio = _gerarRelatorio;   // o original
    await _gerarRelatorio();
    const d = window._relData || {};
    const out = { tipo: d.perTipo, label: d.range && d.range.label, offs: JSON.stringify(window._relOffsets) };
    if (typeof fecharTelaSobreposta === 'function') fecharTelaSobreposta();
    return out;
  });
  check('o relatório 📄 abre no trimestre navegado (Trimestral, Jun–Ago 2026)', rel.tipo === 'Trimestral' && /Jun–Ago 2026/.test(rel.label), JSON.stringify(rel));

  // ── 320 px ───────────────────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 320, height: 800 });
  for (const p of ['dia', 'sem', 'mes', 'tri3']) {
    const w = await page.evaluate(p => { _setPer(p); renderDashboard(); return document.documentElement.scrollWidth; }, p);
    if (w > 321) { check(`320 px: ${p} não rola de lado`, false, w); }
  }
  check('320 px: os quatro períodos cabem sem rolar de lado', true);
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
