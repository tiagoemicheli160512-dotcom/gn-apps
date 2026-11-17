// 17/11/2026: o pedido da CIA MATHEUS da semana de 09/11 (toucinho e calabresa, 17 itens em
// 9 lojas) foi lançado e nunca confirmado — sem previsão de entrega, São Gonçalo dizia que
// não tinha nada pra hoje e o comprador via o pedido "lá". "Pode criar o aviso também."
//
// Cobra: aviso VERMELHO pro fornecedor da semana passada com itens e nenhuma previsão
// (quem tem previsão não aparece); aviso ÂMBAR de quarta em diante pros fornecedores da
// semana com itens e sem confirmar (segunda/terça não, é barulho); "não vai ser pedido"
// esconde o fornecedor.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

// Semana de "hoje" no relógio fixo: quarta 18/11/2026 → segunda 16/11; semana passada 09/11.
const ITENS = [
  { catalogo_id: 'c-touc', loja_slug: 'sao_goncalo', qtd_pedida: 40 },
  { catalogo_id: 'c-cala', loja_slug: 'sao_goncalo', qtd_pedida: 20 },
  { catalogo_id: 'c-touc', loja_slug: 'bangu', qtd_pedida: 20 },
  { catalogo_id: 'c-coca', loja_slug: 'bangu', qtd_pedida: 8 },     // COCA COLA, confirmada
];
const PROVS = [{ fornecedor: 'COCA COLA', catalogo_id: 'c-coca' }];

async function abrir(browser, quando) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, quando);
  const urls = [];
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url()); urls.push(u);
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_pedidos\?/.test(u) && /semana_inicio=eq\.2026-11-09/.test(u)) return json([{ id: 'ped-ant' }]);
    if (/gn_pedido_itens\?/.test(u) && /ped-ant/.test(u)) return json(ITENS);
    if (/gn_provisoes\?/.test(u) && /ped-ant/.test(u)) return json(PROVS);
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.addInitScript(() => { try { localStorage.removeItem('gn_pedidos_pend_forn_dispensa'); } catch (e) {} });
  await page.goto('file://' + PEDIDOS);
  await page.waitForFunction(() => { try { return typeof renderPedido === 'function' && typeof S === 'object' && S !== null; } catch (e) { return false; } }, null, { timeout: 25000 });
  return { ctx, page, erros, urls };
}
const prepara = page => page.evaluate(() => {
  S.regiao = 'RJ'; S.hortifrutiAtivo = false; S.eduAtivo = S.oseasAtivo = S.matheusAtivo = false;
  S.catalogo = [
    { id: 'c-touc', produto: 'Toucinho fresco Cx 20 kg', fornecedor: 'CIA MATHEUS', ativo: true },
    { id: 'c-cala', produto: 'Linguiça calabresa Cx 15 Kg', fornecedor: 'CIA MATHEUS', ativo: true },
    { id: 'c-coca', produto: 'Coca LT', fornecedor: 'COCA COLA', ativo: true },
    { id: 'c-pama', produto: 'Queijo coalho', fornecedor: 'PAMA', ativo: true },
  ];
  S.lojas = [{ slug_pedido: 'bangu', nome_display: 'Bangu' }, { slug_pedido: 'sao_goncalo', nome_display: 'São Gonçalo' }];
  S.semanaAtiva = getMondayOfWeek();
  S.pedidoAtual = { id: 'ped-atual', status: 'RASCUNHO' };
  // Esta semana: PAMA com itens e sem confirmar; COCA confirmada.
  S.pedidoItens = { 'c-pama': { bangu: { qtd: 4 } }, 'c-coca': { bangu: { qtd: 2 } } };
  S.fornecedoresConfirmados = new Set(['COCA COLA']); S.fornecedoresReabertos = new Set();
});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todos = [];
  const a = await abrir(browser, '2026-11-18T10:00:00');   // quarta
  if (!(await a.page.evaluate(() => typeof _avisoFornSemConfirmarHtml === 'function'))) {
    console.log('FALHOU: o aviso de fornecedor sem confirmar não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  await prepara(a.page);
  const r = await a.page.evaluate(async () => {
    S.pendSemanaAnterior = await _carregarPendSemanaAnterior(getMondayOfWeek());
    const h = document.createElement('div'); h.innerHTML = _avisoFornSemConfirmarHtml(); document.body.appendChild(h);
    const ant = (h.querySelector('.aviso-pend-forn-ant') || {}).innerText || '', atual = (h.querySelector('.aviso-pend-forn') || {}).innerText || '';
    h.remove();
    return { pend: S.pendSemanaAnterior, ant, atual };
  });
  check('semana passada: CIA MATHEUS com 3 itens em 2 lojas e nenhuma previsão vira aviso', r.pend.length === 1 && r.pend[0].forn === 'CIA MATHEUS' && r.pend[0].itens === 3 && r.pend[0].lojas === 2, r.pend);
  check('…quem tem previsão (COCA COLA) não entra', !r.pend.some(x => x.forn === 'COCA COLA'), r.pend);
  check('o aviso vermelho diz a semana, o fornecedor e o que fazer', /Semana passada \(09\/11\) ficou sem confirmar/.test(r.ant) && /CIA MATHEUS — 3 itens em 2 lojas/.test(r.ant) && /entrega essa semana/.test(r.ant), r.ant);
  check('quarta: aviso âmbar com o fornecedor da semana com itens e sem confirmar (PAMA), sem a confirmada', /1 fornecedor com itens e ainda sem confirmar/.test(r.atual) && /PAMA/.test(r.atual) && !/COCA/.test(r.atual), r.atual);
  check('busca a semana passada pela região aberta', a.urls.some(u => /gn_pedidos\?/.test(u) && /semana_inicio=eq\.2026-11-09/.test(u) && /regiao=eq\.RJ/.test(u)), a.urls.filter(u => /gn_pedidos\?/.test(u)));

  const disp = await a.page.evaluate(() => {
    let rendeu = 0; const o = renderPedido; renderPedido = () => { rendeu++; };
    const h = document.createElement('div'); h.innerHTML = _avisoFornSemConfirmarHtml(); document.body.appendChild(h);
    h.querySelector('.aviso-pend-forn-ant button').click(); h.remove();
    const depois = _avisoFornSemConfirmarHtml(); renderPedido = o;
    return { rendeu, temAnt: /ficou sem confirmar/.test(depois), temAtual: /PAMA/.test(depois) };
  });
  check('"não vai ser pedido" esconde a CIA MATHEUS e mantém o resto', disp.rendeu === 1 && !disp.temAnt && disp.temAtual, disp);

  const hort = await a.page.evaluate(() => { S.hortifrutiAtivo = true; const h = _avisoFornSemConfirmarHtml(); S.hortifrutiAtivo = false; return h; });
  check('Hortifruti (pedido por dia) não mostra o aviso', hort === '');
  todos.push(...a.erros); await a.ctx.close();

  const b = await abrir(browser, '2026-11-17T10:00:00');   // terça
  await prepara(b.page);
  const ter = await b.page.evaluate(() => { S.pendSemanaAnterior = []; return _avisoFornSemConfirmarHtml(); });
  check('terça: sem aviso âmbar da semana (o pedido ainda está sendo montado)', !/ainda sem confirmar/.test(ter), ter);
  todos.push(...b.erros); await b.ctx.close();

  check('nenhum erro de JavaScript', todos.length === 0, todos);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
