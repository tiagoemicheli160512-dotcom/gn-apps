// "No app estoque e pedido na aba produção [...] a Morgana só tem acesso a ver essa aba. Como
//  fizemos a separação da região, quando ela entra pra ver as quantidades não soma pra ela a de
//  São Paulo, pois ela teria que selecionar a região — como ela não tem acesso, é possível
//  colocar a quantidade unificada pra ela ver o total do pedido incluindo São Paulo?"
//
// A cozinha é uma só e produz pras 12 lojas, mas o mesmo produto tem uma linha de catálogo por
// região (MASSA DE AIPIM = item 502 no RJ e 1502 em SP). S.catalogo vem filtrado por S.regiao,
// então a aba somava só a demanda da região selecionada. Números reais da semana de 28/09:
// RJ 1.242 unidades, SP 578 (Itaquera 362 + Guarulhos 216) — 32% invisível.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const APP = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const CATALOGO = [
  { id: 'rj-aipim', item_id: 502,  regiao: 'RJ', fornecedor: 'PETISCOS', ativo: true, produto: 'MASSA DE AIPIM', und: 'KG' },
  { id: 'sp-aipim', item_id: 1502, regiao: 'SP', fornecedor: 'PETISCOS', ativo: true, produto: 'MASSA DE AIPIM', und: 'KG' },
  { id: 'rj-vatapa', item_id: 414,  regiao: 'RJ', fornecedor: 'PETISCOS', ativo: true, produto: 'VATAPÁ 500G', und: 'UND' },
  { id: 'sp-vatapa', item_id: 1414, regiao: 'SP', fornecedor: 'PETISCOS', ativo: true, produto: 'VATAPÁ 500G', und: 'UND' },
  // Só SP, sem par no RJ: não pode sumir da aba só porque a cozinha é do Rio.
  { id: 'sp-only',  item_id: 1999, regiao: 'SP', fornecedor: 'PETISCOS', ativo: true, produto: 'TAPIOCA SP', und: 'UND' },
];
const LOJAS = [
  { slug_pedido: 'bangu',    nome_display: 'Bangu',    regiao: 'RJ', ativo: true, ordem: 1 },
  { slug_pedido: 'itaquera', nome_display: 'Itaquera', regiao: 'SP', ativo: true, ordem: 2 },
  { slug_pedido: 'guarulhos',nome_display: 'Guarulhos',regiao: 'SP', ativo: true, ordem: 3 },
];
// Semana de 28/09, proporções reais: muito mais demanda em SP do que o RJ sozinho mostrava.
const PROVISOES = [
  { catalogo_id: 'rj-aipim',  qtd_prevista: 100, loja_slug: 'bangu' },
  { catalogo_id: 'sp-aipim',  qtd_prevista: 362, loja_slug: 'itaquera' },
  { catalogo_id: 'sp-aipim',  qtd_prevista: 216, loja_slug: 'guarulhos' },
  { catalogo_id: 'rj-vatapa', qtd_prevista:  40, loja_slug: 'bangu' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  const urls = [];
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request(), url = req.url(), m = req.method();
    if (m === 'GET') urls.push(url);
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_catalogo/.test(url) && m === 'GET') {
      const reg = (url.match(/regiao=eq\.([A-Z]+)/) || [])[1];
      const forn = /fornecedor=eq\.PETISCOS/.test(url);
      let r = CATALOGO;
      if (reg) r = r.filter(c => c.regiao === reg);
      if (forn) r = r.filter(c => c.fornecedor === 'PETISCOS');
      return json(r);
    }
    if (/gn_lojas_pedido/.test(url) && m === 'GET') {
      const reg = (url.match(/regiao=eq\.([A-Z]+)/) || [])[1];
      return json(reg ? LOJAS.filter(l => l.regiao === reg) : LOJAS);
    }
    if (/gn_provisoes/.test(url) && m === 'GET') {
      const inn = (url.match(/catalogo_id=in\.\(([^)]+)\)/) || [])[1];
      let r = PROVISOES;
      if (inn) { const ids = inn.split(',').map(x => decodeURIComponent(x).replace(/^"|"$/g, '')); r = r.filter(p => ids.includes(p.catalogo_id)); }
      return json(r);
    }
    if (/gn_producao_estoque/.test(url)) return json([]);
    return json([]);
  });

  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + APP);
    try {
      await page.waitForFunction(() => {
        try { return typeof _producaoDadosSemana === 'function' && typeof S === 'object' && S !== null; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: o app Pedidos não carregou'); falhou++; await browser.close(); process.exit(1); } }
  }

  const existe = await page.evaluate(() => {
    try { return typeof _producaoCarregarRede === 'function'; } catch (e) { return false; }
  });
  if (!existe) {
    console.log('FALHOU: a Produção unificada não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 10 falhou');
    await browser.close(); process.exit(1);
  }

  // ── 1. O catálogo da aba junta as duas regiões ─────────────────────────────────────
  const rede = await page.evaluate(async () => {
    S.regiao = 'RJ';                 // é como a Morgana entra: região do Rio, sem poder trocar
    _producaoRedeCache = null;
    const r = await _producaoCarregarRede(true);
    return { produtos: r.produtos.map(p => p.produto).sort(), donos: r.donoPorId,
             idsTodos: r.idsTodos.slice().sort(), lojas: r.lojas.map(l => l.nome_display) };
  });
  check('a aba lista cada produto UMA vez, sem duplicar o par RJ/SP',
    rede.produtos.join(' | ') === 'MASSA DE AIPIM | TAPIOCA SP | VATAPÁ 500G');
  check('e o par das duas regiões aponta pro mesmo dono',
    rede.donos['rj-aipim'] === 'rj-aipim' && rede.donos['sp-aipim'] === 'rj-aipim');
  check('o dono é a linha do RJ, onde mora o histórico de estoque da cozinha',
    rede.donos['rj-vatapa'] === 'rj-vatapa' && rede.donos['sp-vatapa'] === 'rj-vatapa');
  check('produto que só existe em SP não some da aba', rede.donos['sp-only'] === 'sp-only');
  check('as lojas de SP aparecem nas abas de loja (antes só vinham as da região ativa)',
    rede.lojas.includes('Itaquera') && rede.lojas.includes('Guarulhos') && rede.lojas.includes('Bangu'));

  // ── 2. A saída soma as duas regiões ────────────────────────────────────────────────
  const dados = await page.evaluate(async () => {
    const r = await _producaoCarregarRede();
    const ids = r.produtos.map(p => p.id);
    const seg = new Date(2026, 8, 28);          // segunda 28/09/2026
    const d = await _producaoDadosSemana(ids, seg, r.donoPorId, r.idsTodos);
    return { saida: d.saidaMap, porLoja: d.saidaPorLoja };
  });
  check('MASSA DE AIPIM soma RJ + SP (100 + 362 + 216 = 678), não só os 100 do Rio',
    dados.saida['rj-aipim'] === 678);
  check('e a demanda de SP não vira uma linha separada', dados.saida['sp-aipim'] === undefined);
  check('produto sem demanda em SP continua com o número dele (40)', dados.saida['rj-vatapa'] === 40);
  check('a quebra por loja mostra Itaquera e Guarulhos junto com Bangu',
    dados.porLoja['rj-aipim'].bangu === 100 && dados.porLoja['rj-aipim'].itaquera === 362
    && dados.porLoja['rj-aipim'].guarulhos === 216);

  // ── 3. A busca das provisões usa os uuids das duas regiões ────────────────────────
  const urlProv = urls.filter(u => /gn_provisoes/.test(u)).pop();
  check('a consulta de provisões inclui o uuid de SP (era isso que faltava)',
    !!urlProv && /sp-aipim/.test(urlProv) && /rj-aipim/.test(urlProv));

  // ── 4. Estar no RJ ou em SP dá o mesmo total — a aba é da rede ────────────────────
  const emSP = await page.evaluate(async () => {
    S.regiao = 'SP';
    _producaoRedeCache = null;
    const r = await _producaoCarregarRede(true);
    const seg = new Date(2026, 8, 28);
    const d = await _producaoDadosSemana(r.produtos.map(p => p.id), seg, r.donoPorId, r.idsTodos);
    return { total: d.saidaMap[r.donoPorId['rj-aipim']], produtos: r.produtos.length };
  });
  check('com a região SP selecionada o total é o mesmo (678) e a lista é a mesma',
    emSP.total === 678 && emSP.produtos === 3);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
