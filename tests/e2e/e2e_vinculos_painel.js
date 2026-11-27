// Painel › Operação › 🔗 Vínculos NF (27/11/2026): o Compras confere os vínculos nome-da-nota →
// item do Pedido que o app Lojas criou (sozinho pela nota, ou pela loja) e desfaz o errado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };
const ROWS = [
  { id: 'v1', descricao: 'MAIONESE 2,7KG LIZA CASEIRA', insumo: 'KNORR ALHO 900 GR', origem: 'nota', loja: 'BANGU', nf: '5622081', fornecedor: 'ATACADAO', por: 'Neto', criado_em: '2026-11-26T15:00:00Z' },
  { id: 'v2', descricao: 'TOMATE CARMEM', insumo: 'TOMATE', origem: 'revisao', loja: 'BANGU', nf: '1315', fornecedor: 'HORTI SILVA', por: 'Neto', criado_em: '2026-11-25T15:00:00Z' },
  { id: 'v3', descricao: 'PARMESAO - 003', insumo: 'QUEIJO PARMESÃO', origem: 'lote_nota', loja: 'RANCHO', nf: '6588', por: 'Juan', criado_em: '2026-11-24T15:00:00Z', desfeito_em: '2026-11-25T10:00:00Z', desfeito_por: 'Tiago' },
  { id: 'v4', descricao: 'X MAGLIA', insumo: 'Y', origem: 'nota', loja: 'MAGLIA', criado_em: '2026-11-24T15:00:00Z' },
];
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-27T10:00:00-03:00');
  const rpc = [];
  await ctx.route('**/rest/v1/**', r => {
    if (/rpc\/gn_nf_vinculo_desfazer/.test(r.request().url())) { rpc.push(JSON.parse(r.request().postData())); return r.fulfill({ status: 200, contentType: 'application/json', body: '"desfeito"' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof renderDashboard === 'function' && typeof _setDashTab === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  if (!(await page.evaluate(() => typeof _buildVinculosNFPanel === 'function'))) {
    console.log('FALHOU: a aba 🔗 Vínculos NF não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const r = await page.evaluate(async (ROWS) => {
    const out = { urls: [] };
    window.gnFetchJson = async (url, h, nome, fb) => { if (nome === 'vinculos:log') { out.urls.push(url); return JSON.parse(JSON.stringify(ROWS)); } return fb === undefined ? [] : fb; };
    window.confirm = (t) => { out.confirmTxt = t; return true; }; window.alert = (t) => { out.alertTxt = t; };
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    _dashPer = 'sem'; _dashWoff = 0; _setDashTab('vinculos');
    for (let i = 0; i < 40 && !document.querySelector('.vinc-linha'); i++) await new Promise(r => setTimeout(r, 100));
    const linhas = () => [...document.querySelectorAll('.vinc-linha')].map(l => l.dataset.id);
    out.ids = linhas();
    out.v1 = document.querySelector('.vinc-linha[data-id="v1"]').innerText.replace(/\s+/g, ' ');
    out.v3 = document.querySelector('.vinc-linha[data-id="v3"]').innerText.replace(/\s+/g, ' ');
    out.botaoV3 = !!document.querySelector('.vinc-linha[data-id="v3"] .vinc-desfazer');
    out.resumo = document.getElementById('dash-section').innerText.includes('2 ativos · 1 desfeito');
    _vincSetFiltro('auto'); out.auto = linhas();
    _vincSetFiltro('loja'); out.loja = linhas();
    _vincSetFiltro('todos');
    document.querySelector('.vinc-linha[data-id="v1"] .vinc-desfazer').click();
    for (let i = 0; i < 30 && !out.alertTxt; i++) await new Promise(r => setTimeout(r, 100));
    out.v1Depois = document.querySelector('.vinc-linha[data-id="v1"]').innerText.replace(/\s+/g, ' ');
    out.estouro = [...document.querySelectorAll('.vinc-linha')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).length;
    return out;
  }, ROWS);
  check('lista os vínculos do período, mais novo primeiro, sem a Maglia', r.ids.join() === 'v1,v2,v3', r.ids);
  check('cada linha: nome da nota → item, origem, loja (Nova Iguaçu, não RANCHO), NF, fornecedor, quem e quando', /MAIONESE 2,7KG LIZA CASEIRA → KNORR ALHO 900 GR 📦 Pela nota \(automático\) · Bangu · NF 5622081 · ATACADAO · Neto · 26\/11 12:00/.test(r.v1) && /Nova Iguaçu/.test(r.v3), r);
  check('o já desfeito mostra quem desfez e não tem botão', /Desfeito por Tiago/.test(r.v3) && !r.botaoV3, r);
  check('resumo: 2 ativos · 1 desfeito', r.resumo);
  check('filtro Automáticos (pela nota) × Pela loja', r.auto.join() === 'v1,v3' && r.loja.join() === 'v2', r);
  check('busca o período da semana no registro', /criado_em=gte\.2026-11-23T00:00:00-03:00&criado_em=lte\.2026-11-29T23:59:59-03:00/.test(r.urls[0] || ''), r.urls);
  check('Desfazer: pergunta antes (explicando que vale pras próximas notas) e chama o banco com quem desfez', /As próximas notas com esse nome voltam a pedir o item/.test(r.confirmTxt || '') && rpc.length === 1 && rpc[0].p_id === 'v1' && rpc[0].p_por === 'Tiago', { rpc, c: r.confirmTxt });
  check('…e a linha passa a "Desfeito por Tiago", sem botão', /Desfeito por Tiago/.test(r.v1Depois) && !/Desfazer$/.test(r.v1Depois), r.v1Depois);
  check('nada estoura a tela do celular', r.estouro === 0, r.estouro);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
