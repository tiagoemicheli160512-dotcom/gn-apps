// "Verificar se o hortifruti tá dentro desse valor. Pois é feito depois também."
//
// Não está, e não pode estar: o hortifruti saiu do ciclo semanal em setembro e passou a ter
// pedido próprio (segunda/quinta), onde a loja digita a quantidade que QUER receber — não há
// contagem de estoque dele. Mas ele entrava por duas portas:
//   • semana: a lista PRODUTOS_PEDIDO embutida no arquivo tem os 30 itens de hortifruti, e só
//     perde eles quando a sincronização com o catálogo volta (grupo=neq.HORTIFRUTI);
//   • mês/trimestre: gn_contagens_pedido tem as contagens de julho/agosto, quando ele ainda era
//     contado — na semana de 24/08 da Bangu foram R$ 16.927 de R$ 76.785 (22%).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS_APP = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const CATALOGO = [
  { id: 'cat-1', item_id: 9001, regiao: 'RJ', grupo: 'PROTEÍNA',   subgrupo: 'BOVINO',      produto: 'Carne Sol',  und: 'KG', custo: 100, und_por_caixa: null },
  { id: 'cat-2', item_id: 9002, regiao: 'RJ', grupo: 'UTILIDADES', subgrupo: 'DESCARTAVEL', produto: 'Copo 200ml', und: 'CX', custo: 30,  und_por_caixa: null },
  { id: 'cat-3', item_id: 9003, regiao: 'RJ', grupo: 'HORTIFRUTI', subgrupo: 'GERAL',       produto: 'Tomate',     und: 'KG', custo: 10,  und_por_caixa: null },
];

// Semana de 05/10: só o que é contado. Semana de 24/08 (agosto): ainda tinha hortifruti.
const CONTAGENS = [
  { loja_slug: 'bangu', catalogo_id: 'cat-1', atual: 2, atual_cx: 2, atual_und: 0, data_contagem: '2026-10-05' },
  { loja_slug: 'bangu', catalogo_id: 'cat-2', atual: 1, atual_cx: 1, atual_und: 0, data_contagem: '2026-10-05' },
  { loja_slug: 'bangu', catalogo_id: 'cat-1', atual: 1, atual_cx: 1, atual_und: 0, data_contagem: '2026-08-24' },
  { loja_slug: 'bangu', catalogo_id: 'cat-3', atual: 50, atual_cx: 50, atual_und: 0, data_contagem: '2026-08-24' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  const urls = [];
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request(), url = req.url();
    if (req.method() === 'GET') urls.push(url);
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_contagens_pedido/.test(url) && req.method() === 'GET') {
      const de = (url.match(/data_contagem=gte\.([0-9-]+)/) || [])[1];
      const ate = (url.match(/data_contagem=lte\.([0-9-]+)/) || [])[1];
      let r = CONTAGENS;
      if (de) r = r.filter(x => x.data_contagem >= de);
      if (ate) r = r.filter(x => x.data_contagem <= ate);
      return json(r);
    }
    if (/gn_catalogo/.test(url) && req.method() === 'GET') {
      // Reproduz o filtro real do servidor: o app pede grupo=neq.HORTIFRUTI na sincronização.
      let r = CATALOGO;
      if (/grupo=neq\.HORTIFRUTI/.test(url)) r = r.filter(c => c.grupo !== 'HORTIFRUTI');
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
    try { return typeof _ehHortifruti === 'function'; } catch (e) { return false; }
  });
  if (!existe) {
    console.log('FALHOU: a exclusão do hortifruti não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 9 falhou');
    await browser.close(); process.exit(1);
  }

  // ── 1. A lista embutida no ARQUIVO tem hortifruti — é a porta de entrada na semana ──
  // (em memória ela já foi substituída pelo catálogo filtrado; o risco é antes da
  //  sincronização voltar, ou se ela falhar — aí a lista embutida é a que vale)
  const embutida = require('fs').readFileSync(LOJAS_APP, 'utf8')
    .match(/const PRODUTOS_PEDIDO = (\[[\s\S]*?\]);/);
  const listaArquivo = JSON.parse(embutida[1]);
  const hortiArquivo = listaArquivo.filter(p => String(p.grupo || '').toUpperCase() === 'HORTIFRUTI');
  check(`a lista embutida no arquivo traz hortifruti (${hortiArquivo.length} itens) — por isso a exclusão não pode depender só do filtro do catálogo`,
    hortiArquivo.length > 0);

  // ── 2. Semana: hortifruti não entra, mesmo com quantidade lançada ───────────────────
  // Simula o estado de antes da sincronização: a lista com hortifruti dentro.
  const semana = await page.evaluate((hortiDoArquivo) => {
    usuarioAtual = { nome: 'Tiago', cargo: 'gerente', loja: 'BANGU' };
    loja = 'BANGU';
    semana = new Date(2026, 9, 5);
    const horti = { ...hortiDoArquivo, custo: 10 };
    PRODUTOS_PEDIDO.push(horti);
    const carne = PRODUTOS_PEDIDO.find(p => !_ehHortifruti(p) && (parseFloat(p.custo) || 0) > 0);
    const k = 'BANGU|' + wkKey(semana);
    pedidoAll[k] = {};
    pedidoAll[k][carne.item] = { cx: 1, und: 0 };
    pedidoAll[k][horti.item] = { cx: 999, und: 0 };   // quantidade enorme de propósito
    const v = _valorEstoqueLoja('BANGU');
    const idx = PRODUTOS_PEDIDO.indexOf(horti);
    if (idx !== -1) PRODUTOS_PEDIDO.splice(idx, 1);
    return { total: v.total, itens: v.itens, custoCarne: parseFloat(carne.custo), nomeHorti: horti.produto };
  }, hortiArquivo[0]);
  check(`na semana o hortifruti lançado NÃO entra no valor (${semana.nomeHorti} com 999 cx ficou fora)`,
    semana.itens === 1 && Math.abs(semana.total - semana.custoCarne) < 0.01);
  check('e o total é exatamente o do item contado, sem sobra',
    semana.total === semana.custoCarne);

  // ── 3. Mês de outubro: sem hortifruti no período, nada a avisar ─────────────────────
  const prep = (periodo) => page.evaluate((periodo) => {
    loja = 'BANGU'; usuarioAtual = { nome: 'Tiago', cargo: 'gerente', loja: 'BANGU' };
    _relValorSel = new Set(['BANGU']);
    _relValorPeriodo = periodo; _relValorModo = 'consolidado';
    _relValorHist = null; _relValorErro = null;
    return _relValorCarregar();
  }, periodo);

  await page.evaluate(() => { semana = new Date(2026, 9, 5); });
  await prep('mes');
  const out = await page.evaluate(() => ({
    total: (_relValorDados()[0] || {}).total,
    hortiSemanas: _relValorHist.hortiSemanas,
    texto: _relValorTexto().msg,
  }));
  check('outubro soma só o que é contado (2×100 + 1×30 = R$ 230)', out.total === 230);
  check('e não avisa sobre hortifruti, porque nenhuma semana de outubro tinha',
    (out.hortiSemanas || []).length === 0);
  check('mas o rodapé diz sempre que hortifruti não entra',
    /Hortifruti não entra/.test(out.texto));

  // ── 4. Agosto: o hortifruti contado fica FORA e o relatório avisa ───────────────────
  await page.evaluate(() => { semana = new Date(2026, 7, 24); });
  await prep('mes');
  const ago = await page.evaluate(() => ({
    total: (_relValorDados()[0] || {}).total,
    hortiSemanas: _relValorHist.hortiSemanas,
    hortiValor: _relValorHist.hortiValor,
    texto: _relValorTexto().msg,
    html: (() => { document.getElementById('_relValorModal')?.remove(); _abrirRelatorioValorEstoque();
                   return document.getElementById('_relValorModal').innerHTML; })(),
  }));
  check('a semana de agosto vale só R$ 100 — os R$ 500 de hortifruti ficaram fora',
    ago.total === 100);
  check('o relatório registra a semana que ainda tinha hortifruti e quanto deixou de fora',
    (ago.hortiSemanas || []).length === 1 && ago.hortiValor === 500);
  check('e avisa que semanas antes e depois de setembro não são comparáveis',
    /não são comparáveis/.test(ago.texto) && /não são comparáveis/.test(ago.html));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
