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
        && typeof _pedidoItensEscondidos === 'function' && typeof _pedidoEscondidosSet === 'function'
        && typeof _mesclarListasPedido === 'function' && typeof _carregarNomesEscondidos === 'function'
        && Array.isArray(PRODUTOS_PEDIDO);
  } catch (e) { return false; } }, null, { timeout: 25000 });

  const montar = async (removidos, restaurados) => page.evaluate(({ PRODUTOS, removidos, restaurados }) => {
    PRODUTOS_PEDIDO.length = 0; PRODUTOS_PEDIDO.push(...PRODUTOS);
    pedidoCustom = [];
    pedidoRemovidos = removidos.slice();
    pedidoRestaurados = (restaurados || []).slice();
    _nomesEscondidos = {};
  }, { PRODUTOS, removidos, restaurados });

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
    escondidos[0] && escondidos[0].naLista === true, JSON.stringify(escondidos[0]));

  // Item escondido que não está mais no catálogo da região: a tela não pode prometer que
  // ele volta, porque restaurar não o traz de volta pra lista.
  await montar(['9', 'C999']);
  const comSumido = await page.evaluate(() => _pedidoItensEscondidos());
  const fora = comSumido.find(e => e.id === 'C999');
  check('item escondido sem cadastro é marcado como tal, em vez de sumir',
    !!fora && fora.naLista === false && fora.produto === null, JSON.stringify(comSumido));
  check('e a tela avisa que trazer de volta não o faz aparecer na lista',
    !!fora && /não está mais no catálogo/.test(fora.motivo || ''), JSON.stringify(fora));

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

  // ══ 3b. A VOLTA TEM DE SOBREVIVER À UNIÃO ENTRE AS LOJAS ═══════════════════════
  // É o defeito que a primeira versão deste conserto NÃO resolvia, e que foi medido ao
  // vivo: a Stella foi retirada de pedidoRemovidos das 11 lojas direto no banco e
  // RESSUSCITOU em três delas em minutos — as que estavam com o app aberto reenviaram a
  // lista antiga, e o merge do sbPull é união pura (só acrescenta). Tirar o id da lista
  // local, sozinho, é sempre desfeito pela próxima sincronização.
  // Chama a união DE VERDADE (_mesclarListasPedido, a mesma que o sbPull usa a cada
  // sincronização). Reescrever a regra aqui faria o teste concordar consigo mesmo e
  // passar com o app quebrado — e foi assim que a primeira versão desta suíte deixou
  // viva a mutação que tirava a união dos restaurados.
  const simularUniao = (outrasLojas) => page.evaluate(outras => {
    outras.forEach(d => _mesclarListasPedido(d));
    return { removidos: pedidoRemovidos.slice(), restaurados: pedidoRestaurados.slice(),
             lista: getProdutosPedidoOrdenados().map(p => String(p.item)) };
  }, outrasLojas);

  await montar(['9'], []);
  await page.evaluate(() => { restaurarItemPedido('9'); });
  // Outra loja ainda com o item escondido — o estado real das 11 lojas no momento do
  // conserto.
  const aposUniao = await simularUniao([{ pedidoRemovidos: ['9'] }]);
  check('a loja vizinha ainda tem o id escondido, e isso continua chegando',
    aposUniao.removidos.includes('9'), JSON.stringify(aposUniao.removidos));
  check('mas o item NÃO ressuscita — a volta vence a união',
    aposUniao.lista.includes('9'), JSON.stringify(aposUniao.lista));
  check('e a volta fica registrada pra se espalhar pras outras lojas',
    aposUniao.restaurados.includes('9'), JSON.stringify(aposUniao.restaurados));

  // E o caminho inverso: a volta feita em OUTRA loja chega nesta e vale aqui também.
  await montar(['9'], []);
  const recebeuVolta = await simularUniao([{ pedidoRemovidos: ['9'], pedidoRestaurados: ['9'] }]);
  check('a volta feita em outra loja chega e vale aqui também',
    recebeuVolta.lista.includes('9'), JSON.stringify(recebeuVolta.lista));

  // Esconder de novo tem que funcionar: senão o item ficaria preso visível pra sempre.
  await montar(['9'], ['9']);
  page.once('dialog', async d => { await d.accept(); });
  await page.evaluate(() => { removerItemPedido('9'); });
  await page.waitForTimeout(200);
  const escondeuDeNovo = await page.evaluate(() => ({
    restaurados: pedidoRestaurados.slice(),
    lista: getProdutosPedidoOrdenados().map(p => String(p.item)),
  }));
  check('esconder de novo tira a marca de volta — senão o item ficava preso visível',
    !escondeuDeNovo.restaurados.includes('9'), JSON.stringify(escondeuDeNovo.restaurados));
  check('e o item some da lista outra vez',
    !escondeuDeNovo.lista.includes('9'), JSON.stringify(escondeuDeNovo.lista));

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

  // ══ 6. A LÁPIDE PRECISA CHEGAR AO SERVIDOR ═════════════════════════════════════
  // Se ela ficar só na memória do aparelho, a volta morre no próximo carregamento e o
  // item some de novo — do jeito que ninguém consegue reportar, porque "funcionou e
  // depois desfez sozinho".
  await montar(['9'], ['9']);
  const enviado = await page.evaluate(async () => {
    const pedidos = [];
    const origReq = window.sbRequest;
    window.sbRequest = async (rota, opts) => {
      if (opts && (opts.method === 'PATCH' || opts.method === 'POST') && opts.body) {
        try { pedidos.push(JSON.parse(opts.body)); } catch (e) {}
      }
      return [];
    };
    try { await sbPush(); } catch (e) {}
    window.sbRequest = origReq;
    const corpo = pedidos.map(b => JSON.stringify(b)).join(' ');
    return { achou: /pedidoRestaurados/.test(corpo), n: pedidos.length };
  });
  check('o push pro servidor leva a lista de restaurados',
    enviado.achou === true, JSON.stringify(enviado));

  // ══ 7. O NOME DO ITEM ESCONDIDO ════════════════════════════════════════════════
  // Foi o que apareceu na tela da Campo Grande: seis linhas sem nome nenhum, todas
  // dizendo "fora do catálogo desta região", e ninguém sabia o que estava trazendo de
  // volta. A causa: PRODUTOS_PEDIDO só tem o que está ATIVO, e item desativado não tem
  // nome ali. O nome tem que vir do catálogo, sem o filtro de ativo.
  await montar(['97'], []);
  const semNome = await page.evaluate(() => _pedidoItensEscondidos()[0]);
  check('item desativado começa sem nome, porque não está em PRODUTOS_PEDIDO',
    semNome && semNome.produto === null, JSON.stringify(semNome));

  const comNome = await page.evaluate(async () => {
    const orig = window.sbRequest;
    window.sbRequest = async (rota) => {
      if (/gn_catalogo/.test(rota) && /item_id=in/.test(rota)) {
        return [{ item_id: 97, produto: 'Abobora Moranga', grupo: 'HORTIFRUTI', ativo: false, regiao: 'RJ' }];
      }
      return [];
    };
    await _carregarNomesEscondidos();
    window.sbRequest = orig;
    return _pedidoItensEscondidos()[0];
  });
  check('depois da busca no catálogo, o item escondido tem nome',
    comNome && comNome.produto === 'Abobora Moranga', JSON.stringify(comNome));
  check('e a tela diz o motivo certo: desativado, não "de outra região"',
    comNome && /desativado no catálogo/.test(comNome.motivo || ''), JSON.stringify(comNome));
  check('e avisa que trazer de volta não o faz aparecer na lista',
    comNome && comNome.naLista === false, JSON.stringify(comNome));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
