// "ao selecionar a semana anterior está assim sem informação das vendas" (14/11/2026)
//
// O Painel não deixa duas cargas rodarem juntas (_dashLoading). Trocar de semana enquanto a
// anterior ainda carregava DESCARTAVA o pedido da semana nova em silêncio; a carga antiga
// terminava e gravava os números da semana errada. A grade dia a dia dos cards (linha "Fat")
// procurava as datas da semana nova nos dados da antiga e mostrava tudo "—".
//
// Prova com a rede lenta: vai pra semana anterior e volta antes de a primeira carga terminar.
// No fim, os dados por dia têm que ser da semana que está NA TELA.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-14T09:30:00');
  // Venda de todos os dias de outubro e novembro; as respostas do checklist_diario demoram.
  const linhas = [];
  for (let d = new Date(2026, 9, 1); d <= new Date(2026, 10, 30); d.setDate(d.getDate() + 1)) {
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    linhas.push({ loja: 'Bangu', data_operacao: iso, venda_salao: 1000 + d.getDate(), venda_delivery: 0 });
  }
  let atraso = 0;
  await ctx.route('**/rest/v1/**', async route => {
    const u = decodeURIComponent(route.request().url());
    if (/checklist_diario\?data_operacao=gte\.(\d{4}-\d\d-\d\d)&data_operacao=lte\.(\d{4}-\d\d-\d\d)&select=loja,data_operacao,venda_salao,venda_delivery$/.test(u)) {
      const [, de, ate] = u.match(/gte\.(\d{4}-\d\d-\d\d)&data_operacao=lte\.(\d{4}-\d\d-\d\d)/);
      if (atraso) await new Promise(r => setTimeout(r, atraso));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(linhas.filter(l => l.data_operacao >= de && l.data_operacao <= ate)) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _dashNav === 'function' && typeof _loadDashAll === 'function'; } catch (e) { return false; } }, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: o painel não carregou'); process.exit(1); } }
  }
  await page.evaluate(async () => {
    session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    LOJAS_LISTA = GN_LOJAS.map(l => l.userKey);
    _dashPer = 'sem'; _dashWoff = 0;
    for (let i = 0; i < 200 && _dashLoading; i++) await new Promise(r => setTimeout(r, 50));
    await _loadDashAll();
  });
  atraso = 700;
  const r = await page.evaluate(async () => {
    _dashNav(-1);                                   // semana anterior: começa a carregar…
    await new Promise(r => setTimeout(r, 150));
    _dashNav(1);                                    // …e volta antes de terminar
    for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 100)); if (!_dashLoading && _dashFatDiaLoja) break; }
    await new Promise(r => setTimeout(r, 900));
    for (let i = 0; i < 60 && _dashLoading; i++) await new Promise(r => setTimeout(r, 100));
    const semana = _weekRange(_dashSemanaOff()).dates;
    const bangu = (_dashFatDiaLoja || {})['BANGU'] || {};
    return { off: _dashWoff, semana, datas: Object.keys(bangu).sort(), temSemanaNaTela: semana.slice(0, 5).every(d => bangu[d] > 0) };
  });
  check('voltou pra semana atual', r.off === 0 && r.semana[0] === '2026-11-09', r);
  check('a venda dia a dia é da semana que está na tela (não da que foi abandonada no meio)', r.temSemanaNaTela, r);
  check('nenhuma data de outra semana sobrou nos dados do card', r.datas.every(d => d >= '2026-11-09' && d <= '2026-11-15'), r.datas);

  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
