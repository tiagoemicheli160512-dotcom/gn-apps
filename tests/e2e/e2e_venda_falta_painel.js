// "Pode verificar no faturamento da loja de Caxias no mês de outubro: no sistema e no
//  relatório que veio da empresa tá batendo 395 mil, e no app a loja apresenta 370 mil."
//  → era o Check-list de 10/10 zerado com o caixa do dia fechado em R$ 27.128,91. O dono
//  pediu o aviso no Painel (06/11/2026) pra isso aparecer no dia, não no fechamento do mês.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Caxias real: 09/10 normal, 10/10 zerado, 11/10 normal (caixa ~8,8% acima do Check-list).
const CAIXA = [
  { loja: 'CAXIAS', data: '2026-10-09', total_sistema: 10074.87 },
  { loja: 'CAXIAS', data: '2026-10-10', total_sistema: 27128.91 },
  { loja: 'CAXIAS', data: '2026-10-11', total_sistema: 35365.78 },
  // Dois turnos no mesmo dia somam.
  { loja: 'BANGU', data: '2026-10-11', total_sistema: 6000 }, { loja: 'BANGU', data: '2026-10-11', total_sistema: 6000 },
  // Dois turnos de 8.000: só SOMANDO (16.000) o Check-list de 7.000 fica abaixo da metade.
  { loja: 'RANCHO', data: '2026-10-20', total_sistema: 8000 }, { loja: 'RANCHO', data: '2026-10-20', total_sistema: 8000 },
  // Sem nenhuma linha no Check-list.
  { loja: 'PEDREIRA', data: '2026-11-02', total_sistema: 8000 },
  // Dia sem movimento: não é falta.
  { loja: 'BOULEVARD', data: '2026-11-03', total_sistema: 300 },
  // Maglia fica fora.
  { loja: 'MAGLIA', data: '2026-11-03', total_sistema: 9000 },
];
const CHK = [
  { loja: 'Caxias', data_operacao: '2026-10-09', venda_salao: 8910.88, venda_delivery: 369.5 },
  { loja: 'Caxias', data_operacao: '2026-10-10', venda_salao: 0, venda_delivery: 0 },
  { loja: 'Caxias', data_operacao: '2026-10-11', venda_salao: 31643.46, venda_delivery: 832.1 },
  { loja: 'Bangu', data_operacao: '2026-10-11', venda_salao: 10500, venda_delivery: 500 },
  { loja: 'Boulevard', data_operacao: '2026-11-03', venda_salao: 0, venda_delivery: 0 },
  { loja: 'Rancho', data_operacao: '2026-10-20', venda_salao: 7000, venda_delivery: 0 },
];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
  const urls = []; let falha = false;
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url(); urls.push(u);
    const j = (b, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_caixa_fechamento/.test(u) && /total_sistema/.test(u)) return falha ? j({ m: 'x' }, 500) : j(CAIXA);
    if (/checklist_diario/.test(u) && /data_operacao=gte/.test(u) && !/loja=eq/.test(u)) return j(CHK);
    return j([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['_buildVendaFaltaCard', '_vendaFaltaCalcular', 'renderDashboard']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o card novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  const abrir = () => page.evaluate(async () => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    _vendaFaltaDados = null;
    renderDashboard();
    await new Promise(r => setTimeout(r, 400));
    const el = document.querySelector('.venda-falta-card');
    return el ? { txt: el.textContent.replace(/\s+/g, ' '), linhas: [...el.querySelectorAll('.venda-falta-linha')].map(x => x.textContent.replace(/\s+/g, ' ').trim()) } : null;
  });

  const r = await abrir();
  check('o card aparece no Painel quando há dia com venda faltando', !!r, '');
  const linhas = r ? r.linhas : [];
  check('aponta Caxias 10/10: caixa R$ 27.128,91 e Check-list R$ 0,00 (o caso de outubro)',
    linhas.some(l => /Caxias/.test(l) && /10\/10/.test(l) && /27\.128,91/.test(l) && /R\$ 0,00/.test(l)), JSON.stringify(linhas));
  check('aponta o dia com caixa fechado e SEM linha no Check-list (Pedreira 02/11)',
    linhas.some(l => /Pedreira/.test(l) && /02\/11/.test(l) && /sem lançamento/.test(l)), JSON.stringify(linhas));
  check('dias normais (caixa ~8,8% acima do Check-list) não aparecem', !linhas.some(l => /09\/10|11\/10/.test(l)), JSON.stringify(linhas));
  check('dois turnos do mesmo dia somam (Bangu 6.000 + 6.000 contra 11.000 no Check-list não é falta)', !linhas.some(l => /Bangu/.test(l)));
  check('turnos somados: Nova Iguaçu 8.000 + 8.000 de caixa contra 7.000 no Check-list é falta',
    linhas.some(l => /Nova Iguaçu/.test(l) && /20\/10/.test(l) && /16\.000,00/.test(l)), JSON.stringify(linhas));
  check('caixa sem movimento (R$ 300) não vira alarme', !linhas.some(l => /Boulevard/.test(l)));
  check('Maglia fica fora', !linhas.some(l => /Maglia/.test(l)));
  check('são 3 dias, e o card diz quanto falta (~R$ 44.128,91)', /3 dias/.test(r && r.txt) && /44\.128,91/.test(r && r.txt), r && r.txt);
  check('a consulta vai do dia 1º do mês passado até ontem',
    urls.some(u => /gn_caixa_fechamento\?data=gte\.2026-10-01&data=lte\.2026-11-05&status=eq\.FECHADO/.test(u)), urls.filter(u => /caixa_fech/.test(u)).join(' '));

  // Sem nada faltando, o card some.
  const sem = await page.evaluate(() => _vendaFaltaCalcular([{ loja: 'CAXIAS', data: '2026-10-09', total_sistema: 10074.87 }],
    [{ loja: 'Caxias', data_operacao: '2026-10-09', venda_salao: 8910.88, venda_delivery: 369.5 }]).length);
  check('sem dia faltando, nada a mostrar', sem === 0);
  falha = true;
  const f = await abrir();
  falha = false;
  check('se o caixa não carregar, o card não aparece (não afirma nada sem dado)', f === null);

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
