// "Pode fazer a correção pra São Paulo."
//
// A lista de urgência é uma só pra rede, mas o item de SP é OUTRA linha do catálogo: Rio
// 0–512, SP 1004–1506, sem id em comum. origem_item_id liga uma na outra (conferido no
// banco: 282/282 das linhas de SP apontam pra uma linha do Rio).
//
// O app do Compras tem chave de região e grava o item_id da tela, então a marcação pode
// nascer dos dois lados. O teste checa os DOIS sentidos, e checa que espelhar não é
// necessário: o mesmo urgenciaGlobal com ids só do Rio tem que travar Itaquera.
//
// E checa o que não pode quebrar: o Rio continua igual, e sem o mapa (rede fora) ninguém
// fica travado por engano.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS_APP = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Dois itens, cada um com sua linha nas duas regiões (como no banco real).
const CAT_RJ = [
  { item: 10, origem_item_id: null, produto: 'COCA LATA',   grupo: 'BEBIDAS' },
  { item: 11, origem_item_id: null, produto: 'GUARANA',     grupo: 'BEBIDAS' },
  { item: 12, origem_item_id: null, produto: 'TORRESMO',    grupo: 'PETISCOS' },
];
const CAT_SP = [
  { item: 1010, origem_item_id: 10, produto: 'COCA LATA',   grupo: 'BEBIDAS' },
  { item: 1011, origem_item_id: 11, produto: 'GUARANA',     grupo: 'BEBIDAS' },
  { item: 1012, origem_item_id: 12, produto: 'TORRESMO',    grupo: 'PETISCOS' },
];
// O mapa que _carregarTraducaoUrgencia busca no banco
const TRAD = CAT_SP.map(p => ({ item_id: p.item, origem_item_id: p.origem_item_id }));

async function abrir(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url());
    if (/gn_catalogo/.test(u) && /origem_item_id=not\.is\.null/.test(u)) {
      if (opts.semMapa) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TRAD) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS_APP);
    try {
      await page.waitForFunction(() => {
        try { return typeof _urgEhUrgente === 'function' && typeof _carregarTraducaoUrgencia === 'function'; }
        catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  return { ctx, page };
}

// Põe a loja da região pedida com o catálogo dela e a lista de urgência dada.
const cenario = (page, o) => page.evaluate((o) => {
  usuarioAtual = { id: 1, nome: 'T', cargo: 'gerente', loja: o.loja };
  loja = o.loja;
  urgenciaGlobal = o.marcados.map(String);
  PRODUTOS_PEDIDO.length = 0;
  o.catalogo.forEach(p => PRODUTOS_PEDIDO.push(Object.assign({
    fornecedor: 'F', subgrupo: '', und: 'UN', custo: 0,
  }, p)));
  getProdutosPedidoOrdenados = function () { return PRODUTOS_PEDIDO.slice(); };
  pedidoAll[lojaKey()] = {};
  return _carregarTraducaoUrgencia().then(() => ({
    presentes: _urgItensPresentes(),
    aplicavel: _urgAplicavel(),
    faltam: _urgFaltamContar(),
    grupos: _urgGruposLoja().map(g => g.grupo + ':' + g.total),
    urgentes: getProdutosPedidoOrdenados().filter(p => _urgEhUrgente(p)).map(p => String(p.item)),
    temMapa: !!_urgTradPorId,
  }));
}, o);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. O caso de hoje: lista com ids SÓ do Rio ─────────────────────────────────
  const a = await abrir(browser);
  const marcadosRJ = [10, 11, 12];

  const rio = await cenario(a.page, { loja: 'PEDREIRA', catalogo: CAT_RJ, marcados: marcadosRJ });
  check('o Rio continua reconhecendo os 3 marcados', rio.urgentes.join() === '10,11,12');
  check('e a trava continua aplicável lá', rio.aplicavel === true);
  check('com os 3 por contar', rio.faltam === 3);

  const sp = await cenario(a.page, { loja: 'ITAQUERA', catalogo: CAT_SP, marcados: marcadosRJ });
  check('Itaquera passa a reconhecer os 3, pelos ids DELA', sp.urgentes.join() === '1010,1011,1012');
  check('e a trava passa a valer em SP', sp.aplicavel === true);
  check('com os 3 por contar', sp.faltam === 3);
  check('_urgItensPresentes devolve os ids da loja, não os marcados',
    sp.presentes.join() === '1010,1011,1012');
  check('e as categorias saem certas em SP', sp.grupos.join() === 'BEBIDAS:2,PETISCOS:1');

  // ── 2. O sentido inverso: Matheus marcou com SP selecionado ───────────────────
  const marcadosSP = [1010, 1011];
  const spMarcouSp = await cenario(a.page, { loja: 'GUARULHOS', catalogo: CAT_SP, marcados: marcadosSP });
  check('marcação feita em SP vale em SP', spMarcouSp.urgentes.join() === '1010,1011');
  const rioMarcouSp = await cenario(a.page, { loja: 'BANGU', catalogo: CAT_RJ, marcados: marcadosSP });
  check('e a MESMA marcação de SP alcança o Rio', rioMarcouSp.urgentes.join() === '10,11');
  check('sem arrastar o item que não foi marcado', !rioMarcouSp.urgentes.includes('12'));

  // ── 3. Marcação misturada não duplica nem perde ──────────────────────────────
  const misto = await cenario(a.page, { loja: 'ITAQUERA', catalogo: CAT_SP, marcados: [10, 1011] });
  check('lista com um id de cada região resolve os dois', misto.urgentes.join() === '1010,1011');
  check('e conta 2, não 4', misto.faltam === 2);

  // ── 4. Item sem par na outra região não atrapalha ────────────────────────────
  const soRio = await cenario(a.page, {
    loja: 'ITAQUERA', catalogo: CAT_SP,
    marcados: [10, 999],                       // 999 não existe em lugar nenhum
  });
  check('id marcado que não existe no catálogo da loja é ignorado', soRio.urgentes.join() === '1010');
  await a.ctx.close();

  // ── 5. Sem o mapa (rede fora): o Rio intacto, SP como era — ninguém travado à toa ──
  const b = await abrir(browser, { semMapa: true });
  const rioSemMapa = await cenario(b.page, { loja: 'PEDREIRA', catalogo: CAT_RJ, marcados: marcadosRJ });
  check('sem o mapa, o Rio não muda nada', rioSemMapa.urgentes.join() === '10,11,12' && rioSemMapa.aplicavel === true);
  const spSemMapa = await cenario(b.page, { loja: 'ITAQUERA', catalogo: CAT_SP, marcados: marcadosRJ });
  check('sem o mapa, SP volta a não ter urgência — e NÃO fica travada vazia',
    spSemMapa.urgentes.length === 0 && spSemMapa.aplicavel === false);
  check('e o mapa não é marcado como carregado, pra tentar de novo depois',
    spSemMapa.temMapa === false);
  await b.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
