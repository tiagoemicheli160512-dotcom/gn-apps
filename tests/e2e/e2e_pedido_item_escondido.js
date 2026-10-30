// "A cerveja Stella 550 ml cx 24 não aparece em bebidas e em lugar nenhum. Mas está no
//  catálogo, e também no app estoque e pedido normalmente."
//
// A causa não era filtro nem bug de leitura: alguém clicou no 🗑 da lista de pedido. E
// esse botão era uma PORTA DE UMA VIA.
//
//   · `pedidoRemovidos` é UNIDA entre as lojas no sbPull: um id removido numa loja entra
//     na lista de todas as outras e nunca mais sai (o merge só acrescenta).
//   · Nenhuma tela mostrava o que estava escondido.
//   · Nenhum botão desfazia.
//
// Resultado medido no banco: item 9 (Stella 550 ml, ATIVA no catálogo) estava em
// pedidoRemovidos das 11 lojas, junto com o 1052 (Chopp Vinho Barril 50 L, também ativo)
// e três itens já inativos — esses ninguém sentiu falta.
//
// O que esta suíte cobra é o caminho de volta, porque era ele que não existia: o que foi
// escondido tem que APARECER em algum lugar, e tem que dar pra trazer de volta sem o TI.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

const PRODUTOS = [
  { item: 9,  fornecedor: 'AMBEV', grupo: 'BEBIDAS', subgrupo: 'CERVEJA', produto: 'Stella 550 ml Cx c/ 24 unds', und: 'CX', custo: 186.2 },
  { item: 10, fornecedor: 'AMBEV', grupo: 'BEBIDAS', subgrupo: 'CERVEJA', produto: 'Brahma 600 ml Cx c/ 24 unds', und: 'CX', custo: 150 },
  { item: 77, fornecedor: 'DIVERSOS', grupo: 'UTILIDADES', subgrupo: 'GERAL', produto: 'Pano de prato', und: 'UND', custo: 9 },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof removerItemPedido === 'function' && typeof restaurarItemPedido === 'function'
        && typeof _pedidoItensEscondidos === 'function' && Array.isArray(PRODUTOS_PEDIDO);
  } catch (e) { return false; } }, null, { timeout: 25000 });

  const montar = async (removidos) => page.evaluate(({ PRODUTOS, removidos }) => {
    PRODUTOS_PEDIDO.length = 0; PRODUTOS_PEDIDO.push(...PRODUTOS);
    pedidoCustom = [];
    pedidoRemovidos = removidos.slice();
  }, { PRODUTOS, removidos });

  // ══ 1. O FILTRO QUE FAZIA O ITEM SUMIR ══════════════════════════════════════════
  await montar([]);
  const todos = await page.evaluate(() => getProdutosPedidoOrdenados().map(p => String(p.item)));
  check('sem nada escondido, a Stella está na lista', todos.includes('9'), JSON.stringify(todos));

  await montar(['9']);
  const semStella = await page.evaluate(() => getProdutosPedidoOrdenados().map(p => String(p.item)));
  check('com o id em pedidoRemovidos, ela some da lista inteira',
    !semStella.includes('9'), JSON.stringify(semStella));
  // Era isto que fazia o item "não aparecer em bebidas e em lugar nenhum": a lista do
  // pedido é a fonte de TODAS as telas desta aba, não só da de Bebidas.
  // Pelo rótulo EXATO do item do catálogo: as fichas técnicas têm um insumo próprio
  // chamado "STELLA ARTOIS 600ML", que é outra coisa e continua na contagem. Procurar só
  // por /STELLA/ casava com ele e a checagem falhava sem nada estar errado — e, pior, o
  // mesmo engano de nome pode ser o que levou alguém a esconder o item achando que era
  // duplicata.
  const rotuloExato = 'STELLA 550 ML CX C/ 24 UNDS';
  check('e some também da contagem física, que lê a mesma lista',
    await page.evaluate(r => !_itensContagemFisica().some(i => (i.label || '') === r), rotuloExato),
    JSON.stringify(await page.evaluate(() => _itensContagemFisica().map(i => i.label).slice(0, 8))));
  check('e o insumo de ficha de nome parecido NÃO é afetado — é outro item',
    await page.evaluate(() => _itensContagemFisica().some(i => (i.label || '') === 'STELLA ARTOIS 600ML')));

  // ══ 2. O QUE ESTÁ ESCONDIDO PRECISA SER VISÍVEL ═════════════════════════════════
  const escondidos = await page.evaluate(() => _pedidoItensEscondidos());
  check('o item escondido aparece na lista de escondidos', escondidos.length === 1, JSON.stringify(escondidos));
  check('com o nome, não só o número — número não diz nada pra quem está na loja',
    escondidos[0] && escondidos[0].produto === 'Stella 550 ml Cx c/ 24 unds', JSON.stringify(escondidos[0]));
  check('e marcado como ainda existente no catálogo',
    escondidos[0] && escondidos[0].noCatalogo === true, JSON.stringify(escondidos[0]));

  // Item escondido que não está mais no catálogo da região: a tela não pode prometer que
  // ele volta, porque restaurar não o traz de volta pra lista.
  await montar(['9', 'C999']);
  const comSumido = await page.evaluate(() => _pedidoItensEscondidos());
  const fora = comSumido.find(e => e.id === 'C999');
  check('item escondido que saiu do catálogo é marcado como tal, em vez de sumir',
    !!fora && fora.noCatalogo === false && fora.produto === null, JSON.stringify(comSumido));

  // ══ 3. O CAMINHO DE VOLTA, QUE NÃO EXISTIA ═════════════════════════════════════
  await montar(['9']);
  // Espiona o autoSave: sem ele a restauração vive só na memória da aba, e o item volta
  // pra sumir de novo no próximo carregamento — exatamente o tipo de "consertei e
  // desconsertou sozinho" que ninguém consegue reportar direito.
  const depois = await page.evaluate(() => {
    const orig = window.autoSave; let salvou = 0;
    window.autoSave = function () { salvou++; return orig.apply(this, arguments); };
    restaurarItemPedido('9');
    window.autoSave = orig;
    return {
      salvou,
      removidos: pedidoRemovidos.slice(),
      lista: getProdutosPedidoOrdenados().map(p => String(p.item)),
    };
  });
  check('restaurar grava — senão o item volta a sumir no próximo carregamento',
    depois.salvou === 1, JSON.stringify(depois.salvou));
  check('restaurar tira o id da lista de escondidos',
    !depois.removidos.includes('9'), JSON.stringify(depois.removidos));
  check('e o item volta pra lista do pedido', depois.lista.includes('9'), JSON.stringify(depois.lista));
  check('e volta também pra contagem física',
    await page.evaluate(r => _itensContagemFisica().some(i => (i.label || '') === r), rotuloExato));

  // Restaurar o que não está escondido não pode mexer em nada (nem gravar à toa).
  await montar(['9']);
  await page.evaluate(() => { restaurarItemPedido('10'); });
  check('restaurar um item que não estava escondido não mexe na lista',
    (await page.evaluate(() => pedidoRemovidos.join(','))) === '9');

  // ══ 4. O AVISO PRECISA DIZER O ALCANCE ═════════════════════════════════════════
  // A lista é unida entre as lojas no sbPull, então esconder numa esconde em todas. O
  // botão antes dizia só "Remover este item da lista de pedido?" — parecia preferência
  // da loja, e era mudança na rede inteira.
  await montar([]);
  let textoConfirm = '';
  page.once('dialog', async d => { textoConfirm = d.message(); await d.dismiss(); });
  await page.evaluate(() => { removerItemPedido('9'); });
  await page.waitForTimeout(200);
  check('o aviso nomeia o produto que vai sumir',
    /Stella 550 ml/.test(textoConfirm), textoConfirm);
  check('e diz que vale pra TODAS as lojas, não só pra esta',
    /TODAS as lojas/.test(textoConfirm), textoConfirm);
  check('e diz onde desfazer', /escondidos/i.test(textoConfirm), textoConfirm);
  check('recusar o aviso não esconde nada',
    (await page.evaluate(() => pedidoRemovidos.length)) === 0);

  // Aceitando, esconde de verdade.
  page.once('dialog', async d => { await d.accept(); });
  await page.evaluate(() => { removerItemPedido('9'); });
  await page.waitForTimeout(200);
  check('aceitando, o item é escondido',
    (await page.evaluate(() => pedidoRemovidos.includes('9'))) === true);

  // ══ 5. A TELA MOSTRA TUDO ISSO ═════════════════════════════════════════════════
  const html = await page.evaluate(() => {
    pedidoRemovidos = ['9'];
    const el = document.createElement('div');
    // O bloco é montado dentro do render da aba Pedido; aqui basta a função que o alimenta
    // mais a marcação, que é o que o usuário lê.
    const esc = _pedidoItensEscondidos();
    el.innerHTML = esc.map(e => e.produto || e.id).join(' | ');
    return el.textContent;
  });
  check('a tela tem o nome do item escondido pra mostrar',
    /Stella 550 ml/.test(html), html);

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
