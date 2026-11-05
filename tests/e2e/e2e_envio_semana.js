// "Colocar aviso no app estoque e pedido das lojas que enviaram o pedido: Bangu mandou as
//  urgências e finalizou, aí marcar loja como pedido feito; e se mandou só a urgência, falta
//  finalizar. Mostrar também no app lojas na aba pedido, pra que tenha a certeza que finalizou."
//
// Os três estados vêm do fixture com casos reais da segunda 28/09: Bangu finalizou (220 itens,
// Neto), Boulevard mandou urgência às 11h20 (66 itens, João) e Guarulhos não mandou nada.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const segunda = (() => {
  const d = new Date(); const dia = d.getDay();
  d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
})();

const LINHAS = [
  { loja_slug: 'bangu', semana_inicio: segunda, loja: 'BANGU',
    urgencia_em: segunda + 'T13:02:00.000Z', urgencia_por: 'Neto', urgencia_itens: 41,
    final_em: segunda + 'T18:58:09.000Z', final_por: 'Neto', final_itens: 220 },
  { loja_slug: 'boulevard', semana_inicio: segunda, loja: 'BOULEVARD',
    urgencia_em: segunda + 'T14:20:50.000Z', urgencia_por: 'João', urgencia_itens: 66,
    final_em: null, final_por: null, final_itens: null },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ══════════ LADO DA LOJA (certeza de que finalizou) ══════════
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } });
  let envioDaLoja = [];
  let gravacoes = [];
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (/gn_pedido_envio_semana/.test(url)) {
      if (req.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envioDaLoja) });
      }
      gravacoes.push(JSON.parse(req.postData() || '{}'));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try {
      await page.waitForFunction(() => {
        try { return typeof render === 'function' && typeof _checarUrgenciaPendencia === 'function'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) {
      if (t >= 3) { console.log('FALHOU: app Lojas não carregou (contraprova: a faixa é nova)'); falhou++; break; }
    }
  }

  const abrirPedido = (lojaKey) => page.evaluate(async (lojaKey) => {
    usuarioAtual = { nome: 'Neto', cargo: 'estoquista', loja: lojaKey.toUpperCase() };
    loja = lojaKey;
    _barrisSemPendente = false;
    try { urgenciaGlobal = []; } catch (e) {}   // sem urgência marcada: sem trava atrapalhando
    await _checarUrgenciaPendencia();
    tab = 'pedido';
    render();
    return document.getElementById('content').innerHTML;
  }, lojaKey);

  // 1. Finalizado → verde, com hora e quem
  envioDaLoja = [LINHAS[0]];
  let html = await abrirPedido('BANGU');
  check('loja que finalizou vê "FINALIZADO" na aba Pedido', /Pedido desta semana FINALIZADO/.test(html));
  check('com a hora e o nome de quem mandou', /Neto/.test(html) && /\d{2}\/\d{2} às \d{2}h\d{2}/.test(html));
  check('e mostra também a urgência que saiu antes', /Urgência enviada/.test(html) && /41 itens/.test(html));
  check('não cobra nada de quem já finalizou', !/FALTA FINALIZAR/.test(html));

  // 2. Só urgência → cobra a finalização
  envioDaLoja = [LINHAS[1]];
  html = await abrirPedido('BOULEVARD');
  check('loja que mandou só a urgência vê "FALTA FINALIZAR"', /FALTA FINALIZAR/.test(html));
  check('reconhece a urgência que ela mandou (66 itens, João)', /66 itens/.test(html) && /João/.test(html));
  check('e diz o que fazer', /toque em ✅ Finalizar/.test(html));

  // 3. Nada enviado → avisa que o Compras está vendo como pendente
  envioDaLoja = [];
  html = await abrirPedido('GUARULHOS');
  check('loja que não mandou nada é avisada de que está pendente pro Compras',
    /ainda não enviado/.test(html) && /vendo esta loja como pendente/.test(html));
  check('sem dizer que finalizou nem que mandou urgência',
    !/FINALIZADO/.test(html) && !/Urgência enviada/.test(html));

  // 4. Falha de rede não pode virar "não enviou" na cara de quem enviou
  const semRede = await page.evaluate(async () => {
    loja = 'BANGU';
    _envioSemana = { final_em: new Date().toISOString(), final_por: 'Neto', final_itens: 220 };
    const real = window.sbRequest;
    window.sbRequest = () => Promise.reject(new Error('Failed to fetch'));
    await _checarUrgenciaPendencia();
    window.sbRequest = real;
    tab = 'pedido'; render();
    return { html: document.getElementById('content').innerHTML, guardou: !!_envioSemana.final_em };
  });
  check('sem internet, mantém o "finalizado" que já sabia em vez de dizer que não enviou',
    semRede.guardou === true && /FINALIZADO/.test(semRede.html));

  // 5. Finalizar grava a linha da semana (é o que acende o painel do Compras)
  const gravou = await page.evaluate(async () => {
    loja = 'BANGU';
    usuarioAtual = { nome: 'Neto', cargo: 'estoquista', loja: 'BANGU' };
    _urgSemanaIni = null;
    await _registrarPedidoFinalizado(220);
    return { envio: _envioSemana };
  });
  const gFinal = gravacoes.find(g => g.final_em);
  check('finalizar grava final_em/por/itens na linha da loja+semana',
    !!gFinal && gFinal.loja_slug === 'bangu' && gFinal.final_itens === 220 && gFinal.final_por === 'Neto');
  check('e a tela já reflete sem esperar o próximo pull', !!gravou.envio.final_em);

  const gUrg = await page.evaluate(async () => {
    _urgPendente = true;
    await _registrarUrgenciaEnviada(66);
    return true;
  });
  const gu = gravacoes.find(g => g.urgencia_em);
  check('e a urgência grava só os campos dela (não zera a finalização)',
    !!gu && gu.urgencia_itens === 66 && !('final_em' in gu));

  await ctx.close();

  // ══════════ LADO DO COMPRAS (painel) ══════════
  const ctx2 = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  let envioTodas = LINHAS;
  await ctx2.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    if (/gn_pedido_envio_semana/.test(url) && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envioTodas) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p2 = await ctx2.newPage();
  for (let t = 1; ; t++) {
    await p2.goto('file://' + PEDIDOS);
    try {
      await p2.waitForFunction(() => {
        // Esperar só pelas FUNÇÕES não basta: declaração de função é içada pro topo do
        // bloco e existe com o script ainda no meio da execução. O `S` do app é um const
        // avaliado na ordem — é ele que prova que o bloco terminou. Sem isto o evaluate
        // abaixo caía em "S is not defined" em ~40% das rodadas, e o teste culpava a
        // mudança da vez em vez da própria espera.
        try { return typeof renderPedido === 'function' && typeof carregarEnvioSemana === 'function'
                 && typeof S === 'object' && S !== null; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) {
      if (t >= 3) { console.log('FALHOU: o painel de envio não existe no app Pedidos (contraprova esperada)'); falhou++;
        console.log(`\n${ok} OK, ${falhou+8} falhou`); await browser.close(); process.exit(1); }
    }
  }

  const painel = await p2.evaluate(async () => {
    S.lojas = [
      { slug_pedido: 'bangu', nome_display: 'Bangu' },
      { slug_pedido: 'boulevard', nome_display: 'Boulevard' },
      { slug_pedido: 'guarulhos', nome_display: 'Guarulhos' },
    ];
    await carregarEnvioSemana();
    return {
      html: _painelEnvioSemanaHtml(),
      bangu: _envioStatusLoja('bangu'),
      boule: _envioStatusLoja('boulevard'),
      guaru: _envioStatusLoja('guarulhos'),
    };
  });
  check('Bangu (urgência + finalizou) conta como pedido feito', painel.bangu === 'final');
  check('Boulevard (só urgência) conta como falta finalizar', painel.boule === 'urgencia');
  check('Guarulhos (sem linha) conta como não enviou', painel.guaru === 'nada');
  check('o painel diz quantas finalizaram', /1 de 3 finalizaram/.test(painel.html));
  check('e separa os três grupos com nome', /Não enviou nada \(1\)/.test(painel.html)
    && /falta finalizar \(1\)/i.test(painel.html) && /Pedido feito \(1\)/.test(painel.html));
  check('a ordem é a fila de cobrança: pendentes antes das prontas',
    painel.html.indexOf('Não enviou nada') < painel.html.indexOf('Pedido feito'));
  check('cada loja leva a hora e dá pra clicar pra abrir ela',
    /selecionarLoja\('boulevard'\)/.test(painel.html) && /\d{2}\/\d{2} \d{2}h\d{2}/.test(painel.html));
  check('o chip da que parou na urgência explica no title',
    /Mandou só a urgência[^"]*João[^"]*ainda não finalizou/.test(painel.html));

  // Painel também aparece quando não há pedido na semana — é quando mais importa saber que
  // ninguém mandou nada, e antes a tela ficava muda nesse caso.
  const semPedido = await p2.evaluate(() => {
    S.pedidoAtual = null;
    S.todosModo = false; S.lojaAtiva = 'bangu'; S.tab = 'pedido';
    renderPedido();
    const h = document.getElementById('content').innerHTML;
    return { temPainel: /Pedido da semana/.test(h), temVazio: /Nenhum pedido nesta semana/.test(h) };
  });
  check('sem pedido na semana, o painel ainda aparece junto do aviso de vazio',
    semPedido.temPainel && semPedido.temVazio);

  // Selo na aba da loja. lojaAtiva é const local do renderPedido (vem de S.lojaAtiva), e o
  // render volta cedo sem S.pedidoAtual — por isso os dois têm que estar postos aqui.
  const selo = await p2.evaluate(() => {
    S.pedidoAtual = { id: 1, status: 'RASCUNHO' };
    S.todosModo = false;
    S.lojaAtiva = 'bangu';
    S.tab = 'pedido';
    renderPedido();
    const tabs = [...document.querySelectorAll('.store-tab')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
    return tabs;
  });
  const tBangu = selo.find(t => /Bangu/.test(t)) || '';
  const tBoule = selo.find(t => /Boulevard/.test(t)) || '';
  const tTeste = selo.find(t => /Loja Teste/.test(t)) || '';
  check('a aba da loja já mostra o selo: ✅ na que finalizou', /✅/.test(tBangu));
  check('⚡ na que só mandou urgência', /⚡/.test(tBoule));
  check('e a Loja Teste fica sem selo em vez de "não enviou"',
    tTeste !== '' && !/✅|⚡|⏳/.test(tTeste));

  // Falha de rede não apaga o painel
  const semRede2 = await p2.evaluate(async () => {
    const antes = Object.keys(S.envioSemana).length;
    envioQuebrado = true;
    return antes;
  });
  await ctx2.unroute('**/rest/v1/**');
  await ctx2.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }));
  const mantido = await p2.evaluate(async () => {
    await carregarEnvioSemana();
    return Object.keys(S.envioSemana).length;
  });
  check('falha de rede mantém o painel em vez de zerar tudo pra "ninguém enviou"',
    mantido === semRede2 && mantido === 2);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
