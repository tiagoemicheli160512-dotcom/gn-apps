// Painel › Operação › 🔒 Bloqueios (26/11/2026): "ranking das lojas com mais caso de bloqueio,
// dia, semana, mensal e trimestral … do maior pro menor." 1 caso = 1 tipo de trava num dia;
// tempo travada = da 1ª vez vista até resolver (ou meia-noite / agora). Maglia fora.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };
const T = (d, h) => new Date(d + 'T' + h + ':00-03:00').toISOString();
const ROWS = [
  // Caxias: 3 casos (2 dias), 1 ainda aberta hoje (desde 10:00, agora 14:00 → 4h).
  { loja: 'CAXIAS', tipo: 'vendidos', dia: '2026-11-24', hard: true, primeiro_em: T('2026-11-24', '11:00'), resolvido_em: T('2026-11-24', '13:30') },   // 2h30
  { loja: 'CAXIAS', tipo: 'carnes', dia: '2026-11-24', hard: false, primeiro_em: T('2026-11-24', '22:00'), resolvido_em: null },                       // até meia-noite: 2h
  { loja: 'CAXIAS', tipo: 'vendidos', dia: '2026-11-26', hard: false, primeiro_em: T('2026-11-26', '10:00'), resolvido_em: null },                     // agora: 4h
  // Bangu: 3 casos mas menos tempo → fica abaixo de Caxias? não: empate em casos desempata por tempo.
  { loja: 'BANGU', tipo: 'nota_fiscal', dia: '2026-11-23', hard: false, primeiro_em: T('2026-11-23', '09:00'), resolvido_em: T('2026-11-23', '09:30') },
  { loja: 'BANGU', tipo: 'entrega', dia: '2026-11-23', hard: false, primeiro_em: T('2026-11-23', '09:00'), resolvido_em: T('2026-11-23', '09:10') },
  { loja: 'BANGU', tipo: 'caixa', dia: '2026-11-25', hard: false, primeiro_em: T('2026-11-25', '09:00'), resolvido_em: T('2026-11-25', '09:05') },
  // Pedreira: 1 caso.
  { loja: 'PEDREIRA', tipo: 'abertura', dia: '2026-11-25', hard: false, primeiro_em: T('2026-11-25', '08:00'), resolvido_em: T('2026-11-25', '09:00') },
  // Maglia nunca entra (o banco nem grava, mas se aparecer, a tela ignora).
  { loja: 'MAGLIA', tipo: 'vendidos', dia: '2026-11-25', hard: false, primeiro_em: T('2026-11-25', '08:00'), resolvido_em: null },
];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T14:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof renderDashboard === 'function' && typeof _setDashTab === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  if (!(await page.evaluate(() => typeof _buildBloqueiosPanel === 'function'))) {
    console.log('FALHOU: a aba 🔒 Bloqueios não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const r = await page.evaluate(async (ROWS) => {
    const out = { urls: [] }; const abertos = [], pdfs = [];
    window.gnFetchJson = async (url, h, nome, fb) => { if (nome === 'bloqueios:registro') { out.urls.push(url); return JSON.parse(JSON.stringify(ROWS)); } return fb === undefined ? [] : fb; };
    window.open = (u) => { abertos.push(decodeURIComponent(String(u).split('text=')[1] || '')); return null; };
    window.gnRelatorioPDF = (o) => pdfs.push(o);
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    _dashPer = 'sem'; _dashWoff = 0;
    _setDashTab('bloqueios');
    for (let i = 0; i < 40 && !document.querySelector('.bloq-loja'); i++) await new Promise(r => setTimeout(r, 100));
    const lojas = [...document.querySelectorAll('.bloq-loja')];
    out.ordem = lojas.map(l => l.dataset.loja);
    out.casos = lojas.map(l => l.querySelector('.bloq-casos').textContent.trim());
    out.textoCaxias = lojas[0] && lojas[0].textContent.replace(/\s+/g, ' ');
    out.agora = lojas.map(l => !!l.querySelector('.bloq-agora'));
    out.sem = (document.querySelector('.bloq-sem') || {}).textContent || '';
    out.temSeletor = /Semana|Dia|Mês|Trimestre/.test(document.getElementById('dash-section').textContent);
    out.maglia = document.getElementById('dash-section').textContent.includes('Maglia');
    // Abre Caxias → por tipo.
    lojas[0].querySelector('[onclick]').click();
    out.tipos = [...document.querySelectorAll('.bloq-loja[data-loja="CAXIAS"] .bloq-tipos > div')].map(d => d.textContent.replace(/\s+/g, ' ').trim());
    // Sem estouro horizontal no celular.
    out.estouro = [...document.querySelectorAll('.bloq-loja')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).length;
    // Relatórios.
    gerarWppBloqueios(); out.wpp = abertos.pop() || '';
    gerarPDFBloqueios(); out.pdf = pdfs.pop();
    // Mês: o período vai pra query.
    _dashPer = 'mes'; _dashMoff = 0; renderDashboard();
    for (let i = 0; i < 40 && !document.querySelector('.bloq-aviso'); i++) await new Promise(r => setTimeout(r, 100));
    out.aviso = (document.querySelector('.bloq-aviso') || {}).textContent || '';
    return out;
  }, ROWS);
  check('ranking do maior pro menor (Caxias 3 · Bangu 3 · Pedreira 1) — empate desempata por tempo travada', r.ordem.join(',') === 'CAXIAS,BANGU,PEDREIRA', r.ordem);
  check('casos contados: 1 tipo num dia = 1 caso', r.casos.join('|') === '3 casos|3 casos|1 caso', r.casos);
  check('tempo de Caxias = 2h30 + 2h (até meia-noite) + 4h (aberta até agora) = 8h30', /8h 30min travada/.test(r.textoCaxias), r.textoCaxias);
  check('Caxias mostra 2 dias com bloqueio e 1 bloqueio total', /2 dias com bloqueio/.test(r.textoCaxias) && /1 bloqueio total/.test(r.textoCaxias), r.textoCaxias);
  check('"travada agora" só em Caxias (aberta hoje)', r.agora.join() === 'true,false,false', r.agora);
  check('lojas sem bloqueio listadas no fim', /Sem bloqueio no período/.test(r.sem) && /Bangu/.test(r.sem) === false && r.sem.includes('Norte'), r.sem);
  check('Maglia fora do ranking', !r.maglia);
  check('detalhe por tipo: Vendidos 2 casos 6h30, Carnes 1 caso 2h', r.tipos.length === 2 && /Vendidos.*2 · 6h 30min/.test(r.tipos[0]) && /carnes.*1 · 2h/i.test(r.tipos[1]), r.tipos);
  check('seletor Dia/Semana/Mês/Trimestre aparece na aba', r.temSeletor);
  check('query da semana pede 23/11 a 29/11', /dia=gte\.2026-11-23&dia=lte\.2026-11-29/.test(r.urls[0] || ''), r.urls);
  check('trocar pra Mês refaz a busca com novembro inteiro', /dia=gte\.2026-11-01&dia=lte\.2026-11-30/.test(r.urls[1] || ''), r.urls);
  check('no mês aparece o aviso de que o registro começou em 26/11', /começou em 26\/11/.test(r.aviso), r.aviso);
  check('nada estoura a tela do celular', r.estouro === 0, r.estouro);
  check('WhatsApp: ranking com 1º Caxias e tipos', /1º Caxias\* — 3 casos/.test(r.wpp) && /Vendidos do dia: 2/.test(r.wpp) && /Sem bloqueio/.test(r.wpp), r.wpp);
  check('PDF: KPIs de casos, tempo e quem mais travou', r.pdf && r.pdf.kpis[0].valor === '7' && r.pdf.kpis[2].valor === 'Caxias', r.pdf && r.pdf.kpis);
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
