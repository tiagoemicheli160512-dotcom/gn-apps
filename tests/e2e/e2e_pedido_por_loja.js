// "Ao criar um novo pedido, poder selecionar a loja que quer fazer um novo, pois às vezes só
//  precisa uma ou duas ou 5, e acaba reabrindo todas. Outro ponto, se possível e não quebrar
//  nada: mostrar o pedido já feito, pro novo ser feito com segurança sem pedir quantidade
//  errada ou item errado. Pois ao gerar um novo pedido zera tudo."
//
// O fixture usa a região RJ com 3 lojas e quantidades distintas por loja, pra provar que só as
// marcadas são afetadas.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const PED_ATIVO = 'ped-ativo-1';
const PED_PARK = 'ped-cancelado-1';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 950 } });

  // Banco de mentira, mas com o comportamento que importa: PATCH em gn_pedido_itens com
  // pedido_id move a linha, e as consultas por pedido_id passam a refletir isso.
  let itens = [];   // {id, pedido_id, catalogo_id, loja_slug, qtd_pedida}
  let pedidos = []; // {id, semana_inicio, regiao, status}
  let provisoes = [];
  let chamadas = [];

  const parseQS = (u) => {
    const q = {};
    (u.split('?')[1] || '').split('&').forEach(p => {
      const [k, v] = p.split('=');
      if (k) q[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return q;
  };
  // "eq.x" / "in.(a,b)" → predicado
  const casa = (filtro, valor) => {
    if (!filtro) return true;
    if (filtro.startsWith('eq.')) return String(valor) === filtro.slice(3);
    if (filtro.startsWith('in.(')) return filtro.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(valor));
    return true;
  };

  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const m = req.method();
    const q = parseQS(url);
    chamadas.push({ m, url, body: req.postData() });

    if (/\/gn_pedido_itens/.test(url)) {
      if (m === 'GET') {
        const r = itens.filter(i => casa(q.pedido_id, i.pedido_id) && casa(q.loja_slug, i.loja_slug));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
      }
      if (m === 'PATCH') {
        const patch = JSON.parse(req.postData() || '{}');
        itens.forEach(i => {
          if (casa(q.pedido_id, i.pedido_id) && casa(q.loja_slug, i.loja_slug)) Object.assign(i, patch);
        });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (/\/gn_pedidos/.test(url)) {
      if (m === 'GET') {
        const r = pedidos.filter(p => casa(q.semana_inicio, p.semana_inicio) && casa(q.regiao, p.regiao) && casa(q.status, p.status));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
      }
      if (m === 'POST') {
        const b = JSON.parse(req.postData() || '{}');
        const novo = Object.assign({ id: 'ped-novo-' + pedidos.length }, Array.isArray(b) ? b[0] : b);
        pedidos.push(novo);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(novo) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (/\/gn_provisoes/.test(url)) {
      if (m === 'PATCH') {
        const patch = JSON.parse(req.postData() || '{}');
        provisoes.forEach(p => {
          if (casa(q.pedido_id, p.pedido_id) && casa(q.status, p.status) && casa(q.loja_slug, p.loja_slug)) Object.assign(p, patch);
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + PEDIDOS);
    try {
      await page.waitForFunction(() => {
        try { return typeof renderPedido === 'function' && typeof novoPedido === 'function'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: app Pedidos não carregou'); falhou++; break; } }
  }

  const temFuncao = await page.evaluate(() => {
    try { return typeof abrirModalNovoPedidoLojas === 'function' && typeof carregarPedidoReferencia === 'function'; }
    catch (e) { return false; }
  });
  if (!temFuncao) {
    console.log('FALHOU: refazer por loja não existe neste arquivo (contraprova esperada — é recurso novo)');
    console.log('\n0 OK, 15 falhou');
    await browser.close();
    process.exit(1);
  }

  // Estado inicial: 3 lojas, 2 itens no catálogo, quantidades distintas
  const montar = () => page.evaluate(({ PED_ATIVO }) => {
    S.regiao = 'RJ';
    S.semanaAtiva = new Date('2026-09-28T12:00:00');
    S.lojas = [
      { slug_pedido: 'bangu', nome_display: 'Bangu' },
      { slug_pedido: 'caxias', nome_display: 'Caxias' },
      { slug_pedido: 'boulevard', nome_display: 'Boulevard' },
    ];
    S.pedidoAtual = { id: PED_ATIVO, status: 'RASCUNHO' };
    S.catalogo = [
      { id: 'cat-1', produto: 'Carne Sol', grupo: 'PROTEINA', fornecedor: 'FRIGO', und: 'KG', custo: 40, ativo: true },
      { id: 'cat-2', produto: 'Cerveja', grupo: 'BEBIDAS', fornecedor: 'AMBEV', und: 'CX', custo: 100, ativo: true },
    ];
    S.tab = 'pedido';
    return true;
  }, { PED_ATIVO });

  const resetBanco = () => {
    pedidos = [{ id: PED_ATIVO, semana_inicio: '2026-09-28', regiao: 'RJ', status: 'RASCUNHO' }];
    itens = [
      { id: 'i1', pedido_id: PED_ATIVO, catalogo_id: 'cat-1', loja_slug: 'bangu', qtd_pedida: 10 },
      { id: 'i2', pedido_id: PED_ATIVO, catalogo_id: 'cat-2', loja_slug: 'bangu', qtd_pedida: 4 },
      { id: 'i3', pedido_id: PED_ATIVO, catalogo_id: 'cat-1', loja_slug: 'caxias', qtd_pedida: 7 },
      { id: 'i4', pedido_id: PED_ATIVO, catalogo_id: 'cat-1', loja_slug: 'boulevard', qtd_pedida: 3 },
    ];
    provisoes = [
      { id: 'p1', pedido_id: PED_ATIVO, loja_slug: 'bangu', status: 'AGUARDANDO' },
      { id: 'p2', pedido_id: PED_ATIVO, loja_slug: 'caxias', status: 'AGUARDANDO' },
    ];
    chamadas = [];
  };

  // ── O modal lista as lojas com o que cada uma tem ───────────────────────────────────
  resetBanco();
  await montar();
  const modal = await page.evaluate(async () => {
    await carregarItensPedido();
    abrirModalNovoPedidoLojas();
    const h = document.getElementById('modal-box') ? document.getElementById('modal-box').innerHTML : document.body.innerHTML;
    return { html: h, checks: document.querySelectorAll('.np-loja').length };
  });
  check('o modal oferece uma caixa por loja da região', modal.checks === 3);
  check('e mostra quantos itens cada loja já lançou',
    /Bangu[\s\S]*?2 item/.test(modal.html) && /Caxias[\s\S]*?1 item/.test(modal.html));
  check('deixa claro que as outras não são afetadas', /As outras continuam com tudo que já\s+lançaram/.test(modal.html));
  check('começa tudo desmarcado (ninguém zera por engano)',
    await page.evaluate(() => [...document.querySelectorAll('.np-loja')].every(c => !c.checked)));

  const semMarcar = await page.evaluate(async () => {
    let avisos = [];
    const real = window.toast; window.toast = (m) => avisos.push(String(m));
    await _confirmarNovoPedidoLojas();
    window.toast = real;
    return avisos;
  });
  check('sem marcar nenhuma, não faz nada e avisa', /Marque ao menos uma loja/.test(semMarcar.join(' ')));

  // ── Refazer só uma loja ─────────────────────────────────────────────────────────────
  const uma = await page.evaluate(async () => {
    document.querySelectorAll('.np-loja').forEach(c => { c.checked = c.value === 'bangu'; });
    const realConf = window.confirm; let msg = '';
    window.confirm = (m) => { msg = String(m); return true; };
    const realToast = window.toast; window.toast = () => {};
    await _confirmarNovoPedidoLojas();
    window.confirm = realConf; window.toast = realToast;
    const porLoja = (slug) => Object.values(S.pedidoItens).filter(l => l[slug] && l[slug].qtd > 0).length;
    return { msg, bangu: porLoja('bangu'), caxias: porLoja('caxias'), boulevard: porLoja('boulevard'),
             ref: JSON.parse(JSON.stringify(S.pedidoRef)), origem: S.pedidoRefOrigem };
  });
  check('a confirmação nomeia as lojas e diz quantos itens saem',
    /Bangu/.test(uma.msg) && /2 item/.test(uma.msg));
  check('a loja marcada fica zerada pra lançar de novo', uma.bangu === 0);
  check('e as outras duas continuam intactas', uma.caxias === 1 && uma.boulevard === 1);
  check('o pedido da semana NÃO é cancelado',
    pedidos.filter(p => p.id === PED_ATIVO)[0].status === 'RASCUNHO');
  check('os itens não são apagados — vão pra uma linha CANCELADO da mesma semana',
    itens.filter(i => i.loja_slug === 'bangu').every(i => i.pedido_id !== PED_ATIVO)
      && itens.filter(i => i.loja_slug === 'bangu').length === 2);
  check('a provisão só da loja refeita é cancelada',
    provisoes.find(p => p.loja_slug === 'bangu').status === 'CANCELADO'
      && provisoes.find(p => p.loja_slug === 'caxias').status === 'AGUARDANDO');

  // ── A referência: o que tinha sido pedido aparece pra conferir ──────────────────────
  check('a referência traz as quantidades do pedido refeito (10 e 4 da Bangu)',
    uma.origem === 'zerado' && uma.ref['cat-1'] && uma.ref['cat-1'].bangu === 10
      && uma.ref['cat-2'] && uma.ref['cat-2'].bangu === 4);

  const naTela = await page.evaluate(() => {
    S.todosModo = false; S.lojaAtiva = 'bangu'; S.tab = 'pedido';
    renderPedido();
    const h = document.getElementById('content').innerHTML;
    return { chip: /Refeito: 10/.test(h), aviso: /Mostrando o que tinha no pedido refeito/.test(h) };
  });
  check('a quantidade antiga aparece na linha do item ("Refeito: 10")', naTela.chip);
  check('com um aviso dizendo de onde esse número vem', naTela.aviso);

  // Fallback: sem pedido refeito, usa a semana anterior (que o app já carregava e nunca mostrava)
  const fallback = await page.evaluate(async () => {
    S.ultimoPedido = { 'cat-1': { bangu: 9 } };
    S.semanaAtiva = new Date('2026-10-05T12:00:00');   // semana sem linha CANCELADO
    await carregarPedidoReferencia();
    S.semanaAtiva = new Date('2026-09-28T12:00:00');
    renderPedido();
    const h = document.getElementById('content').innerHTML;
    return { origem: S.pedidoRefOrigem, chip: /Sem\.ant: 9/.test(h), aviso: /Referência da semana anterior/.test(h) };
  });
  check('sem pedido refeito, cai na semana anterior em vez de não mostrar nada',
    fallback.origem === 'semana_anterior' && fallback.chip && fallback.aviso);

  // ── Pedido confirmado: o botão vira 2ª rodada, não "refazer" ────────────────────────
  // Antes ele recusava. O usuário pediu o contrário: nesse estado o que se precisa é abrir uma
  // rodada pra algumas lojas acrescentarem o que faltou, sem tocar no confirmado.
  const confirmado = await page.evaluate(() => {
    S.pedidoAtual = { id: 'ped-ativo-1', status: 'CONFIRMADO' };
    abrirModalNovoPedidoLojas();
    const h = document.getElementById('modal-box') ? document.getElementById('modal-box').innerHTML : '';
    return { html: h, checks: document.querySelectorAll('.np-loja').length };
  });
  check('pedido CONFIRMADO oferece a 2ª rodada, com as lojas pra escolher',
    confirmado.checks === 3 && /2ª rodada pra quais lojas/.test(confirmado.html));
  check('e promete que o confirmado não será alterado',
    /não vai ser alterado/.test(confirmado.html) && /Abrir a rodada/.test(confirmado.html));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
