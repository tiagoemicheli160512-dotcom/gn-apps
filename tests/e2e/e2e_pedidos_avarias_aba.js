// "A aba Terceiros seria pra empréstimos, e também tá as avarias. Quero separar: o que é
//  empréstimo, que vem do app Lojas aba Empréstimos, manter nessa aba; e o que for da aba
//  Avarias, que também vem do app Lojas, ser separado." (19/11/2026)
//
// Cobra no app Estoque e Pedido:
//  · aba 🤝 Terceiros: empréstimos em aberto + pagamento em dinheiro + saída pra terceiros,
//    SEM as avarias (e o texto aponta pra aba Avarias);
//  · aba ⚠️ Avarias (nova, no menu de baixo e no lateral): só avaria/desperdício, sem a
//    seção de empréstimos; confirmar o valor numa avaria grava e continua na aba Avarias;
//  · relatório de cada aba só com o que é dela;
//  · quem tem permissão da aba Terceiros ganha a Avarias também.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

const AV = (id, insumo, extra) => Object.assign({ id, insumo, qtd: 6, unidade: 'UN', status: 'pendente', ts: '2026-11-16T13:52:29Z', semana: '2026-11-16', custoUnit: 0, valorTotal: 0 }, extra || {});
const LINHAS = {
  'NORTE SHOPPING': { avariasAll: { 'NORTE SHOPPING': [AV('a1', 'BASE NATA'), AV('t1', 'COCA LATA', { tipo: 'saida_terceiro', terceiro: 'Buffet X' })] },
                      transferAll: { 'NORTE SHOPPING': [{ id: 'e1', origem: 'NORTE SHOPPING', destino: 'BANGU', insumo: 'ARROZ', qtd: 5, data: '2026-11-17T10:00:00Z' }] } },
  'BOULEVARD': { avariasAll: { 'BOULEVARD': [AV('d1', 'CARNE SECA', { tipo: 'transferencia_dinheiro', transferOrigemLoja: 'Campo Grande', transferDestinoLoja: 'Boulevard', qtd: 11.3 })] } },
  'BANGU': { avariasAll: { 'BANGU': [AV('a2', 'CACHACA OURO DOSE', { qtd: 8 }), AV('a3', 'CALABRESA', { status: 'loja_confirmou', valorTotal: 4.5, loja_conf_por: 'Matheus' })] } },
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const patches = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = decodeURIComponent(req.url().replace(/\+/g, '%20'));
    if (/gn_lojas\?/.test(u) && req.method() === 'GET') {
      const um = (u.match(/loja=eq\.([^&]+)/) || [])[1];
      const rows = Object.entries(LINHAS).filter(([k]) => !um || k === um).map(([loja, all_data]) => ({ loja, all_data: JSON.parse(JSON.stringify(all_data)) }));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    if (/gn_lojas\?/.test(u) && req.method() === 'PATCH') { patches.push({ u, b: JSON.parse(req.postData() || '{}') }); return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + PEDIDOS);
  await page.waitForFunction(() => { try { return typeof renderTerceiros === 'function' && typeof S === 'object' && S !== null; } catch (e) { return false; } }, null, { timeout: 30000 });

  const nav = await page.evaluate(() => ({ baixo: !!document.querySelector('.nav-btn[data-tab="avarias"]'), lateral: !!document.querySelector('.sidebar-link[data-sidebar-tab="avarias"]') }));
  check('a aba ⚠️ Avarias existe no menu de baixo e no lateral', nav.baixo && nav.lateral, nav);

  const ler = () => page.evaluate(() => { const c = document.getElementById('content'); return { txt: c.innerText.replace(/\s+/g, ' '), pend: [...c.querySelectorAll('.prov-item button')].filter(b => /Confirmar Valor/.test(b.textContent)).length }; });

  await page.evaluate(() => renderTerceiros('terceiros')); await page.waitForTimeout(300);
  const t = await ler();
  check('Terceiros: empréstimo em aberto, pagamento em dinheiro e saída pra terceiros', /Empréstimos entre lojas em aberto/.test(t.txt) && /ARROZ/.test(t.txt) && /CARNE SECA/.test(t.txt) && /COCA LATA/.test(t.txt) && /Buffet X/.test(t.txt), t.txt.slice(0, 600));
  check('…sem nenhuma avaria (BASE NATA, CACHAÇA, CALABRESA fora) e apontando pra aba Avarias', !/BASE NATA|CACHACA|CALABRESA/.test(t.txt) && /aba ⚠️ Avarias/.test(t.txt) && t.pend === 2, t);
  const relT = await page.evaluate(() => _terceirosRelatorioTexto());
  check('…relatório da Terceiros sem as avarias', /TERCEIROS/.test(relT.msg) && /EMPRÉSTIMOS ENTRE LOJAS/.test(relT.msg) && !/BASE NATA|CACHACA/.test(relT.msg), relT.msg);

  await page.evaluate(() => setTab('avarias')); await page.waitForTimeout(300);
  const a = await ler();
  check('Avarias: só avaria/desperdício (BASE NATA, CACHAÇA pendentes; CALABRESA aguardando Financeiro)', /⚠️ Avarias/.test(a.txt) && /BASE NATA/.test(a.txt) && /CACHACA OURO DOSE/.test(a.txt) && /Aguardando Financeiro/.test(a.txt) && /CALABRESA/.test(a.txt) && a.pend === 2, a.txt.slice(0, 600));
  check('…sem empréstimos, dinheiro nem saída pra terceiros', !/Empréstimos entre lojas|ARROZ|CARNE SECA|COCA LATA/.test(a.txt), a.txt);
  const relA = await page.evaluate(() => _terceirosRelatorioTexto());
  check('…relatório da Avarias só com avarias', /AVARIAS \/ DESPERDÍCIO/.test(relA.msg) && /BASE NATA/.test(relA.msg) && !/EMPRÉSTIMOS|ARROZ|COCA LATA/.test(relA.msg) && relA.titulo === 'Avarias / Desperdício', relA);

  // Confirmar o valor da BASE NATA na aba Avarias.
  await page.evaluate(async () => { modalConfirmarValorTerceiro('NORTE SHOPPING', 'a1'); document.getElementById('m-valor-terceiro').value = '42,5'; await confirmarValorTerceiro('NORTE SHOPPING', 'a1'); });
  await page.waitForTimeout(400);
  const p = patches.pop();
  const gravado = p && ((p.b.all_data.avariasAll || {})['NORTE SHOPPING'] || []).find(x => x.id === 'a1');
  check('confirmar valor na aba Avarias grava, aceitando vírgula ("42,5" → loja_confirmou, R$ 42,50)', gravado && gravado.status === 'loja_confirmou' && gravado.valorTotal === 42.5, gravado);
  check('…e continua na aba Avarias depois de confirmar', await page.evaluate(() => S._terceirosModo === 'avarias' && /⚠️ Avarias/.test(document.getElementById('content').innerText)));

  // Permissão: quem tem Terceiros ganha Avarias.
  const perm = await page.evaluate(() => { const fonte = document.documentElement.innerHTML; return /S\.abasPermitidas\.has\('terceiros'\)\) S\.abasPermitidas\.add\('avarias'\)/.test(fonte); });
  check('quem tem permissão da aba Terceiros ganha a aba Avarias', perm);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
