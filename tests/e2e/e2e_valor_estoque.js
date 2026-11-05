// "No app lojas, na aba pedido, tem o valor estimado do estoque após a contagem de segunda:
//  verificar se tá puxando o valor atualizado do app estoque e pedido da aba catálogo, e colocar
//  a opção de gerar o relatório somente dessa parte, com seletor de lojas. Tem que fazer o valor
//  separado de itens de Insumos e tudo que for descartável e produtos de limpeza."
//
// O fixture usa a separação real do catálogo: UTILIDADES reúne DESCARTAVEL, LIMPEZA e GERAL
// (luva, bobina térmica); todo o resto é insumo.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS_APP = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Preço "novo" do catálogo, bem diferente do que estaria embutido no HTML — é o que prova
// que o valor vem do Catálogo e não de uma tabela congelada no app.
const CATALOGO = [
  { item_id: 9001, fornecedor: 'F', grupo: 'PROTEÍNA',   subgrupo: 'BOVINO',      produto: 'Carne Sol',   und: 'KG',  custo: 100, und_por_caixa: 10 },
  { item_id: 9002, fornecedor: 'F', grupo: 'MERCEARIA',  subgrupo: 'SECA',        produto: 'Arroz',       und: 'CX',  custo: 50,  und_por_caixa: null },
  { item_id: 9003, fornecedor: 'F', grupo: 'UTILIDADES', subgrupo: 'DESCARTAVEL', produto: 'Copo 200ml',  und: 'CX',  custo: 30,  und_por_caixa: null },
  { item_id: 9004, fornecedor: 'F', grupo: 'UTILIDADES', subgrupo: 'LIMPEZA',     produto: 'Detergente',  und: 'CX',  custo: 20,  und_por_caixa: null },
  { item_id: 9005, fornecedor: 'F', grupo: 'UTILIDADES', subgrupo: 'GERAL',       produto: 'Luva',        und: 'CX',  custo: 10,  und_por_caixa: null },
  { item_id: 9006, fornecedor: 'F', grupo: 'BEBIDAS',    subgrupo: 'CERVEJA',     produto: 'Sem preço',   und: 'CX',  custo: 0,   und_por_caixa: null },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  await ctx.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    if (/gn_catalogo/.test(url) && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOGO) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS_APP);
    try {
      await page.waitForFunction(() => {
        try { return typeof render === 'function' && typeof PRODUTOS_PEDIDO === 'object' && typeof LOJAS === 'object'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: app Lojas não carregou'); falhou++; break; } }
  }

  const existe = await page.evaluate(() => {
    try { return typeof _valorEstoqueLoja === 'function' && typeof _abrirRelatorioValorEstoque === 'function'; }
    catch (e) { return false; }
  });
  if (!existe) {
    console.log('FALHOU: o relatório de valor não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 12 falhou');
    await browser.close();
    process.exit(1);
  }

  // ── 1. O custo vem do Catálogo ──────────────────────────────────────────────────────
  const doCatalogo = await page.evaluate(async () => {
    await _sincronizarProdutosPedidoComCatalogo();
    const p = PRODUTOS_PEDIDO.find(x => x.item === 9001);
    return { achou: !!p, custo: p && p.custo, total: PRODUTOS_PEDIDO.length };
  });
  check('a lista de produtos é substituída pelo que está no Catálogo',
    doCatalogo.achou && doCatalogo.total === 6);
  check('e traz o custo de lá (R$ 100, não um valor congelado no app)', doCatalogo.custo === 100);

  // ── 2. Separação insumos × descartáveis/limpeza ─────────────────────────────────────
  const calc = await page.evaluate(() => {
    loja = 'BANGU';
    semana = getMonday(new Date());
    const k = 'BANGU|' + wkKey(semana);
    pedidoAll[k] = {
      9001: { cx: 2, und: 0 },   // insumo  2 × 100 = 200
      9002: { cx: 3, und: 0 },   // insumo  3 × 50  = 150
      9003: { cx: 4, und: 0 },   // descart 4 × 30  = 120
      9004: { cx: 1, und: 0 },   // limpeza 1 × 20  =  20
      9005: { cx: 5, und: 0 },   // geral   5 × 10  =  50
    };
    return _valorEstoqueLoja('BANGU');
  });
  check('insumos somam só o que é insumo (200 + 150 = 350)', calc.insumos === 350);
  check('descartáveis, limpeza e geral entram juntos no outro total (120 + 20 + 50 = 190)',
    calc.utilidades === 190);
  check('o total fecha com a soma dos dois', calc.total === 540 && calc.itens === 5);

  // ── 3. Unidade solta entra na conta ─────────────────────────────────────────────────
  const comUnd = await page.evaluate(() => {
    const k = 'BANGU|' + wkKey(semana);
    // Carne Sol: caixa de 10 und a R$100 → 5 unds soltas valem R$ 50
    pedidoAll[k] = { 9001: { cx: 2, und: 5 } };
    return _valorEstoqueLoja('BANGU');
  });
  check('unidade solta vira fração da caixa (2 cx + 5 und de 10 = R$ 250)', comUnd.insumos === 250);

  const semFator = await page.evaluate(() => {
    const k = 'BANGU|' + wkKey(semana);
    // Arroz não tem und_por_caixa: a unidade solta não pode virar valor inventado
    pedidoAll[k] = { 9002: { cx: 1, und: 7 } };
    return _valorEstoqueLoja('BANGU');
  });
  check('item sem und_por_caixa não inventa valor pra unidade solta', semFator.insumos === 50);

  // ── 4. Item sem custo no catálogo é sinalizado ──────────────────────────────────────
  const semPreco = await page.evaluate(() => {
    const k = 'BANGU|' + wkKey(semana);
    pedidoAll[k] = { 9001: { cx: 1, und: 0 }, 9006: { cx: 9, und: 0 } };
    return _valorEstoqueLoja('BANGU');
  });
  check('item sem custo no Catálogo entra como R$ 0 e é apontado',
    semPreco.total === 100 && semPreco.semCusto.length === 1 && /Sem preço/.test(semPreco.semCusto[0]));

  // ── 5. Seletor de lojas por permissão ───────────────────────────────────────────────
  const permissoes = await page.evaluate(() => {
    const r = {};
    usuarioAtual = { nome: 'Patrícia', cargo: 'caixa', loja: 'BANGU' };
    r.caixa = _lojasRelatorioValor();
    usuarioAtual = { nome: 'Tiago', cargo: 'gerente', loja: 'BANGU' };
    r.gestao = _lojasRelatorioValor();
    const salvo = loja;
    loja = 'MAGLIA';
    r.naMaglia = _lojasRelatorioValor();
    loja = salvo;
    return r;
  });
  check('loja comum só vê a própria loja no seletor',
    permissoes.caixa.length === 1 && permissoes.caixa[0] === 'BANGU');
  check(`gestão escolhe entre as lojas (${permissoes.gestao.length})`, permissoes.gestao.length > 1);
  check('Maglia fica fora do seletor por padrão (CLAUDE.md)',
    !permissoes.gestao.includes('MAGLIA'));
  check('mas quem está logado NA Maglia continua vendo a Maglia',
    permissoes.naMaglia.includes('MAGLIA'));

  // ── 6. O relatório ──────────────────────────────────────────────────────────────────
  const texto = await page.evaluate(() => {
    usuarioAtual = { nome: 'Tiago', cargo: 'gerente', loja: 'BANGU' };
    loja = 'BANGU';
    const kB = 'BANGU|' + wkKey(semana), kC = 'CAXIAS|' + wkKey(semana);
    pedidoAll[kB] = { 9001: { cx: 2 }, 9003: { cx: 4 } };          // 200 insumo + 120 descart
    pedidoAll[kC] = { 9002: { cx: 1 }, 9004: { cx: 2 } };          //  50 insumo +  40 limpeza
    _relValorSel = new Set(['BANGU', 'CAXIAS']);
    return _relValorTexto();
  });
  check('o relatório consolida as lojas escolhidas (250 insumo, 160 descart.)',
    /Insumos: R\$ 250,00/.test(texto.msg) && /limpeza: R\$ 160,00/.test(texto.msg));
  check('e mostra cada loja separada antes do consolidado',
    /Bangu/.test(texto.msg) && /Caxias/.test(texto.msg) && /CONSOLIDADO \(2 lojas\)/.test(texto.msg));
  check('diz que o preço é o do Catálogo', /Catálogo/.test(texto.msg));
  check('o total bate', /TOTAL: R\$ 410,00/.test(texto.msg));

  // ── 7. O número do cabeçalho usa a mesma conta ──────────────────────────────────────
  const cabecalho = await page.evaluate(() => {
    const k = 'BANGU|' + wkKey(semana);
    pedidoAll[k] = { 9001: { cx: 2, und: 5 }, 9003: { cx: 4 } };   // 250 + 120 = 370
    _barrisSemPendente = false;
    try { urgenciaGlobal = []; } catch (e) {}
    tab = 'pedido';
    render();
    const h = document.getElementById('content').innerHTML;
    return { tem370: /370,00 estimado/.test(h), temSplit: /🥘 250/.test(h) && /🧻 120/.test(h),
             temBotao: /_abrirRelatorioValorEstoque\(\)/.test(h) };
  });
  check('o "estimado" do cabeçalho usa a mesma conta do relatório (R$ 370)', cabecalho.tem370);
  check('e já mostra a separação ali mesmo', cabecalho.temSplit);
  check('o botão 💰 Valor aparece na aba Pedido', cabecalho.temBotao);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
