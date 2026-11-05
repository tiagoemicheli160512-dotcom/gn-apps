// "A atualização do relatório de preço do app lojas aba pedido ficou maravilhoso, teria como
//  colocar a opção selecionar mês também, e trimestral, e ao selecionar a loja, ao invés de só
//  juntar ter a opção de gerar o relatório individual."
//
// Mês/trimestre não cabem em pedidoAll (só a semana em memória): vêm de gn_contagens_pedido.
// E valor de estoque é FOTO, não fluxo — somar as semanas de um mês daria 4x o estoque que
// existe, então o período mostra o fechamento, a média e cada contagem.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS_APP = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Catálogo das DUAS regiões: a lista PRODUTOS_PEDIDO é só da região de quem está logado, e o
// item de SP só tem preço se o relatório buscar o catálogo pela região de cada loja.
const CATALOGO = [
  { id: 'cat-rj-1', item_id: 9001, regiao: 'RJ', grupo: 'PROTEÍNA',   subgrupo: 'BOVINO',      produto: 'Carne Sol',  und: 'KG', custo: 100, und_por_caixa: 10 },
  { id: 'cat-rj-2', item_id: 9002, regiao: 'RJ', grupo: 'UTILIDADES', subgrupo: 'DESCARTAVEL', produto: 'Copo 200ml', und: 'CX', custo: 30,  und_por_caixa: null },
  { id: 'cat-rj-3', item_id: 9003, regiao: 'RJ', grupo: 'MERCEARIA',  subgrupo: 'SECA',        produto: 'Sem preço',  und: 'KG', custo: 0,   und_por_caixa: null },
  { id: 'cat-sp-1', item_id: 9101, regiao: 'SP', grupo: 'PROTEÍNA',   subgrupo: 'BOVINO',      produto: 'Carne Sol',  und: 'KG', custo: 50,  und_por_caixa: null },
];

// Duas SEMANAS de contagem da Bangu em outubro (05/10 e 12/10) — é o par que prova que as
// semanas não se somam. O lançamento de 14/10 é o caso real que quebrou o desenho por data:
// gn_contagens_pedido também recebe acerto avulso no meio da semana (2 a 6 itens), e por data
// crua ele viraria o "fechamento" do mês, apagando a contagem de 210 itens da segunda.
const CONTAGENS = [
  { loja_slug: 'bangu',    catalogo_id: 'cat-rj-1', atual: 1, atual_cx: 1, atual_und: 0, data_contagem: '2026-10-05' },
  { loja_slug: 'bangu',    catalogo_id: 'cat-rj-2', atual: 2, atual_cx: 2, atual_und: 0, data_contagem: '2026-10-05' },
  { loja_slug: 'bangu',    catalogo_id: 'cat-rj-1', atual: 3, atual_cx: 3, atual_und: 0, data_contagem: '2026-10-12' },
  { loja_slug: 'bangu',    catalogo_id: 'cat-rj-2', atual: 1, atual_cx: 1, atual_und: 0, data_contagem: '2026-10-12' },
  { loja_slug: 'bangu',    catalogo_id: 'cat-rj-3', atual: 5, atual_cx: 5, atual_und: 0, data_contagem: '2026-10-12' },
  // Acerto avulso na quarta da MESMA semana, só de um item: tem que entrar na foto da semana
  // de 12/10 por cima do valor da segunda, não virar uma contagem própria.
  { loja_slug: 'bangu',    catalogo_id: 'cat-rj-1', atual: 4, atual_cx: 4, atual_und: 0, data_contagem: '2026-10-14' },
  { loja_slug: 'caxias',   catalogo_id: 'cat-rj-1', atual: 1, atual_cx: 1, atual_und: 5, data_contagem: '2026-10-12' },
  { loja_slug: 'itaquera', catalogo_id: 'cat-sp-1', atual: 4, atual_cx: 4, atual_und: 0, data_contagem: '2026-10-12' },
  // Dia de outubro, mas de uma semana que começou em setembro (segunda 28/09): pertence a
  // setembro, não pode aparecer em outubro.
  { loja_slug: 'bangu',    catalogo_id: 'cat-rj-1', atual: 50, atual_cx: 50, atual_und: 0, data_contagem: '2026-10-01' },
  // Fora do mês de outubro: entra só no trimestre.
  { loja_slug: 'bangu',    catalogo_id: 'cat-rj-1', atual: 99, atual_cx: 99, atual_und: 0, data_contagem: '2026-11-02' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });

  const urls = [];
  let falharContagens = false;
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request(), url = req.url();
    if (req.method() === 'GET') urls.push(url);
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_contagens_pedido/.test(url) && req.method() === 'GET') {
      if (falharContagens) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' });
      const de = (url.match(/data_contagem=gte\.([0-9-]+)/) || [])[1];
      const ate = (url.match(/data_contagem=lte\.([0-9-]+)/) || [])[1];
      const slugsRaw = (url.match(/loja_slug=in\.\(([^)]+)\)/) || [])[1];
      let r = CONTAGENS;
      if (de) r = r.filter(x => x.data_contagem >= de);
      if (ate) r = r.filter(x => x.data_contagem <= ate);
      if (slugsRaw) {
        const slugs = slugsRaw.split(',').map(s => decodeURIComponent(s));
        r = r.filter(x => slugs.includes(x.loja_slug));
      }
      return json(r);
    }
    if (/gn_catalogo/.test(url) && req.method() === 'GET') {
      const umaRegiao = (url.match(/regiao=eq\.([A-Z]+)/) || [])[1];
      const varias = (url.match(/regiao=in\.\(([^)]+)\)/) || [])[1];
      let r = CATALOGO;
      if (umaRegiao) r = r.filter(c => c.regiao === umaRegiao);
      else if (varias) { const rs = varias.split(','); r = r.filter(c => rs.includes(c.regiao)); }
      return json(r);
    }
    return json([]);
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
    } catch (e) { if (t >= 3) { console.log('FALHOU: app Lojas não carregou'); falhou++; await browser.close(); process.exit(1); } }
  }

  const existe = await page.evaluate(() => {
    try { return typeof _relValorSetPeriodo === 'function' && typeof _relValorCarregar === 'function' && typeof _relValorSetModo === 'function'; }
    catch (e) { return false; }
  });
  if (!existe) {
    console.log('FALHOU: o seletor de período/individual não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 24 falhou');
    await browser.close(); process.exit(1);
  }

  // Semana âncora: 05/10/2026 (segunda). Mês = outubro, trimestre = 4º (out–dez).
  const prep = async (lojas, periodo, modo) => page.evaluate(({ lojas, periodo, modo }) => {
    usuarioAtual = { nome: 'Tiago', cargo: 'gerente', loja: 'BANGU' };
    loja = 'BANGU';
    semana = new Date(2026, 9, 5);
    _relValorSel = new Set(lojas);
    _relValorPeriodo = periodo;
    _relValorModo = modo || 'consolidado';
    _relValorHist = null;
    _relValorErro = null;
    return _relValorCarregar();
  }, { lojas, periodo, modo });

  // ── 1. O período que o relatório cobre ──────────────────────────────────────────────
  const ranges = await page.evaluate(() => {
    semana = new Date(2026, 9, 5);
    const r = {};
    _relValorPeriodo = 'mes';       const m = _relValorRange();
    r.mes = { de: wkKey(m.de), ate: wkKey(m.ate), label: m.label, titulo: _relValorPeriodoLabel() };
    _relValorPeriodo = 'trimestre'; const t = _relValorRange();
    r.tri = { de: wkKey(t.de), ate: wkKey(t.ate), label: t.label };
    _relValorPeriodo = 'semana';    r.semanaLabel = _relValorPeriodoLabel();
    return r;
  });
  check('mês vai do dia 1 ao último dia do mês da semana na tela',
    ranges.mes.de === '2026-10-01' && ranges.mes.ate === '2026-10-31');
  check('e é chamado pelo nome ("Outubro de 2026")', ranges.mes.label === 'Outubro de 2026');
  check('trimestre pega out–dez (outubro é o 4º, não o 3º)',
    ranges.tri.de === '2026-10-01' && ranges.tri.ate === '2026-12-31' && /4º trimestre de 2026/.test(ranges.tri.label));
  check('semana continua dizendo a semana', /Semana de 05\/10\/2026/.test(ranges.semanaLabel));

  // ── 2. Mês de uma loja: foto por contagem, não soma ─────────────────────────────────
  urls.length = 0;
  await prep(['BANGU'], 'mes');
  const bangu = await page.evaluate(() => {
    const d = _relValorDados();
    return { n: d.length, loja: d[0] && d[0].loja, total: d[0] && d[0].total, itens: d[0] && d[0].itens,
             contagens: d[0] && d[0].resumo.contagens, media: d[0] && d[0].resumo.media.total,
             ultimaSemana: d[0] && d[0].resumo.ultimo.semana, maior: d[0] && d[0].resumo.maior.total,
             menor: d[0] && d[0].resumo.menor.total,
             semCusto: (_relValorHist.semCusto || []).join(',') };
  });
  check('a busca cobre a semana inteira das pontas (28/09 a 01/11), senão o último snapshot vem pela metade',
    urls.some(u => /gn_contagens_pedido/.test(u) && /gte\.2026-09-28/.test(u) && /lte\.2026-11-01/.test(u) && /loja_slug=in\.\(bangu\)/.test(u)));
  check('as duas SEMANAS de outubro são lidas (05/10 e 12/10) — o acerto de 14/10 não é uma terceira',
    bangu.contagens === 2);
  check('o acerto avulso de 14/10 entra na foto da semana de 12/10 por cima da segunda (400 + 30 = R$ 430)',
    bangu.total === 430 && bangu.ultimaSemana === '2026-10-12');
  check('e a média das semanas vem ao lado ((160+430)/2 = R$ 295)', bangu.media === 295);
  check('maior e menor semana do mês saem certos', bangu.maior === 430 && bangu.menor === 160);
  check('a semana que começou em setembro (segunda 28/09) não entra em outubro',
    bangu.maior !== 5000 && bangu.menor !== 5000);
  check('a contagem de novembro não entra no mês de outubro', bangu.total !== 9900 && bangu.maior !== 9900);
  check('item sem custo no Catálogo é apontado também no período', /Sem preço/.test(bangu.semCusto));

  // ── 3. Consolidado do período: evolução com quantas lojas contaram ──────────────────
  await prep(['BANGU', 'CAXIAS', 'ITAQUERA'], 'mes');
  const cons = await page.evaluate(() => {
    const evol = _relValorPorSemana();
    const d = _relValorDados();
    return { evol, soma: d.reduce((a, x) => a + x.total, 0),
             itaquera: (d.find(x => x.loja === 'ITAQUERA') || {}).total,
             caxias: (d.find(x => x.loja === 'CAXIAS') || {}).total,
             texto: _relValorTexto().msg };
  });
  check('a evolução traz uma linha por semana de contagem', cons.evol.length === 2);
  check('e diz quantas lojas contaram em cada semana (1 em 05/10, 3 em 12/10)',
    cons.evol[0].lojas === 1 && cons.evol[1].lojas === 3);
  check('o fechamento soma as 3 lojas (430 + 150 + 200 = 780)',
    cons.evol[1].total === 780 && cons.soma === 780);
  check('a loja de SP tem valor de verdade (catálogo buscado pela região dela)',
    cons.itaquera === 200);
  check('unidade solta continua virando fração da caixa (Caxias 1cx + 5und de 10 = R$ 150)',
    cons.caxias === 150);
  check('o catálogo é buscado pelas regiões das lojas escolhidas',
    urls.some(u => /gn_catalogo/.test(u) && /regiao=in\.\(/.test(u) && /SP/.test(u) && /RJ/.test(u)));
  check('o texto do consolidado traz as contagens do período e a média',
    /Contagens do período \(por semana\)/.test(cons.texto) && /Média: R\$ 470,00/.test(cons.texto));
  check('e avisa que as semanas não se somam', /não se somam/.test(cons.texto));

  // ── 4. Individual: um relatório por loja, sem consolidado ───────────────────────────
  await prep(['BANGU', 'CAXIAS', 'ITAQUERA'], 'mes', 'individual');
  const ind = await page.evaluate(() => ({
    todas: _relValorTexto().msg,
    soCaxias: _relValorTextoLoja('CAXIAS').msg,
    tituloCaxias: _relValorTextoLoja('CAXIAS').titulo,
  }));
  check('no individual cada loja tem o seu bloco',
    /Bangu/.test(ind.todas) && /Caxias/.test(ind.todas) && /Itaquera/.test(ind.todas));
  check('e NÃO existe consolidado (era justamente o que incomodava)',
    !/CONSOLIDADO/.test(ind.todas) && !/TOTAL: /.test(ind.todas));
  check('cada bloco traz fechamento, média e as semanas da loja',
    /Fechamento: semana de 12\/10/.test(ind.todas) && /Média das 2 contagens: R\$ 295,00/.test(ind.todas)
    && /semana de 05\/10: R\$ 160,00/.test(ind.todas));
  check('dá pra gerar o relatório de uma loja só',
    /Caxias/.test(ind.soCaxias) && !/Bangu/.test(ind.soCaxias) && !/Itaquera/.test(ind.soCaxias));
  check('com o nome da loja e o período no título',
    /Caxias/.test(ind.tituloCaxias) && /Outubro de 2026/.test(ind.tituloCaxias));

  // ── 5. Trimestre ───────────────────────────────────────────────────────────────────
  urls.length = 0;
  await prep(['BANGU'], 'trimestre');
  const tri = await page.evaluate(() => {
    const d = _relValorDados();
    return { contagens: d[0] && d[0].resumo.contagens, total: d[0] && d[0].total, ultimo: d[0] && d[0].resumo.ultimo.semana };
  });
  check('no trimestre entra também a semana de novembro (3 semanas)', tri.contagens === 3);
  check('e o fechamento passa a ser a de 02/11 (99cx × 100 = R$ 9.900)',
    tri.total === 9900 && tri.ultimo === '2026-11-02');

  // ── 6. Falha de rede não vira "nenhuma contagem" ────────────────────────────────────
  falharContagens = true;
  await prep(['BANGU'], 'mes');
  const comErro = await page.evaluate(() => ({ erro: _relValorErro, hist: _relValorHist, dados: _relValorDados().length }));
  check('falha de rede mostra o motivo em vez de dizer que não há contagem',
    !!comErro.erro && /conexão/.test(comErro.erro) && comErro.hist === null && comErro.dados === 0);
  falharContagens = false;
  const depois = await page.evaluate(() => { _relValorErro = null; return _relValorCarregar().then(() => _relValorDados().length); });
  check('e tentar de novo depois funciona (o vazio não ficou cacheado)', depois === 1);

  // ── 7. Semana continua lendo a memória, sem buscar nada ─────────────────────────────
  const semFetch = await page.evaluate(() => {
    semana = new Date(2026, 9, 5);
    loja = 'BANGU';
    _relValorPeriodo = 'semana';
    _relValorSel = new Set(['BANGU']);
    const k = 'BANGU|' + wkKey(semana);
    pedidoAll[k] = { 9001: { cx: 2, und: 0 }, 9002: { cx: 1, und: 0 } };   // 200 + 30
    return { total: (_relValorDados()[0] || {}).total, titulo: _relValorTexto().titulo };
  });
  check('na semana o valor sai da contagem em memória (R$ 230), sem ir ao banco', semFetch.total === 230);
  check('e o título diz a semana', /Semana de 05\/10\/2026/.test(semFetch.titulo));

  // ── 8. A tela renderiza nas quatro combinações, sem erro de JS ──────────────────────
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  const abrir = async (lojas, periodo, modo) => {
    await prep(lojas, periodo, modo);
    return page.evaluate(() => {
      document.getElementById('_relValorModal')?.remove();
      _abrirRelatorioValorEstoque();
      return document.getElementById('_relValorModal').innerHTML;
    });
  };
  const hSemana = await abrir(['BANGU'], 'semana');
  check('o modal oferece os três períodos',
    /_relValorSetPeriodo\('semana'\)/.test(hSemana) && /_relValorSetPeriodo\('mes'\)/.test(hSemana) && /_relValorSetPeriodo\('trimestre'\)/.test(hSemana));
  const hMesCons = await abrir(['BANGU', 'CAXIAS', 'ITAQUERA'], 'mes');
  check('no mês consolidado a tela mostra o fechamento e as contagens do período',
    /Fechamento do período · semana de 12\/10/.test(hMesCons) && /Contagens do período \(por semana\)/.test(hMesCons) && /R\$ 780,00/.test(hMesCons));
  check('com a opção de juntar ou gerar uma por loja',
    /_relValorSetModo\('consolidado'\)/.test(hMesCons) && /_relValorSetModo\('individual'\)/.test(hMesCons));
  const hMesInd = await abrir(['BANGU', 'CAXIAS', 'ITAQUERA'], 'mes', 'individual');
  check('no individual cada loja é um cartão com botão próprio de WhatsApp e PDF',
    (hMesInd.match(/_relValorWppLoja\(/g) || []).length === 3 && (hMesInd.match(/_relValorPDFLoja\(/g) || []).length === 3);
  check('e sem total consolidado na tela', !/Fechamento do período/.test(hMesInd));
  const hSemInd = await abrir(['BANGU'], 'semana', 'individual');
  check('semana + individual também renderiza (sem média, que não existe na semana)',
    /Valor do estoque contado/.test(hSemInd) && !/Média das/.test(hSemInd));
  check('nenhum erro de JS ao renderizar as combinações', erros.length === 0);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
