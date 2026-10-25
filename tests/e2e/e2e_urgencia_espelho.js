// "As urgências têm que ser o espelho do que o app Estoque e Pedido mostra, pois quem marca
//  agora é o Matheus, ele que define, porém tem que ser o total igual pra todas as lojas,
//  pois são as mesmas em todas. E sempre que o Matheus fizer alguma alteração tem que
//  aparecer nas lojas, seja tirando ou acrescentando."
//
// Antes eram 11 listas independentes, marcadas loja por loja — e desencontraram de verdade:
// Boulevard 57 itens, Nova América 85, numa rede onde os itens são os mesmos. O fixture usa
// esses dois números reais.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } });

  // ══════════ LADO DAS LOJAS ══════════
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try {
      await page.waitForFunction(() => {
        try { return typeof _urgItensLoja === 'function' && typeof sbPull === 'function'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) {
      if (t >= 3) {
        console.log('FALHOU: o app Lojas não expõe _urgItensLoja (contraprova esperada: a lista única é nova)');
        falhou++; break;
      }
    }
  }

  // Linhas como o sbPull recebe: a da própria loja (lista antiga) + a linha única nova.
  // Um handler só: no Playwright a rota registrada DEPOIS tem prioridade, então um catch-all
  // registrado em seguida engoliria o gn_lojas e o teste mediria nada.
  let linhas = [];
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const corpo = (/gn_lojas/.test(req.url()) && req.method() === 'GET') ? linhas : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });

  const GLOBAL_85 = Array.from({ length: 85 }, (_, i) => String(i + 1));
  const BOULEVARD_57 = Array.from({ length: 57 }, (_, i) => String(i + 1));

  const lerLoja = (lojaKey) => page.evaluate(async (lojaKey) => {
    loja = lojaKey;
    await sbPull(true);
    // urgenciaGlobal é const/let no escopo do script e não existe na versão antiga — ler por
    // identificador nu dentro de try é o que deixa a contraprova MEDIR (Boulevard 57 vs
    // Bangu 85, listas diferentes) em vez de estourar na primeira linha.
    let g = null;
    try { g = urgenciaGlobal ? urgenciaGlobal.length : null; } catch (e) { g = 'INEXISTENTE'; }
    return { itens: _urgItensLoja().length, global: g };
  }, lojaKey);

  // 1. Sem a linha única: cai na lista por loja (o estado de hoje, pra migração não deixar
  //    ninguém sem urgência enquanto a linha não existe).
  linhas = [{ loja: 'BOULEVARD', all_data: { urgenciaTemplate: { BOULEVARD: BOULEVARD_57 } } }];
  let r = await lerLoja('BOULEVARD');
  check('sem a linha única, ainda lê a lista antiga da loja (57)', r.itens === 57 && r.global === null);

  // 2. Com a linha única: toda loja vê a MESMA lista, inclusive a que tinha 57
  linhas = [
    { loja: 'BOULEVARD', all_data: { urgenciaTemplate: { BOULEVARD: BOULEVARD_57 } } },
    { loja: 'URGENCIA_CONFIG', all_data: { urgenciaGlobal: GLOBAL_85 } },
  ];
  linhas.push({ loja: 'BANGU', all_data: { urgenciaTemplate: { BANGU: GLOBAL_85 } } });
  const boule = await lerLoja('BOULEVARD');
  const bangu = await lerLoja('BANGU');
  const itaquera = await lerLoja('ITAQUERA');
  console.log(`   (lado a lado: Boulevard ${boule.itens} · Bangu ${bangu.itens} · Itaquera ${itaquera.itens})`);
  check('com a linha única, a Boulevard passa a ver os 85 (não os 57 dela)', boule.itens === 85);
  check('e Bangu e Itaquera veem exatamente o mesmo total',
    bangu.itens === 85 && itaquera.itens === 85);
  check('a lista única ganha da lista antiga da loja, não soma com ela', boule.global === 85);

  // 3. Matheus ACRESCENTA → aparece na loja no pull seguinte, sem reload
  linhas[1].all_data.urgenciaGlobal = [...GLOBAL_85, '900', '901'];
  r = await lerLoja('BOULEVARD');
  check('Matheus acrescenta 2 itens → a loja passa a ver 87 no pull seguinte', r.itens === 87);

  // 4. Matheus TIRA → sai da loja no pull seguinte
  linhas[1].all_data.urgenciaGlobal = GLOBAL_85.slice(0, 40);
  r = await lerLoja('BOULEVARD');
  check('Matheus tira itens → a loja cai pra 40 no pull seguinte', r.itens === 40);

  // 5. A restrição da aba Pedido acompanha a lista nova (era decidida só no boot)
  const restricao = await page.evaluate(async () => {
    usuarioAtual = { nome: 'Neto', cargo: 'estoquista', loja: 'BANGU' };
    loja = 'BANGU';
    _urgPendente = false;
    urgenciaGlobal = null;
    const chamou = [];
    const real = _checarUrgenciaPendencia;
    window._checarUrgenciaPendencia = function () { chamou.push(1); return Promise.resolve(); };
    await sbPull(true);
    window._checarUrgenciaPendencia = real;
    return chamou.length;
  });
  check('loja que abriu sem urgência e recebeu a lista depois reavalia a trava sozinha',
    restricao >= 1);

  await page.close();

  // ══════════ LADO DO MATHEUS (app Estoque e Pedido) ══════════
  // O app usa `db` (supabase-js) — const no escopo do script, então a interceptação tem que
  // ser na rede, não trocando window.db.
  let linhaUnica = { loja: 'URGENCIA_CONFIG', all_data: { urgenciaGlobal: ['10', '20', '30'] } };
  let gravacoes = [];
  let gravarFalha = false;   // liga no fim pra testar o rollback da tela
  const p2ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1200, height: 900 } });
  await p2ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const m = req.method();
    if (!/gn_lojas/.test(req.url())) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (m === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([linhaUnica]) });
    }
    const corpo = JSON.parse(req.postData() || '{}');
    if (gravarFalha) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' });
    }
    gravacoes.push({ metodo: m, url: req.url(), corpo });
    if (corpo.all_data && Array.isArray(corpo.all_data.urgenciaGlobal)) {
      linhaUnica = { loja: 'URGENCIA_CONFIG', all_data: corpo.all_data };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p2 = await p2ctx.newPage();
  for (let t = 1; ; t++) {
    await p2.goto('file://' + PEDIDOS);
    try {
      await p2.waitForFunction(() => {
        try { return typeof toggleUrgenciaPedido === 'function' && typeof carregarUrgenciaTemplate === 'function'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: app Pedidos não carregou'); falhou++; break; } }
  }

  const marcar = await p2.evaluate(async () => {
    await carregarUrgenciaTemplate();
    const antes = (S.urgenciaGlobal || []).length;
    // Marca um item novo — uma vez só, sem passar loja nenhuma
    await toggleUrgenciaPedido('777');
    const depois = [...(S.urgenciaGlobal || [])];
    // E desmarca um que já existia
    await toggleUrgenciaPedido('20');
    return { antes, depois, final: [...(S.urgenciaGlobal || [])] };
  });
  check('o app do Matheus carrega a lista única (3 itens)', marcar.antes === 3);
  check('um clique acrescenta pra toda a rede, sem escolher loja',
    marcar.depois.includes('777') && marcar.depois.length === 4);
  check('e um clique remove pra toda a rede',
    !marcar.final.includes('20') && marcar.final.length === 3);

  const grav = await p2.evaluate(() => null);
  const escritas = gravacoes.filter(g => g.corpo && g.corpo.all_data && g.corpo.all_data.urgenciaGlobal);
  check('grava na linha única URGENCIA_CONFIG, não numa linha de loja',
    escritas.length === 2 && escritas.every(g => /URGENCIA_CONFIG/.test(g.url)));
  check('e nunca escreve em MASTER_CONFIG (lá o app Lojas reescreve o all_data inteiro)',
    !gravacoes.some(g => /MASTER_CONFIG/.test(g.url)));

  // A assinatura só precisa do item: chamada antiga com loja não pode marcar outra coisa
  const umaSoLista = await p2.evaluate(async () => {
    const antes = [...(S.urgenciaGlobal || [])];
    const urgA = _pedidoItemUrgente({ item_id: antes[0] }, 'boulevard');
    const urgB = _pedidoItemUrgente({ item_id: antes[0] }, 'bangu');
    const urgSemLoja = _pedidoItemUrgente({ item_id: antes[0] });
    return { urgA, urgB, urgSemLoja };
  });
  check('o item marcado aparece urgente pra qualquer loja consultada',
    umaSoLista.urgA === true && umaSoLista.urgB === true && umaSoLista.urgSemLoja === true);

  // Erro ao gravar não pode deixar o ⚡ aceso mentindo pro Compras
  gravarFalha = true;
  const semGravar = await p2.evaluate(async () => {
    const antes = [...(S.urgenciaGlobal || [])];
    await toggleUrgenciaPedido('555');
    return { antes, depois: [...(S.urgenciaGlobal || [])] };
  });
  check('se a gravação falha, a tela volta atrás em vez de mostrar urgência que não existe',
    !semGravar.depois.includes('555') && semGravar.depois.length === semGravar.antes.length);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
