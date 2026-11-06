// "Olhando o app lojas home, já temos o indicador de posição em cancelamento, pode
//  acrescentar a posição de vendas também, e notas sem 10%. Acho importante a loja ter essa
//  visão, sem ver a posição das outras."
//
// Dois cards ao lado do "Cancelamento na rede", saindo da MESMA consulta. A posição é a
// DO PAINEL DE GESTÃO ("vem do painel de gestão", decisão do dono):
//  - VENDAS: ordem pelo faturamento do mês entre as 12 lojas, como o "#N no ranking de
//    faturamento" do Painel — Maglia inclusa na ordem (ranking individual, CLAUDE.md),
//    mas sem card. O crescimento contra o mesmo trecho do mês passado vem junto, até o
//    último dia que a loja lançou, dos dois lados;
//  - NOTA SEM 10%: ordem pelo 10% não cobrado em reais, menor primeiro, só quem lançou
//    nota — o "Ranking · 10% não cobrado" do Painel. Sem nota: sem posição, e o card diz
//    se os caixas foram assinados ou ficaram em branco.
//  - "sem ver a posição das outras": nenhum nome de outra loja pode estar no HTML.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Hoje 05/11/2026: mês corrente 01–04/11 contra 01–04/10. Hoje (05) não entra na venda.
const dia = (d, loja, v) => ({ loja, data_operacao: d, venda_salao: v, venda_delivery: 0 });
const FAT = [
  // Bangu: GRANDE, cresce 10% (100 mil → 110 mil)
  dia('2026-10-01', 'Bangu', 50000), dia('2026-10-04', 'Bangu', 50000),
  dia('2026-11-01', 'Bangu', 55000), dia('2026-11-04', 'Bangu', 55000),
  // Pedreira: PEQUENA, cresce 50% (10 mil → 15 mil)
  dia('2026-10-02', 'Pedreira', 10000), dia('2026-11-02', 'Pedreira', 15000),
  // Caxias: cai 20% (50 mil → 40 mil)
  dia('2026-10-03', 'Caxias', 50000), dia('2026-11-03', 'Caxias', 40000),
  // Caxias ainda não lançou 04/11: a comparação dela vai até 03, dos DOIS lados. Se esta
  // venda de 04/10 entrar, Caxias cai pra −50% (40 contra 80) — foi o erro visto ao vivo
  // no Bangu em 06/11 (−29,1% em vez de −19,4%) e que esta linha existe pra pegar.
  dia('2026-10-04', 'Caxias', 30000),
  // Fora do trecho comparado: 05/10 (mês passado depois do dia 04) e hoje 05/11.
  dia('2026-10-05', 'Bangu', 999999), dia('2026-11-05', 'Pedreira', 999999),
  // Maglia: entra na ORDEM do faturamento (como no Painel), mas não no crescimento da rede
  // (+1000% — se entrasse, o +3,1% da rede viraria outro número).
  dia('2026-10-01', 'Maglia', 1000), dia('2026-11-01', 'Maglia', 11000),
  // Nova América: venda só no mês atual — sem base de comparação, sem posição.
  dia('2026-11-01', 'Nova América', 30000),
];
const FECH = [
  // Bangu: R$ 1.100 em 2 notas sobre 110 mil do mês. Na nota sem 10% o mês vai até HOJE
  // (05/11 entra), diferente da venda, que para ontem — a venda de hoje é da Pedreira.
  { loja: 'BANGU', data: '2026-11-02', status: 'FECHADO', sem_nota10_por: null, gn_caixa_cancelamento: [], gn_caixa_gorjeta: [{ valor: 600 }, { valor: 500 }] },
  // Pedreira: nenhuma nota MAS caixa fechado em branco — 0% não é mérito aqui.
  { loja: 'PEDREIRA', data: '2026-11-02', status: 'FECHADO', sem_nota10_por: null, gn_caixa_cancelamento: [], gn_caixa_gorjeta: [] },
  // Caxias: 400 de 40.000 = 1,00%, e o outro caixa assinado "não houve".
  { loja: 'CAXIAS', data: '2026-11-03', status: 'FECHADO', sem_nota10_por: null, gn_caixa_cancelamento: [], gn_caixa_gorjeta: [{ valor: 400 }] },
  { loja: 'CAXIAS', data: '2026-11-04', status: 'FECHADO', sem_nota10_por: 'Ana', gn_caixa_cancelamento: [], gn_caixa_gorjeta: [] },
  // Nota de OUTUBRO não entra no mês.
  { loja: 'CAXIAS', data: '2026-10-20', status: 'FECHADO', sem_nota10_por: null, gn_caixa_cancelamento: [], gn_caixa_gorjeta: [{ valor: 50000 }] },
  { loja: 'MAGLIA', data: '2026-11-01', status: 'FECHADO', sem_nota10_por: null, gn_caixa_cancelamento: [], gn_caixa_gorjeta: [{ valor: 1 }] },
];
const OUTRAS = ['Bangu', 'Pedreira', 'Caxias', 'Nova América', 'Maglia', 'Itaquera', 'Guarulhos'];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-05T15:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', 'LOJAS_TODAS', '_cancelRedeHome', 'masterLoja'], ['_renderCancelRedeHome', '_vendasRedeHomeHtml']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }

  const montar = (opts) => page.evaluate(async ({ FAT, FECH, opts }) => {
    const orig = window.gnFetchJson;
    const urls = [];
    window.gnFetchJson = async (url, h, ctxName, fallback) => {
      urls.push(url);
      if (opts.falhar) return fallback;
      if (/checklist_diario/.test(url)) return FAT;
      if (/gn_caixa_fechamento/.test(url)) return FECH;
      return [];
    };
    _cancelRedeHome = null; _cancelRedeHomeChave = ''; _cancelRedeHomeIndo = false;
    masterLoja = opts.masterLoja || null;
    try {
      await _renderCancelRedeHome(true, { loja: opts.loja, cargo: opts.cargo || 'gerente' }, !!opts.isMaster);
    } finally { window.gnFetchJson = orig; }
    const ler = id => { const el = document.getElementById(id); return el ? { html: el.innerHTML.trim(), txt: el.textContent.replace(/\s+/g, ' ').trim() } : null; };
    return { vendas: ler('vendas-rede-home-card'), sem10: ler('sem10-rede-home-card'), cancel: ler('cancel-rede-home-card'), urls };
  }, { FAT, FECH, opts: opts || {} });

  check('os dois lugares dos cards existem na Home',
    await page.evaluate(() => !!document.getElementById('vendas-rede-home-card') && !!document.getElementById('sem10-rede-home-card')));

  // ── Vendas: posição pelo faturamento do mês (hoje incluído, como no Painel) ────────
  // Faturamento 01–05/11: Pedreira 1.014.999 · Bangu 110.000 · Caxias 40.000 ·
  // Nova América 30.000 · Maglia 11.000 → 5 lojas com venda.
  const ped = await montar({ loja: 'PEDREIRA' });
  const bg = await montar({ loja: 'BANGU' });
  const cx = await montar({ loja: 'CAXIAS' });
  const na = await montar({ loja: 'NOVA AMERICA' });
  check('vendas: a posição é a do faturamento do mês (Pedreira 1ª de 5)', /1º de 5 em faturamento/.test(ped.vendas.txt), ped.vendas.txt);
  check('vendas: o Bangu é 2º de 5 e mostra o faturamento do mês (R$ 110.000)',
    /2º de 5 em faturamento/.test(bg.vendas.txt) && /R\$\s?110\.000,00 vendidos no mês/.test(bg.vendas.txt), bg.vendas.txt);
  check('vendas: a Maglia conta na ORDEM do faturamento, como no Painel (5 lojas, Nova América 4ª)', /4º de 5/.test(na.vendas.txt), na.vendas.txt);
  check('vendas: Caxias 3º de 5', /3º de 5/.test(cx.vendas.txt), cx.vendas.txt);
  check('vendas: o crescimento vem junto (Bangu +10,0%, Pedreira +50,0%, Caxias −20,0%)',
    /\+10,0% contra o mês passado/.test(bg.vendas.txt) && /\+50,0%/.test(ped.vendas.txt) && /−20,0%/.test(cx.vendas.txt), bg.vendas.txt);
  check('vendas: crescimento da rede ponderado e sem a Maglia: +3,1% (com ela, ou pela média das %, sairia outro número)',
    /rede em \+3,1%/.test(bg.vendas.txt), bg.vendas.txt);
  check('vendas: o crescimento compara 01 a 04/11 contra 01 a 04/10 (hoje e 05/10 de fora)',
    /01\/11 a 04\/11: R\$\s?110\.000/.test(bg.vendas.txt) && /01\/10 a 04\/10: R\$\s?100\.000/.test(bg.vendas.txt), bg.vendas.txt);
  check('vendas: loja que não lançou ontem é comparada até o último dia dela, dos dois lados',
    /01\/11 a 03\/11/.test(cx.vendas.txt) && /01\/10 a 03\/10/.test(cx.vendas.txt) && /04\/11 ainda não foi lançado/.test(cx.vendas.txt) && !/−50/.test(cx.vendas.txt), cx.vendas.txt);
  check('vendas: sem venda no mês passado, tem posição mas não tem crescimento (não vira +∞%)',
    /Sem venda lançada no mesmo trecho do mês passado/.test(na.vendas.txt) && !/∞|Infinity|NaN/.test(na.vendas.txt), na.vendas.txt);
  const mg = await montar({ loja: 'MAGLIA' });
  check('vendas e sem 10%: a Maglia não tem card', mg.vendas.html === '' && mg.sem10.html === '');

  // ── Nota sem 10%: ordem pelo 10% em reais, só quem lançou ────────────────────────────
  check('sem 10%: Caxias (R$ 40 de 10%) é 1ª de 2', /R\$\s?40,00 de 10% que não entrou/.test(cx.sem10.txt) && /1º de 2/.test(cx.sem10.txt), cx.sem10.txt);
  check('sem 10%: o Bangu (R$ 110 de 10%, 2 notas) é 2º de 2',
    /R\$\s?110,00 de 10% que não entrou/.test(bg.sem10.txt) && /2º de 2/.test(bg.sem10.txt) && /2 notas/.test(bg.sem10.txt), bg.sem10.txt);
  check('sem 10%: nota de outubro não entra (Caxias segue com R$ 40, não R$ 5.040)', !/5\.040/.test(cx.sem10.txt), cx.sem10.txt);
  check('sem 10%: a Pedreira, sem nota, fica sem posição (como no Painel)…', /sem posição no ranking/.test(ped.sem10.txt) && !/º de/.test(ped.sem10.txt), ped.sem10.txt);
  check('…e o card cobra o caixa fechado em branco', /1 caixa fechou sem lançar nota sem 10%/.test(ped.sem10.txt), ped.sem10.txt);
  check('sem 10%: caixa assinado "não houve" conta como respondido', /Todos os 2 caixas fechados/.test(cx.sem10.txt), cx.sem10.txt);
  // "Cancelamento e perda de 10% é sempre negativo, então tem que estar em vermelho sempre."
  check('sem 10%: SEMPRE vermelho, até o 1º lugar (Caxias)', /txt-red/.test(cx.sem10.html) && !/txt-green|txt-amber\);font-weight:800">1º/.test(cx.sem10.html), cx.sem10.html.slice(0, 300));
  check('sem 10%: e vermelho também sem posição (Pedreira)', /border-left:3px solid var\(--txt-red\)/.test(ped.sem10.html));

  // ── "Sem ver a posição das outras" ───────────────────────────────────────────────────
  const outrasNoHtml = r => OUTRAS.filter(n => n !== r.eu).filter(n => (r.vendas.html + r.sem10.html).includes(n));
  check('nenhum nome de outra loja no HTML dos cards (Bangu)', outrasNoHtml({ ...bg, eu: 'Bangu' }).length === 0, outrasNoHtml({ ...bg, eu: 'Bangu' }).join(','));
  check('nenhum nome de outra loja no HTML dos cards (Pedreira)', outrasNoHtml({ ...ped, eu: 'Pedreira' }).length === 0, outrasNoHtml({ ...ped, eu: 'Pedreira' }).join(','));

  // ── Uma consulta só pros três cards, e o cancelamento continua lá ────────────────────
  check('os três cards saem de 2 consultas (venda + fechamento), não de 6', bg.urls.length === 2, JSON.stringify(bg.urls));
  check('a leitura de venda começa em 01/10 (mês passado)', bg.urls.some(u => /checklist_diario.*gte\.2026-10-01/.test(u)));
  check('o fechamento traz a nota sem 10% junto', bg.urls.some(u => /gn_caixa_fechamento.*gn_caixa_gorjeta\(valor\)/.test(u) && /sem_nota10_por/.test(u)));
  check('o card de cancelamento continua aparecendo', /Cancelamento na rede/.test(bg.cancel.txt));

  // ── Falha e cargo ────────────────────────────────────────────────────────────────────
  await page.evaluate(() => { window.__antesEspera = CANCEL_REDE_ESPERA_MS; });
  const falha = await page.evaluate(async ({ FAT, FECH }) => {
    // Sem esperar 10s entre as tentativas.
    const t0 = window.setTimeout; window.setTimeout = (f) => t0(f, 0);
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (u, h, c, fb) => fb;
    _cancelRedeHome = null; _cancelRedeHomeChave = ''; _cancelRedeHomeIndo = false; masterLoja = null;
    try { await _renderCancelRedeHome(true, { loja: 'BANGU', cargo: 'gerente' }, false); }
    finally { window.gnFetchJson = orig; window.setTimeout = t0; }
    return ['vendas-rede-home-card', 'sem10-rede-home-card'].map(id => document.getElementById(id).textContent.replace(/\s+/g, ' '));
  }, { FAT, FECH });
  check('consulta que falha deixa recado nos dois cards, não some calado', falha.every(t => /Não deu pra carregar/.test(t)), JSON.stringify(falha));
  const garcom = await montar({ loja: 'BANGU', cargo: 'garcom' });
  check('cargo fora da plateia não vê os cards', garcom.vendas.html === '' && garcom.sem10.html === '');
  const mestre = await montar({ loja: 'GERAL', cargo: 'mestre', isMaster: true, masterLoja: 'CAXIAS' });
  check('mestre olhando uma loja vê os cards dela', /3º de 5/.test(mestre.vendas.txt), mestre.vendas.txt);

  // ── Dia 1: nada fechado no mês ainda ─────────────────────────────────────────────────
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx2, '2026-12-01T15:00:00');
  await ctx2.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const p2 = await ctx2.newPage();
  await p2.goto('file://' + HOME);
  await CAMINHOS.esperarApp(p2, ['LOJAS_LISTA', '_cancelRedeHome', 'masterLoja'], ['_renderCancelRedeHome']);
  const dia1 = await p2.evaluate(async (FAT) => {
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (u) => /checklist_diario/.test(u) ? FAT : [];
    _cancelRedeHome = null; _cancelRedeHomeChave = ''; _cancelRedeHomeIndo = false; masterLoja = null;
    try { await _renderCancelRedeHome(true, { loja: 'BANGU', cargo: 'gerente' }, false); } finally { window.gnFetchJson = orig; }
    return document.getElementById('vendas-rede-home-card').textContent.replace(/\s+/g, ' ');
  }, FAT);
  check('dia 1 do mês: o card de vendas avisa que a comparação aparece amanhã', /começou hoje/.test(dia1), dia1);

  check('nenhum erro de JavaScript na Home', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
