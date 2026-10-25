// "2ª rodada só pra algumas lojas": o pedido da semana já foi confirmado e 2 lojas precisam
// pedir mais. O "Novo (todas)" abria rascunho pra todas as 11, misturando quem não tem nada a
// acrescentar. Agora o 🔄 Por loja, num pedido confirmado, abre uma rodada só pras marcadas.
//
// O que PRECISA ser provado, porque é a parte que pode custar um pedido real: o confirmado não
// é tocado — nenhum item sai dele, nenhuma provisão é cancelada, nenhum UPDATE nele.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const PED_CONF = 'ped-confirmado-1';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 950 } });

  let pedidos = [];
  let escritas = [];
  // Itens do pedido CONFIRMADO: sem eles, carregarConfirmadosSemana() (que zera e reconsulta ao
  // abrir a rodada) devolveria vazio e o "Já pedido" sumiria por falta de fixture, não por bug.
  const ITENS_CONFIRMADOS = [
    { id: 'c1', pedido_id: PED_CONF, catalogo_id: 'cat-1', loja_slug: 'bangu', qtd_pedida: 12 },
    { id: 'c2', pedido_id: PED_CONF, catalogo_id: 'cat-1', loja_slug: 'caxias', qtd_pedida: 5 },
    { id: 'c3', pedido_id: PED_CONF, catalogo_id: 'cat-1', loja_slug: 'boulevard', qtd_pedida: 3 },
  ];
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const m = req.method();
    if (m !== 'GET') escritas.push({ m, url, body: req.postData() });
    if (/\/gn_pedido_itens/.test(url) && m === 'GET') {
      // Só devolve os itens do pedido confirmado; a rodada nova nasce vazia.
      const doConf = url.includes(PED_CONF);
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(doConf ? ITENS_CONFIRMADOS : []) });
    }
    if (/\/gn_pedidos/.test(url)) {
      if (m === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pedidos) });
      if (m === 'POST') {
        const b = JSON.parse(req.postData() || '{}');
        const novo = Object.assign({ id: 'ped-rodada-' + pedidos.length }, Array.isArray(b) ? b[0] : b);
        pedidos.push(novo);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(novo) });
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + PEDIDOS);
    try {
      // Inclui o S: declaração de função é hoisted antes do script rodar, e sem esperar pelo S
      // o teste entra com ele ainda em TDZ.
      await page.waitForFunction(() => {
        try { return typeof renderPedido === 'function' && typeof S === 'object' && S !== null; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: app Pedidos não carregou'); falhou++; break; } }
  }

  const temRodada = await page.evaluate(() => {
    try { return typeof _abrirSegundaRodada === 'function' && typeof _pedidoEscopoLojas === 'function'; }
    catch (e) { return false; }
  });
  if (!temRodada) {
    console.log('FALHOU: a 2ª rodada escopada não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 13 falhou');
    await browser.close();
    process.exit(1);
  }

  const montar = () => page.evaluate((PED_CONF) => {
    S.regiao = 'RJ';
    S.semanaAtiva = new Date('2026-09-28T12:00:00');
    S.lojas = [
      { slug_pedido: 'bangu', nome_display: 'Bangu' },
      { slug_pedido: 'caxias', nome_display: 'Caxias' },
      { slug_pedido: 'boulevard', nome_display: 'Boulevard' },
    ];
    S.catalogo = [{ id: 'cat-1', produto: 'Carne Sol', grupo: 'PROTEINA', fornecedor: 'FRIGO', und: 'KG', custo: 40, ativo: true }];
    S.pedidoAtual = { id: PED_CONF, status: 'CONFIRMADO', lojas_escopo: null };
    S.pedidosDaSemana = [S.pedidoAtual];
    // Já comprado nesta semana: 12 Bangu, 5 Caxias, 3 Boulevard
    S.pedidosConfirmados = { 'cat-1': { bangu: 12, caxias: 5, boulevard: 3 } };
    S.pedidoItens = {};
    S.pedidoRef = {}; S.pedidoRefOrigem = null;
    S.todosModo = false; S.lojaAtiva = 'boulevard'; S.tab = 'pedido';
    return true;
  }, PED_CONF);

  await montar();
  pedidos = [{ id: PED_CONF, semana_inicio: '2026-09-28', regiao: 'RJ', status: 'CONFIRMADO' }];
  escritas = [];

  // ── Abrir a rodada só pra Bangu e Caxias ────────────────────────────────────────────
  const abrir = await page.evaluate(async () => {
    abrirModalNovoPedidoLojas();
    document.querySelectorAll('.np-loja').forEach(c => { c.checked = (c.value === 'bangu' || c.value === 'caxias'); });
    const realConf = window.confirm; let msg = '';
    window.confirm = (m) => { msg = String(m); return true; };
    const realToast = window.toast; window.toast = () => {};
    await _confirmarNovoPedidoLojas();
    window.confirm = realConf; window.toast = realToast;
    return { msg, escopo: _pedidoEscopoLojas(), status: S.pedidoAtual.status,
             idNovo: S.pedidoAtual.id, lojaAtiva: S.lojaAtiva };
  });
  check('a confirmação promete que o confirmado NÃO é alterado',
    /NÃO é alterado/.test(abrir.msg) && /nada sai dele/.test(abrir.msg));
  check('e diz que a tela vai mostrar só as lojas escolhidas', /Bangu/.test(abrir.msg) && /Caxias/.test(abrir.msg));
  check('cria um pedido NOVO em rascunho, não reaproveita o confirmado',
    abrir.status === 'RASCUNHO' && abrir.idNovo !== 'ped-confirmado-1');
  check('com o escopo gravado nas duas lojas',
    Array.isArray(abrir.escopo) && abrir.escopo.length === 2
      && abrir.escopo.includes('bangu') && abrir.escopo.includes('caxias'));
  check('a loja aberta sai do Boulevard (fora do escopo) pra uma da rodada',
    abrir.lojaAtiva === 'bangu' || abrir.lojaAtiva === 'caxias');

  // ── O confirmado não foi tocado ─────────────────────────────────────────────────────
  const mexeuNoConfirmado = escritas.filter(e =>
    e.m !== 'POST' || /gn_pedido_itens|gn_provisoes/.test(e.url));
  check('nenhum UPDATE/DELETE em item ou provisão (o confirmado fica intacto)',
    mexeuNoConfirmado.length === 0 || (console.log('   → ' + JSON.stringify(mexeuNoConfirmado)), false));
  check('o pedido confirmado continua CONFIRMADO no banco',
    pedidos.find(p => p.id === PED_CONF).status === 'CONFIRMADO');
  check('o lojas_escopo foi gravado na linha nova, não na confirmada',
    pedidos.find(p => p.id === PED_CONF).lojas_escopo === undefined
      && Array.isArray(pedidos.find(p => p.id !== PED_CONF).lojas_escopo));

  // ── A tela mostra só as lojas da rodada ─────────────────────────────────────────────
  const tela = await page.evaluate(() => {
    S.pedidoItens = {};
    renderPedido();
    const h = document.getElementById('content').innerHTML;
    const tabs = [...document.querySelectorAll('.store-tab')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
    return { tabs, aviso: /2ª rodada — só/.test(h), naoAlterado: /não foi alterado/.test(h) };
  });
  check(`as abas mostram só as 2 lojas da rodada (veio ${tela.tabs.length})`, tela.tabs.length === 2);
  check('Boulevard não aparece na rodada', !tela.tabs.some(t => /Boulevard/.test(t)));
  check('a tela avisa que é 2ª rodada e que o confirmado não foi alterado',
    tela.aviso && tela.naoAlterado);

  // Visão "todas as lojas" também respeita o escopo. Olha as LINHAS de produto por loja, não o
  // HTML inteiro: o painel de envio da semana lista as 11 lojas de propósito (é status da
  // semana, não da rodada), então procurar "Boulevard" na página toda mediria o painel.
  const todas = await page.evaluate(() => {
    S.todosModo = true;
    renderPedido();
    const linhas = [...document.querySelectorAll('.todos-loja-row')].map(r => r.dataset.loja);
    return { linhas, unicas: [...new Set(linhas)] };
  });
  check(`na visão de todas as lojas, só as 2 da rodada têm linha (veio ${todas.unicas.join(',')})`,
    todas.unicas.length === 2 && todas.unicas.includes('bangu') && todas.unicas.includes('caxias'));

  // ── O que já foi comprado continua à vista, pra não pedir em dobro ──────────────────
  const jaPedido = await page.evaluate(() => {
    S.todosModo = false; S.lojaAtiva = 'bangu';
    renderPedido();
    return /Já pedido: 12/.test(document.getElementById('content').innerHTML);
  });
  check('o que já foi comprado aparece na rodada ("Já pedido: 12")', jaPedido);

  // ── Dá pra voltar pro pedido confirmado ─────────────────────────────────────────────
  const volta = await page.evaluate(async () => {
    S.pedidosDaSemana = [
      { id: 'ped-confirmado-1', status: 'CONFIRMADO', lojas_escopo: null },
      Object.assign({}, S.pedidoAtual),
    ];
    const h0 = document.getElementById('content').innerHTML;
    const temCard = /Ver o pedido confirmado/.test(h0);
    const realToast = window.toast; window.toast = () => {};
    await abrirPedidoDaSemana('ped-confirmado-1');
    window.toast = realToast;
    const tabs = [...document.querySelectorAll('.store-tab')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
    return { temCard, status: S.pedidoAtual.status, tabs: tabs.length };
  });
  check('a tela oferece voltar pro pedido confirmado', volta.temCard);
  check('voltando, as 3 lojas (+ Loja Teste) reaparecem',
    volta.status === 'CONFIRMADO' && volta.tabs >= 3);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
