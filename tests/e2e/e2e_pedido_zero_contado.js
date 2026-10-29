// "Quando é feita a contagem na segunda-feira, na semana seguinte o sistema precisa
//  apresentar o número correspondente (...) Existem itens que aparentemente não estão
//  seguindo essa lógica."  + "Em relação a ter que colocar se tinha zero, sim pode fazer,
//  pra não gerar erros pra frente; o que já foi não tem o que fazer."
//
// MEDIDO no banco antes de mexer:
//   91 linhas com contagem ZERO em 33.262 (0,27%);
//   803 linhas entre 0 e 1 — a loja conta quantidade mínima, mas não registrava zero;
//   410 casos de item que pulou exatamente uma semana e voltou, nas 11 lojas, 195 itens.
//
// A causa: TRÊS portas barravam o item com contagem 0 e sem pedido —
//   confirmarPedido:          if (qtdBase === 0 && pedCx === 0 && pedUnd === 0 && ...) return;
//   confirmarPedido:          if (qtdBase > 0 || pedCx > 0 || pedUnd > 0) { ...push... }
//   _sincronizarComPedidos:   if (estoqueAtual === 0 && qtdPedida === 0) return;
// Sem linha gravada, a segunda seguinte buscava a contagem mais recente, achava a de duas
// semanas atrás e mostrava um número velho no lugar do zero.
//
// O QUE TORNA O CONSERTO DIFÍCIL, e é o que esta suíte protege: "contei e deu zero" e "não
// mexi nesse item" eram indistinguíveis. Não dá pra deduzir da quantidade, porque o
// inicializador cria {cx:0, und:0} e confirmarPedido cria entrada pra TODO item do
// catálogo em cada confirmação. Se a marca errar pro lado frouxo, o app passa a gravar um
// zero por item do catálogo toda semana — zero que ninguém contou dentro do histórico de
// estoque, pior que o número velho. Por isso metade das verificações aqui cobra o NÃO.
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
    return typeof setPedidoVal === 'function' && typeof confirmarPedido === 'function'
        && typeof _sincronizarComPedidos === 'function' && Array.isArray(PRODUTOS_PEDIDO)
        && typeof lojaKey === 'function';
  } catch (e) { return false; } }, null, { timeout: 30000 });

  const base = () => page.evaluate(() => {
    usuarioAtual = { nome: 'Neto', cargo: 'gerente', loja: 'Bangu' };
    loja = 'Bangu'; tab = 'pedido';
    _confirmandoPedido = false; _urgSemanaIni = null; _envioSemana = {};
    const k = lojaKey();
    pedidoAll[k] = {}; estIniAll[k] = {};
    return { k, itens: PRODUTOS_PEDIDO.slice(0, 4).map(p => String(p.item)) };
  });

  // ══ 1. A marca: só digitar num campo de CONTAGEM marca ════════════════════════════
  const marca = await page.evaluate(({ }) => {
    const k = lojaKey();
    pedidoAll[k] = {};
    const id = String(PRODUTOS_PEDIDO[0].item);
    const r = {};
    setPedidoVal(id, 'cx', '0');            // contou e deu zero
    r.zeroDigitado = !!pedidoAll[k][id]._contado;
    pedidoAll[k] = {};
    setPedidoVal(id, 'cx', '3');            // contou 3
    r.numero = !!pedidoAll[k][id]._contado;
    pedidoAll[k] = {};
    setPedidoVal(id, 'pedidoCx', '2');      // pediu, mas não contou
    r.soPedido = !!pedidoAll[k][id]._contado;
    pedidoAll[k] = {};
    setPedidoVal(id, 'obs', 'nada');        // observação não é contagem
    r.obs = !!pedidoAll[k][id]._contado;
    pedidoAll[k] = {};
    setPedidoVal(id, 'cx', '');             // campo em branco não é contagem
    r.vazio = !!pedidoAll[k][id]._contado;
    // Limpar um campo não apaga a contagem feita no outro.
    pedidoAll[k] = {};
    setPedidoVal(id, 'cx', '5'); setPedidoVal(id, 'und', '2'); setPedidoVal(id, 'und', '');
    r.limpouUmSo = !!pedidoAll[k][id]._contado;
    // Mas limpar os dois desmarca.
    setPedidoVal(id, 'cx', '');
    r.limpouTodos = !!pedidoAll[k][id]._contado;
    return r;
  }, {});
  check('digitar 0 na contagem marca como contado', marca.zeroDigitado === true, JSON.stringify(marca));
  check('digitar um número qualquer também marca', marca.numero === true, JSON.stringify(marca));
  check('mexer só no PEDIDO não marca contagem', marca.soPedido === false, JSON.stringify(marca));
  check('observação não marca contagem', marca.obs === false, JSON.stringify(marca));
  check('campo deixado em branco não marca', marca.vazio === false, JSON.stringify(marca));
  check('limpar um campo não apaga a contagem feita no outro', marca.limpouUmSo === true, JSON.stringify(marca));
  check('limpar todos os campos de contagem desmarca', marca.limpouTodos === false, JSON.stringify(marca));

  // ══ 2. O zero contado CHEGA ao banco ═════════════════════════════════════════════
  const enviar = () => page.evaluate(async () => {
    const posts = [];
    const orig = window.sbRequest;
    window.sbRequest = async (url, opt) => {
      if ((opt || {}).method === 'POST') {
        let corpo = null; try { corpo = JSON.parse((opt || {}).body || 'null'); } catch (e) {}
        posts.push({ url: String(url).split('?')[0], corpo });
      }
      return [];
    };
    const origToast = window.showToast; window.showToast = () => {};
    const origAlert = window.alert; window.alert = () => {};
    const origConfirm = window.confirm; window.confirm = () => true;
    try { await confirmarPedido('urgencia'); await new Promise(r => setTimeout(r, 300)); }
    finally { window.sbRequest = orig; window.showToast = origToast;
              window.alert = origAlert; window.confirm = origConfirm; }
    const cont = posts.find(x => /gn_contagens_pedido/.test(x.url));
    return { linhas: (cont && cont.corpo) || [], urls: posts.map(x => x.url) };
  });

  // Catálogo resolvido na mão: sem catalogo_id nada é gravado, e o teste não é sobre vínculo.
  const comCatalogo = () => page.evaluate(() => {
    window._resolverCatalogoIdOriginal = window._resolverCatalogoId;
    _resolverCatalogoId = (prod) => 'cat-' + prod.item;
  });

  await base(); await comCatalogo();
  const zero = await page.evaluate(async () => {
    const k = lojaKey(); const id = String(PRODUTOS_PEDIDO[0].item);
    setPedidoVal(id, 'cx', '0');     // contou e deu ZERO, não pediu nada
    return { contado: !!pedidoAll[k][id]._contado };
  });
  check('o item está marcado antes de enviar', zero.contado === true, JSON.stringify(zero));
  const envZero = await enviar();
  const idZero = await page.evaluate(() => 'cat-' + PRODUTOS_PEDIDO[0].item);
  const linhaZero = envZero.linhas.find(l => l.catalogo_id === idZero);
  check('a contagem ZERO é gravada em gn_contagens_pedido',
    !!linhaZero, JSON.stringify(envZero.linhas).slice(0, 300));
  check('e é gravada como 0, não como outro número',
    linhaZero && Number(linhaZero.atual) === 0, JSON.stringify(linhaZero));

  // ══ 3. O que NÃO pode acontecer: item não contado não vira linha ═════════════════
  // É a metade que importa: se a marca errar pro lado frouxo, o app grava um zero por item
  // do catálogo toda semana — zero que ninguém contou dentro do histórico de estoque.
  // DOIS contados de um catálogo inteiro, e a cobrança é pelo número EXATO. Com `<= 1` a
  // verificação não enxergava a mutação que marca todo item do catálogo — e essa é
  // precisamente a falha que este conserto não pode ter.
  // Os ids vêm da página pra cá: PRODUTOS_PEDIDO é global do app, não existe no Node.
  const cat = await page.evaluate(() => ({ total: PRODUTOS_PEDIDO.length,
    esperados: [0, 1].map(i => 'cat-' + PRODUTOS_PEDIDO[i].item) }));
  const TOTAL_CATALOGO = cat.total;
  await base(); await comCatalogo();
  await page.evaluate(() => {
    setPedidoVal(String(PRODUTOS_PEDIDO[0].item), 'cx', '7');   // contado
    setPedidoVal(String(PRODUTOS_PEDIDO[1].item), 'cx', '0');   // contado, deu zero
  });
  const envUm = await enviar();
  check('dois itens contados geram exatamente duas linhas, num catálogo de ' + TOTAL_CATALOGO,
    envUm.linhas.length === 2, envUm.linhas.length + ': ' + JSON.stringify(envUm.linhas).slice(0, 300));
  check('e nenhuma linha é de item que ninguém contou',
    envUm.linhas.length > 0 && envUm.linhas.every(l => cat.esperados.includes(l.catalogo_id)),
    JSON.stringify(envUm.linhas.map(l => l.catalogo_id)));

  // Depois de uma confirmação — que cria entrada pra TODO item do catálogo — a segunda
  // confirmação continua gravando só os dois contados.
  await page.evaluate(() => { _confirmandoPedido = false; _envioSemana = {}; _urgSemanaIni = null; });
  const envDepois = await enviar();
  check('a confirmação seguinte grava as mesmas duas, não o catálogo inteiro',
    envDepois.linhas.length === 2, envDepois.linhas.length + ' de ' + TOTAL_CATALOGO + ': '
      + JSON.stringify(envDepois.linhas.map(l => l.catalogo_id)).slice(0, 300));

  // Item em que só o PEDIDO foi digitado continua indo (comportamento de sempre), mas
  // isso não é "contagem zero" — é pedido sem contagem.
  await base(); await comCatalogo();
  await page.evaluate(() => {
    const id = String(PRODUTOS_PEDIDO[1].item);
    setPedidoVal(id, 'pedidoCx', '2');
  });
  const envPed = await enviar();
  check('item só com pedido continua sendo enviado, como antes',
    envPed.linhas.length === 1, JSON.stringify(envPed.linhas).slice(0, 300));

  // ══ 4. A marca é por SEMANA ══════════════════════════════════════════════════════
  const porSemana = await page.evaluate(() => {
    const id = String(PRODUTOS_PEDIDO[0].item);
    const semanaOriginal = semana;
    pedidoAll[lojaKey()] = {};
    setPedidoVal(id, 'cx', '0');
    const marcadoAgora = !!pedidoAll[lojaKey()][id]._contado;
    // Avança uma semana: a chave muda, e a marca da semana passada não vem junto.
    semana = new Date(new Date(semana).getTime() + 7 * 864e5);
    const naSemanaNova = !!((pedidoAll[lojaKey()] || {})[id] || {})._contado;
    semana = semanaOriginal;
    return { marcadoAgora, naSemanaNova };
  });
  check('a marca vale na semana em que a loja contou', porSemana.marcadoAgora === true, JSON.stringify(porSemana));
  check('e não vaza pra semana seguinte', porSemana.naSemanaNova === false, JSON.stringify(porSemana));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
