// 26/10/2026: o painel do Compras mostrava a Bangu em "NÃO ENVIOU NADA" enquanto o sino do
// mesmo app dizia "Bangu gerou urgência — 63 items, Neto, 11h53".
//
// Medido antes de mexer: a linha de gn_pedido_envio_semana da Bangu daquela semana não
// existia, e nos logs do Supabase daquele minuto havia o POST do alerta (201) e dezenas de
// POST de itens — e NENHUM POST da tabela de controle. A requisição não foi recusada: ela
// nunca foi feita.
//
// A causa: as duas escritas saíam sob condições diferentes. O alerta, sempre que houvesse
// item; a linha de controle, só se `_urgPendente` fosse true. Esse sinalizador é calculado
// uma vez, antes, a partir de coisas que nada têm a ver com "a loja acabou de mandar" —
// entre elas _urgItensPresentes(), que é zero enquanto a lista de urgência da semana não
// carregou. Nascendo false, ficava false a sessão inteira.
//
// Esta suíte fixa esse estado (_urgPendente = false, loja mandando urgência) e cobra que as
// DUAS escritas saiam. Contra a versão antiga, só o alerta sai.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + ARQ);
  await CAMINHOS.esperarApp(page, ['tab', 'loja'], ['confirmarPedido', 'render'], 30000);

  // Envia a urgência com o estado da Bangu daquele dia e devolve o que foi escrito.
  const enviar = (opts) => page.evaluate(async (o) => {
    const escritas = [];
    const orig = window.sbRequest;
    window.sbRequest = async (caminho, cfg) => {
      const metodo = (cfg && cfg.method) || 'GET';
      escritas.push({ tabela: String(caminho).split('?')[0], metodo,
                      corpo: cfg && cfg.body ? JSON.parse(cfg.body) : null });
      if (metodo === 'GET') return [];
      return [];
    };
    // Estado da loja: usuário, loja, semana e um item de pedido pra haver o que sincronizar.
    usuarioAtual = { id: 1, nome: 'Neto', cargo: 'estoquista', loja: 'BANGU' };
    loja = 'BANGU'; tab = 'pedido';
    _urgSemanaIni = '2026-10-26';
    _envioSemana = {};
    // O estado que causou o defeito: o app acha que não há urgência pendente.
    _urgPendente = o.urgPendente;
    const prods = getProdutosPedidoOrdenados();
    const alvo = prods.slice(0, o.quantosItens);
    // A forma do item é {cx, und, pedidoCx, pedidoUnd} e o depósito é pedidoAll[lojaKey()] —
    // getPedido() devolve `|| {}` quando a chave não existe, então escrever no retorno dele
    // não guardava nada e o fluxo não achava item pra sincronizar (foi o que aconteceu).
    const chave = lojaKey();
    // Zera entre cenários: pedidoAll sobrevive na página, e sem limpar o cenário "sem item"
    // herdava os itens do anterior e escrevia mesmo assim — a verificação passava invertida.
    pedidoAll[chave] = {};
    alvo.forEach((prod, i) => { pedidoAll[chave][prod.item] = { cx: String(i + 1), und: '0', pedidoCx: '0', pedidoUnd: '0' }; });
    try { await confirmarPedido('urgencia'); } finally { window.sbRequest = orig; }
    return { escritas, itensNoPedido: alvo.length };
  }, opts);

  // ── O caso da Bangu: _urgPendente false ─────────────────────────────────────────────
  const bangu = await enviar({ urgPendente: false, quantosItens: 3 });
  const posts = bangu.escritas.filter(e => e.metodo === 'POST');
  const alerta = posts.find(e => /gn_alertas_compras/.test(e.tabela));
  const envio  = posts.find(e => /gn_pedido_envio_semana/.test(e.tabela));

  check('o pedido tinha itens pra sincronizar (senão a suíte não prova nada)',
    bangu.itensNoPedido === 3, JSON.stringify(bangu.itensNoPedido));
  check('com _urgPendente false, o alerta sai — como sempre saiu',
    !!alerta, JSON.stringify(posts.map(p => p.tabela)));
  check('e a linha de controle sai TAMBÉM — era isto que faltava',
    !!envio, 'tabelas escritas: ' + JSON.stringify(posts.map(p => p.tabela)));
  check('a linha vai pra loja e semana certas',
    !!envio && envio.corpo.loja_slug === 'bangu' && envio.corpo.semana_inicio === '2026-10-26'
      && envio.corpo.loja === 'BANGU', JSON.stringify(envio && envio.corpo));
  check('com urgencia_em, quem mandou e a contagem de itens',
    !!envio && !!envio.corpo.urgencia_em && envio.corpo.urgencia_por === 'Neto'
      && envio.corpo.urgencia_itens === 3, JSON.stringify(envio && envio.corpo));
  check('e sem tocar no final_em: a loja mandou urgência, não finalizou',
    !!envio && envio.corpo.final_em === undefined, JSON.stringify(envio && envio.corpo));
  check('as duas escritas contam os MESMOS itens',
    !!alerta && !!envio && alerta.corpo.qtd_itens === envio.corpo.urgencia_itens,
    JSON.stringify([alerta && alerta.corpo.qtd_itens, envio && envio.corpo.urgencia_itens]));

  // ── E continua funcionando no caminho normal ────────────────────────────────────────
  const normal = await enviar({ urgPendente: true, quantosItens: 2 });
  const postsN = normal.escritas.filter(e => e.metodo === 'POST');
  check('com _urgPendente true, as duas escritas continuam saindo',
    postsN.some(e => /gn_alertas_compras/.test(e.tabela)) &&
    postsN.some(e => /gn_pedido_envio_semana/.test(e.tabela)),
    JSON.stringify(postsN.map(p => p.tabela)));

  // ── Sem item nenhum, nada é escrito ─────────────────────────────────────────────────
  const vazio = await enviar({ urgPendente: false, quantosItens: 0 });
  const postsV = vazio.escritas.filter(e => e.metodo === 'POST');
  check('sem item pra sincronizar, não inventa linha de controle nem alerta',
    !postsV.some(e => /gn_pedido_envio_semana|gn_alertas_compras/.test(e.tabela)),
    JSON.stringify(postsV.map(p => p.tabela)));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
