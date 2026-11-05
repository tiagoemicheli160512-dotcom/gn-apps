// Dúvida do usuário: "gerar novo pedido era pra ter a opção de acrescentar algum pedido que
//  faltou, e não zerar o pedido já confirmado [...] porém agora com o novo botão, ao criar novo
//  pedido por loja, ele reabre o pedido confirmado? Ou só mostra o que já foi pedido? Pra não
//  ter erro?"
//
// Duas coisas pra provar:
//  1. O "Por loja" NÃO reabre nem toca no pedido confirmado — recusa e explica.
//  2. Na 2ª rodada (rascunho novo em cima de um confirmado), o que já foi comprado aparece como
//     NÚMERO. Antes era só fundo verde: dizia que a loja já pediu, nunca quanto — e é esse
//     número que evita pedir de novo o que já foi comprado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 950 } });
  let escritas = [];
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') escritas.push({ m: req.method(), url: req.url(), body: req.postData() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + PEDIDOS);
    try {
      // Esperar só pelas funções não basta: declaração de função é hoisted antes de o script
      // rodar, então o teste entrava enquanto `const S` ainda estava em TDZ e qualquer acesso
      // dava "S is not defined". Esperar pelo S é o que garante o script inteiro executado.
      await page.waitForFunction(() => {
        try { return typeof renderPedido === 'function' && typeof novoPedido === 'function' && typeof S === 'object' && S !== null; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: app Pedidos não carregou'); falhou++; break; } }
  }

  const temChip = await page.evaluate(() => {
    try { return typeof _jaPedidoChip === 'function'; } catch (e) { return false; }
  });
  if (!temChip) {
    console.log('FALHOU: o número "Já pedido" não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 7 falhou');
    await browser.close();
    process.exit(1);
  }

  const montar = (status) => page.evaluate((status) => {
    S.regiao = 'RJ';
    S.semanaAtiva = new Date('2026-09-28T12:00:00');
    S.lojas = [{ slug_pedido: 'bangu', nome_display: 'Bangu' }, { slug_pedido: 'caxias', nome_display: 'Caxias' }];
    S.catalogo = [{ id: 'cat-1', produto: 'Carne Sol', grupo: 'PROTEINA', fornecedor: 'FRIGO', und: 'KG', custo: 40, ativo: true }];
    S.pedidoAtual = { id: 'ped-1', status: status };
    // Confirmado nesta semana: 12 da Bangu (soma das rodadas), nada da Caxias.
    S.pedidosConfirmados = { 'cat-1': { bangu: 12 } };
    S.pedidoItens = {};
    S.pedidoRef = {}; S.pedidoRefOrigem = null;
    S.todosModo = false; S.lojaAtiva = 'bangu'; S.tab = 'pedido';
    return true;
  }, status);

  // ── 1. Por loja recusa no confirmado, sem tocar em nada ─────────────────────────────
  await montar('CONFIRMADO');
  escritas = [];
  const recusa = await page.evaluate(() => {
    abrirModalNovoPedidoLojas();
    return { html: document.getElementById('modal-box').innerHTML,
             checks: document.querySelectorAll('.np-loja').length };
  });
  // No confirmado o botão oferece a 2ª RODADA (acrescentar), não zerar — e o ponto que importa
  // é que só abrir o modal não escreve nada: o pedido confirmado não é tocado.
  check('no pedido CONFIRMADO o Por loja oferece a 2ª rodada pras lojas',
    recusa.checks === 2 && /2ª rodada pra quais lojas/.test(recusa.html));
  check('deixando claro que o confirmado não vai ser alterado',
    /não vai ser alterado/.test(recusa.html));
  check('e mostra, por loja, quanto já foi comprado', /item\(ns\) já comprado\(s\)/.test(recusa.html));
  check('só abrir o modal não escreve NADA no banco', escritas.length === 0);

  // ── 2. Na 2ª rodada, o que já foi comprado aparece como número ──────────────────────
  await montar('RASCUNHO');
  const rodada = await page.evaluate(() => {
    renderPedido();
    const h = document.getElementById('content').innerHTML;
    return { numero: /Já pedido: 12/.test(h), aviso: /Já existe pedido confirmado nesta semana/.test(h),
             soFalta: /lance aqui só o que FALTA/i.test(h) };
  });
  check('a quantidade já comprada aparece como número na linha ("Já pedido: 12")', rodada.numero);
  check('com um aviso explicando que é 2ª rodada', rodada.aviso);
  check('e dizendo pra lançar só o que falta, sem repetir', rodada.soFalta);

  // A loja sem nada confirmado não ganha número nenhum (senão viraria ruído em 300 linhas)
  // Procura o número, não o rótulo: o próprio aviso de 2ª rodada traz o texto "Já pedido: N"
  // como exemplo, e casar com ele mediria o banner em vez da linha do item.
  const outraLoja = await page.evaluate(() => {
    S.lojaAtiva = 'caxias';
    renderPedido();
    return /Já pedido: \d/.test(document.getElementById('content').innerHTML);
  });
  check('loja sem nada confirmado não mostra o número', outraLoja === false);

  // E na visão de todas as lojas o número acompanha a loja certa
  const todas = await page.evaluate(() => {
    S.todosModo = true;
    renderPedido();
    const h = document.getElementById('content').innerHTML;
    return (h.match(/Já pedido: 12/g) || []).length;
  });
  check('na visão de todas as lojas, o número aparece só na linha da loja que pediu', todas === 1);

  // Sem nada confirmado na semana, nem número nem aviso de rodada
  const semConfirmado = await page.evaluate(() => {
    S.pedidosConfirmados = {};
    S.todosModo = false; S.lojaAtiva = 'bangu';
    renderPedido();
    const h = document.getElementById('content').innerHTML;
    return { numero: /Já pedido: \d/.test(h), aviso: /Já existe pedido confirmado/.test(h) };
  });
  check('semana sem pedido confirmado não mostra número nem aviso de 2ª rodada',
    !semConfirmado.numero && !semConfirmado.aviso);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
