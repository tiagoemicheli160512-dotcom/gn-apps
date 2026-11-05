// "Já foi identificado anteriormente que, ao clicar mais de uma vez em Urgência ou
//  Finalizar, o pedido avançava indevidamente. Os botões Urgência e Finalizar só podem
//  executar a ação uma vez, evitando erros."
//
// Havia três furos, e nenhum dos três era o `b.disabled = true` que já existia:
//
//  1. O MODAL EMPILHAVA. _abrirPreviaConfirmar não removia um modal anterior, e os dois
//     nasciam com o mesmo id `_pedidoPreviaModal`. A segunda etapa remove por
//     getElementById, que devolve só o primeiro — sobrava um modal na tela com o botão de
//     confirmar vivo, e o toque nele mandava o pedido outra vez.
//
//  2. O DESABILITA ERA DEPOIS DE UM AWAIT. confirmarPedido começa dando blur no input
//     focado e esperando 40 ms; só então desabilitava os botões. Input focado é exatamente
//     o estado de quem acabou de digitar a quantidade e tocou no botão — nessa janela o
//     segundo toque entrava. E desabilitar no DOM não resolve de todo jeito, porque
//     qualquer render() redesenha os botões habilitados no meio do caminho.
//
//  3. "UMA VEZ" VALIA SÓ COM A ABA ABERTA. Recarregar o app liberava reenviar a mesma
//     semana. O rastro disso está em gn_alertas_compras (ver e2e_pedido_botoes.js: Bangu
//     com 15 toques em ⚡ numa semana, envios de 127, 143, 195, 204 e 204 itens numa lista
//     de ~70). gn_pedido_envio_semana já guardava urgencia_em/final_em — faltava consultar.
//
// E a trava não pode ser mais rígida que o problema: bloquear envio é pior que o duplo
// envio, porque a loja fica sem pedido. Por isso ela libera em falha, e a trava semanal só
// vale quando o registro em memória é da semana do calendário de hoje.
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
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof confirmarPedido === 'function' && typeof _abrirPreviaConfirmar === 'function'
        && typeof _confirmarPedidoSegundaEtapa === 'function' && Array.isArray(PRODUTOS_PEDIDO)
        && typeof wkKey === 'function' && typeof getMonday === 'function';
  } catch (e) { return false; } }, null, { timeout: 30000 });

  const preparar = (opts) => page.evaluate((o) => {
    usuarioAtual = { nome: 'Neto', cargo: 'gerente', loja: 'Bangu' };
    loja = 'Bangu'; tab = 'pedido';
    urgenciaGlobal = PRODUTOS_PEDIDO.slice(0, 12).map(p => String(p.item));
    _confirmandoPedido = false;
    // O registro da semana: por padrão, desta semana e sem nada enviado.
    _urgSemanaIni = o.semanaDoRegistro === undefined ? wkKey(getMonday(new Date())) : o.semanaDoRegistro;
    _envioSemana = o.envio || {};
    // Dois itens contados, pra haver o que enviar.
    const k = lojaKey();
    pedidoAll[k] = {};
    PRODUTOS_PEDIDO.slice(0, 2).forEach(p => {
      pedidoAll[k][p.item] = { cx: 2, und: 0, pedidoCx: 1, pedidoUnd: 0, obs: '' };
    });
    render();
  }, opts || {});

  // Conta quantas vezes o envio REALMENTE aconteceu, contando os POST que saem.
  //
  // `comFoco` põe um input numérico em foco antes do duplo disparo. Isso NÃO é detalhe de
  // cenário: confirmarPedido só espera os 40 ms do flush quando há input focado, e era
  // nessa espera que o segundo toque entrava — ou seja, é a condição que abre a janela do
  // defeito, e é o estado real de quem acabou de digitar a quantidade e tocou no botão.
  // Sem foco, mover a trava pra depois do await passava sem falhar nada (mutação confirmou).
  const contarEnvios = (fn, arg, comFoco) => page.evaluate(async ({ fn, arg, comFoco }) => {
      if (comFoco) {
        const inp = document.querySelector('input[type="number"]');
        if (inp) inp.focus();
      }
    const posts = [];
    const orig = window.sbRequest;
    window.sbRequest = async (url, opt) => {
      if ((opt || {}).method === 'POST') posts.push(String(url).split('?')[0]);
      return [];
    };
    const toasts = []; const origToast = window.showToast;
    window.showToast = function (m) { toasts.push(String(m)); };
    const origAlert = window.alert, origConfirm = window.confirm;
    window.alert = () => {}; window.confirm = () => true;
    try {
      // Os dois disparos saem JUNTOS, sem await entre eles — é o duplo toque de verdade.
      const a = window[fn](arg), b = window[fn](arg);
      await Promise.all([a, b].filter(x => x && typeof x.then === 'function'));
      await new Promise(r => setTimeout(r, 600));
    } finally {
      window.sbRequest = orig; window.showToast = origToast;
      window.alert = origAlert; window.confirm = origConfirm;
    }
    const conta = (re) => posts.filter(u => re.test(u)).length;
    // `gn_pedidos` é a linha do pedido: um POST por ação executada. É o marcador de
    // "rodou", e não gn_contagens_pedido — essa só sai pra item com vínculo no catálogo,
    // que a fixture não tem (e o teste não é sobre vínculo).
    return { posts, toasts, acoes: conta(/gn_pedidos\b/),
      envioSemana: conta(/gn_pedido_envio_semana/), alertas: conta(/gn_alertas_compras/) };
  }, { fn, arg, comFoco: !!comFoco });

  // ══ 1. Duplo toque em Urgência manda UMA vez ══════════════════════════════════════
  await preparar({});
  const urg = await contarEnvios('confirmarPedido', 'urgencia', true);
  check('duplo toque em Urgência, com a quantidade recém-digitada, executa a ação uma vez só',
    urg.acoes === 1, JSON.stringify(urg.posts));
  check('e registra o envio da semana uma vez só',
    urg.envioSemana === 1, JSON.stringify(urg.posts));
  check('o segundo toque avisa que já está enviando',
    urg.toasts.some(t => /Já estou enviando/.test(t)), JSON.stringify(urg.toasts));

  // ══ 2. Duplo toque em Finalizar manda UMA vez ═════════════════════════════════════
  await preparar({});
  const fin = await contarEnvios('confirmarPedido', 'final', true);
  check('duplo toque em Finalizar, com a quantidade recém-digitada, executa a ação uma vez só',
    fin.acoes === 1, JSON.stringify(fin.posts));
  check('e registra a finalização uma vez só',
    fin.envioSemana === 1, JSON.stringify(fin.posts));

  // E sem input focado também — aí não há espera de flush, e a trava tem que valer igual.
  await preparar({});
  const semFoco = await contarEnvios('confirmarPedido', 'urgencia', false);
  check('duplo toque sem input focado também executa uma vez só',
    semFoco.acoes === 1, JSON.stringify(semFoco.posts));

  // ══ 3. A trava sobrevive a recarregar: semana já enviada não reenvia ══════════════
  await preparar({ envio: { urgencia_em: '2026-10-26T12:00:00Z', urgencia_por: 'Neto' } });
  const reUrg = await contarEnvios('confirmarPedido', 'urgencia');
  check('urgência já enviada nesta semana não vai de novo',
    reUrg.posts.length === 0, JSON.stringify(reUrg.posts));
  check('e a tela diz por quê, em vez de falhar calada',
    reUrg.toasts.some(t => /urgência desta semana já foi enviada/i.test(t)), JSON.stringify(reUrg.toasts));

  await preparar({ envio: { final_em: '2026-10-26T13:00:00Z' } });
  const reFin = await contarEnvios('confirmarPedido', 'final');
  check('pedido já finalizado nesta semana não finaliza de novo',
    reFin.posts.length === 0, JSON.stringify(reFin.posts));
  check('e a tela diz por quê',
    reFin.toasts.some(t => /já foi finalizado/i.test(t)), JSON.stringify(reFin.toasts));

  // Urgência enviada NÃO bloqueia Finalizar: são ações diferentes, e finalizar é o que o
  // Compras lê. Bloquear aqui deixaria a loja listada como pendente pra sempre.
  await preparar({ envio: { urgencia_em: '2026-10-26T12:00:00Z' } });
  const finDepois = await contarEnvios('confirmarPedido', 'final');
  check('urgência já enviada não impede Finalizar',
    finDepois.acoes === 1, JSON.stringify(finDepois.posts));

  // ══ 4. A trava semanal não pode bloquear envio legítimo ══════════════════════════
  // App deixado aberto atravessando a segunda: o registro em memória é da semana passada.
  // Bloquear aqui deixaria a loja sem pedido — pior que o duplo envio.
  await preparar({ semanaDoRegistro: '2026-10-19',
                   envio: { urgencia_em: '2026-10-20T12:00:00Z' } });
  const outraSemana = await contarEnvios('confirmarPedido', 'urgencia');
  check('registro de OUTRA semana não bloqueia o envio desta',
    outraSemana.acoes === 1, JSON.stringify(outraSemana.posts));
  check('mas o duplo toque continua valendo uma vez só nesse caso',
    outraSemana.acoes === 1 && outraSemana.toasts.some(t => /Já estou enviando/.test(t)),
    JSON.stringify(outraSemana.toasts));

  // ══ 5. O modal de prévia não empilha ═════════════════════════════════════════════
  await preparar({});
  const modais = await page.evaluate(() => {
    _abrirPreviaConfirmar('urgencia');
    _abrirPreviaConfirmar('urgencia');
    _abrirPreviaConfirmar('urgencia');
    const n = document.querySelectorAll('#_pedidoPreviaModal').length;
    // Depois de confirmar, nenhum modal pode sobrar na tela com botão vivo.
    const origConfirm = window.confirm; window.confirm = () => false;
    _confirmarPedidoSegundaEtapa('urgencia', 2);
    window.confirm = origConfirm;
    const sobrou = document.querySelectorAll('#_pedidoPreviaModal').length;
    document.querySelectorAll('#_pedidoPreviaModal').forEach(m => m.remove());
    return { n, sobrou };
  });
  check('três toques no botão abrem UM modal, não três',
    modais.n === 1, JSON.stringify(modais));
  check('e depois de passar pela segunda etapa não sobra modal com botão vivo',
    modais.sobrou === 0, JSON.stringify(modais));

  // ══ 6. A trava libera depois: erro não deixa a loja presa ════════════════════════
  // Se a trava ficasse presa num erro, a loja não conseguiria reenviar depois de corrigir —
  // e aí o pedido da semana não sai. Pior que o duplo envio.
  await preparar({});
  const depoisDeErro = await page.evaluate(async () => {
    const orig = window.sbRequest;
    window.sbRequest = async () => { throw new Error('rede'); };
    const origToast = window.showToast; window.showToast = () => {};
    const origAlert = window.alert; window.alert = () => {};
    try { await confirmarPedido('urgencia'); } catch (e) {}
    finally { window.sbRequest = orig; window.showToast = origToast; window.alert = origAlert; }
    return _confirmandoPedido;
  });
  check('a trava é liberada mesmo quando o envio estoura',
    depoisDeErro === false, String(depoisDeErro));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
