// "O Matheus me passou que os cadastros de São Paulo mudaram os fornecedores que são do Rio;
//  sumiram os do Rio e ficou o que ele cadastrou em São Paulo, no Rio. E tem pedido pra
//  confirmar do Rio, mas tá como fornecedor de São Paulo."
//
// Foi o que aconteceu em 21/10/2026: entre 16:41 e 16:57, 27 itens do catálogo do RIO tiveram
// fornecedor e custo trocados pelos de São Paulo (PETICO/PMG); às 16:59 as gravações passaram
// a cair em SP e às 17:18 o pedido de SP foi confirmado certo, pra Itaquera e Guarulhos.
//
// Duas coisas no app permitiam isso:
//   1. a tela do Catálogo não dizia em QUE região se está editando (a região fica lembrada do
//      navegador e, se o valor salvo não for exatamente 'SP', o app abre no Rio);
//   2. carregarFornecedores() é a única rotina que não filtra por região — o select do
//      catálogo do Rio oferecia os fornecedores de SP sem nenhuma distinção.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (extra ? '  → ' + extra : '')); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 950 } });

  // O supabase-js vem do CDN e, quando a rede falha, o bloco inteiro do app aborta e todo
  // `let` de topo fica em TDZ ("S is not defined"). Servindo do disco, a suíte não depende
  // da rede pra nada.
  await ctx.route('**/cdn.jsdelivr.net/**', (route) => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: require('fs').readFileSync('' + CAMINHOS.fix('supabase.min.js') + '', 'utf8') }));

  let chamadas = [];
  await ctx.route('**/rest/v1/**', (route) => {
    const req = route.request();
    chamadas.push({ m: req.method(), url: req.url(), body: req.postData() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + PEDIDOS);
    try {
      await page.waitForFunction(() => {
        try { return typeof renderCatalogo === 'function' && typeof editarProduto === 'function'
                   && typeof salvarEdicaoProduto === 'function'; } catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('ERRO: app Pedidos não carregou'); process.exit(2); } }
  }

  // Catálogo do RIO (é o que carregarCatalogo traz quando S.regiao='RJ') e o cadastro de
  // fornecedor como ele é de verdade: um só, com os de SP no meio.
  const montar = () => page.evaluate(() => {
    S.regiao = 'RJ';
    S.catalogo = [
      { id: 'rj-1', item_id: 101, produto: 'leite condensado', grupo: 'MERCEARIA', subgrupo: 'GERAL',
        fornecedor: 'RIO', und: 'CX', custo: 6.59, und_por_caixa: 12, ativo: true },
      { id: 'rj-2', item_id: 102, produto: 'Maionese Balde', grupo: 'MERCEARIA', subgrupo: 'GERAL',
        fornecedor: 'ARCO', und: 'UND', custo: 28, ativo: true },
      { id: 'rj-3', item_id: 103, produto: 'açucar', grupo: 'MERCEARIA', subgrupo: 'GERAL',
        fornecedor: 'NUTRIMAX', und: 'KG', custo: 3.89, ativo: true },
    ];
    S.fornecedores = [
      { id: 'f1', nome: 'RIO' }, { id: 'f2', nome: 'ARCO' }, { id: 'f3', nome: 'NUTRIMAX' },
      { id: 'f4', nome: 'TOP MATHEUS' },
      { id: 'f5', nome: 'PETICO' }, { id: 'f6', nome: 'PMG' }, // só têm itens em São Paulo
    ];
    S.tab = 'catalogo';
    renderCatalogo();
    return true;
  });
  await montar();

  // ── 1. A tela diz em que região se está ──────────────────────────────────────────────
  {
    const t = await page.evaluate(() => {
      const txt = document.getElementById('content').innerText;
      return { txt, temBotaoSP: !!document.querySelector('#content button[onclick*="trocarRegiaoPedido(\'SP\')"]') };
    });
    check('o Catálogo diz que é o catálogo do Rio de Janeiro', /Catálogo de RIO DE JANEIRO/.test(t.txt));
    check('e dá pra trocar de região sem sair da tela', t.temBotaoSP);
  }

  // ── 2. O select separa quem não é da região ─────────────────────────────────────────
  {
    const sel = await page.evaluate(() => {
      editarProduto('rj-2'); // Maionese Balde, hoje ARCO (Rio)
      const el = document.getElementById('m-forn');
      const grupos = [...el.querySelectorAll('optgroup')].map(g => ({
        label: g.label, nomes: [...g.querySelectorAll('option')].map(o => o.value) }));
      return { grupos, valor: el.value };
    });
    const daRegiao = sel.grupos.find(g => /RIO DE JANEIRO/.test(g.label));
    const outras   = sel.grupos.find(g => /outra região/i.test(g.label));
    check('os fornecedores do Rio ficam num grupo próprio',
      !!daRegiao && ['ARCO','NUTRIMAX','RIO'].every(n => daRegiao.nomes.includes(n)));
    check('e PETICO/PMG caem no grupo de outra região',
      !!outras && outras.nomes.includes('PETICO') && outras.nomes.includes('PMG'));
    check('sem deixar fornecedor de SP passar por fornecedor do Rio',
      !!daRegiao && !daRegiao.nomes.includes('PETICO') && !daRegiao.nomes.includes('PMG'));
    check('o fornecedor atual do item continua selecionado', sel.valor === 'ARCO', 'valor: ' + sel.valor);
  }

  // ── 3. Mandar um item do Rio pra fornecedor de SP pede confirmação ──────────────────
  {
    chamadas = [];
    const r = await page.evaluate(async () => {
      let perguntou = null;
      const cOrig = window.confirm;
      window.confirm = (m) => { perguntou = m; return false; }; // o Compras cancela
      editarProduto('rj-2');
      document.getElementById('m-forn').value = 'PETICO';
      await salvarEdicaoProduto('rj-2');
      window.confirm = cOrig;
      return { perguntou, fornecedorNoEstado: S.catalogo.find(p => p.id === 'rj-2').fornecedor };
    });
    check('avisa antes de gravar', !!r.perguntou);
    check('e o aviso diz de que região é o catálogo', /RIO DE JANEIRO/.test(r.perguntou || ''));
    check('e nomeia o fornecedor que está entrando', /PETICO/.test(r.perguntou || ''));
    check('cancelar não muda o item', r.fornecedorNoEstado === 'ARCO');
    const gravou = chamadas.some(c => (c.m === 'PATCH' || c.m === 'POST') && /gn_catalogo/.test(c.url));
    check('e não grava nada no catálogo', !gravou);
  }

  // ── 4. Confirmando, grava — e a troca fica registrada na auditoria ──────────────────
  {
    chamadas = [];
    const r = await page.evaluate(async () => {
      const cOrig = window.confirm;
      window.confirm = () => true;
      editarProduto('rj-2');
      document.getElementById('m-forn').value = 'PETICO';
      await salvarEdicaoProduto('rj-2');
      await new Promise(res => setTimeout(res, 300));
      window.confirm = cOrig;
      return { fornecedorNoEstado: S.catalogo.find(p => p.id === 'rj-2').fornecedor };
    });
    check('confirmando, a troca é gravada', r.fornecedorNoEstado === 'PETICO');
    const patch = chamadas.find(c => c.m === 'PATCH' && /gn_catalogo/.test(c.url));
    check('o PATCH leva o fornecedor novo', !!patch && /PETICO/.test(patch.body || ''));
    const aud = chamadas.filter(c => c.m === 'POST' && /gn_auditoria_pedidos/.test(c.url))
      .map(c => { try { return JSON.parse(c.body)[0]; } catch (e) { return {}; } });
    const trocaForn = aud.find(a => a.acao === 'ALTERAR_FORNECEDOR_CATALOGO');
    check('a troca de fornecedor vai pra auditoria', !!trocaForn);
    check('com a região e os dois nomes', !!trocaForn && trocaForn.detalhes
      && trocaForn.detalhes.regiao === 'RJ'
      && trocaForn.detalhes.fornecedor_antigo === 'ARCO'
      && trocaForn.detalhes.fornecedor_novo === 'PETICO');
  }

  // ── 5. Sem atrito no caminho normal: mexer só no preço não pergunta nada ────────────
  await montar();
  {
    const r = await page.evaluate(async () => {
      let perguntou = null;
      const cOrig = window.confirm;
      window.confirm = (m) => { perguntou = m; return true; };
      editarProduto('rj-1'); // leite condensado, fornecedor RIO, só muda o custo
      document.getElementById('m-custo').value = '6.90';
      await salvarEdicaoProduto('rj-1');
      await new Promise(res => setTimeout(res, 200));
      window.confirm = cOrig;
      const p = S.catalogo.find(x => x.id === 'rj-1');
      return { perguntou, custo: p.custo, fornecedor: p.fornecedor };
    });
    check('rodada de preço normal não pergunta nada', r.perguntou === null, r.perguntou || '');
    check('e grava o preço novo mantendo o fornecedor', r.custo === 6.9 && r.fornecedor === 'RIO');
  }

  // ── 6. Trocar entre dois fornecedores DA região também passa direto ────────────────
  {
    const r = await page.evaluate(async () => {
      let perguntou = null;
      const cOrig = window.confirm;
      window.confirm = (m) => { perguntou = m; return true; };
      editarProduto('rj-3'); // açucar: NUTRIMAX → ARCO, os dois do Rio
      document.getElementById('m-forn').value = 'ARCO';
      await salvarEdicaoProduto('rj-3');
      await new Promise(res => setTimeout(res, 200));
      window.confirm = cOrig;
      return { perguntou, fornecedor: S.catalogo.find(x => x.id === 'rj-3').fornecedor };
    });
    check('trocar entre fornecedores do Rio não pergunta', r.perguntou === null, r.perguntou || '');
    check('e a troca vale', r.fornecedor === 'ARCO');
  }

  // ── 7. A aba Fornecedores avisa que o cadastro é um só pras duas regiões ───────────
  {
    const txt = await page.evaluate(() => { S.tab = 'fornecedores'; renderFornecedores();
      return document.getElementById('content').innerText; });
    check('a aba Fornecedores avisa que o cadastro vale pras duas regiões',
      /vale para as duas regiões/i.test(txt));
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + falhou + ' falhou  [' + PEDIDOS + ']');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
