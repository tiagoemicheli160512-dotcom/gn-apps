// "No app lojas, colocamos o parâmetro de urgências antes de liberar o preenchimento do
//  pedido todo, na aba pedido. Seria possível nessa urgência separar por categoria? Ou seja
//  ter a categoria bebidas e só aparecer as urgências, e assim por diante."
//
// Dado real: 80 itens de urgência no catálogo do Rio, espalhados em 8 categorias — BEBIDAS
// 35, PETISCOS 20, SOBREMESA 8, PERECÍVEIS 7, MERCEARIA/PRODUÇÃO/PROTEÍNA 3 cada,
// HORTIFRUTI 1. Mais um item avulso criado por loja, sem grupo.
//
// O risco desta mudança não é a categoria não aparecer: é ela virar rota de fuga da trava.
// Metade das checagens é sobre isso — a categoria recorta DENTRO da urgência, e o que
// libera continua sendo o conjunto inteiro contado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS_APP = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Catálogo de mentira com a mesma FORMA do real: categorias de tamanhos diferentes, itens
// urgentes e não-urgentes misturados, e um avulso sem grupo.
const PRODUTOS = [
  { item: '10', produto: 'COCA LATA',      grupo: 'BEBIDAS',   urgente: true },
  { item: '11', produto: 'GUARANA LATA',   grupo: 'BEBIDAS',   urgente: true },
  { item: '12', produto: 'CERVEJA',        grupo: 'BEBIDAS',   urgente: true },
  { item: '13', produto: 'SUCO',           grupo: 'BEBIDAS',   urgente: false },
  { item: '20', produto: 'TORRESMO',       grupo: 'PETISCOS',  urgente: true },
  { item: '21', produto: 'BOLINHO',        grupo: 'PETISCOS',  urgente: true },
  { item: '22', produto: 'AZEITONA',       grupo: 'PETISCOS',  urgente: false },
  { item: '30', produto: 'PUDIM',          grupo: 'SOBREMESA', urgente: true },
  { item: '40', produto: 'ALFACE',         grupo: 'HORTIFRUTI',urgente: false },
  { item: 'C9', produto: 'ITEM DA LOJA',   grupo: '',          urgente: true },
];
const URGENTES = PRODUTOS.filter(p => p.urgente).map(p => p.item);

async function abrir(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS_APP);
    try {
      await page.waitForFunction(() => {
        try { return typeof _urgFaltamContar === 'function' && typeof getProdutosPedidoOrdenados === 'function'
                   && typeof render === 'function'; } catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  return { ctx, page };
}

// Põe o app na aba Pedido com a trava de urgência de pé e os produtos acima.
const montar = (page, contados) => page.evaluate(([prods, urgentes, contados]) => {
  usuarioAtual = { id: 1, nome: 'Teste', cargo: 'gerente', loja: 'PEDREIRA' };
  loja = 'PEDREIRA';
  urgenciaGlobal = urgentes.slice();
  // PRODUTOS_PEDIDO é const: muta no lugar em vez de reatribuir.
  PRODUTOS_PEDIDO.length = 0;
  prods.forEach(p => PRODUTOS_PEDIDO.push(Object.assign({
    fornecedor: 'F', subgrupo: '', und: 'UN', custo: 0, isCustom: String(p.item).startsWith('C'),
  }, p)));
  getProdutosPedidoOrdenados = function () { return PRODUTOS_PEDIDO.slice(); };
  // getPedido() lê pedidoAll[lojaKey()], que pode não existir ainda.
  pedidoAll[lojaKey()] = {};
  const ped = pedidoAll[lojaKey()];
  (contados || []).forEach(id => { ped[id] = { atual: '5' }; });
  _urgPendente = true;
  window._urgGrupo = '__TODOS__';
  tab = 'pedido';
  return true;
}, [PRODUTOS, URGENTES, contados]);

// Lê o que a tela mostra depois de escolher uma categoria.
const verCategoria = (page, grupo) => page.evaluate((grupo) => {
  window._urgGrupo = grupo;
  render();
  const c = document.getElementById('content') || document.body;
  const linhas = Array.from(c.querySelectorAll('.row-item[data-pid]')).map(el => el.getAttribute('data-pid'));
  const chips = Array.from(c.querySelectorAll('button'))
    .map(b => (b.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(t => /^(TODAS|BEBIDAS|PETISCOS|SOBREMESA|HORTIFRUTI|OUTROS)\b/.test(t));
  const txt = (c.textContent || '').replace(/\s+/g, ' ');
  return {
    itens: linhas,
    chips,
    grupoEfetivo: _urgGrupoAtivo(),
    faltamTotal: _urgFaltamContar(),
    finalizarTravado: /🔒 Finalizar|Finalizar/.test(txt) && /Envie a urgência primeiro|🔒/.test(c.innerHTML),
  };
}, grupo);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const a = await abrir(browser);
  await montar(a.page, []);

  // ── 1. A categoria mostra só a urgência dela ───────────────────────────────────
  const todas = await verCategoria(a.page, '__TODOS__');
  // 7 urgentes: 3 bebidas + 2 petiscos + 1 sobremesa + 1 avulso da loja.
  check('em TODAS, aparecem os 7 itens de urgência e só eles',
    todas.itens.slice().sort().join() === ['10','11','12','20','21','30','C9'].sort().join());

  const beb = await verCategoria(a.page, 'BEBIDAS');
  check('em BEBIDAS, só as 3 bebidas urgentes', beb.itens.sort().join() === ['10','11','12'].join());
  check('o suco (bebida NÃO urgente) não entra', !beb.itens.includes('13'));

  const pet = await verCategoria(a.page, 'PETISCOS');
  check('em PETISCOS, só os 2 petiscos urgentes', pet.itens.sort().join() === ['20','21'].join());
  check('a azeitona (petisco não urgente) não entra', !pet.itens.includes('22'));

  const sob = await verCategoria(a.page, 'SOBREMESA');
  check('em SOBREMESA, só o pudim', sob.itens.join() === '30');

  // ── 2. O avulso sem grupo não desaparece ──────────────────────────────────────
  const out = await verCategoria(a.page, 'OUTROS');
  check('item criado pela loja, sem grupo, cai em OUTROS', out.itens.join() === 'C9');

  // ── 3. Categoria sem urgência nenhuma não é oferecida ─────────────────────────
  check('HORTIFRUTI não aparece (não tem urgência)',
    !todas.chips.some(t => /^HORTIFRUTI/.test(t)));
  check('as categorias oferecidas são só as que têm urgência',
    todas.chips.filter(t => !/^TODAS/.test(t)).length === 4);

  // ── 4. A CATEGORIA NÃO PODE SER ROTA DE FUGA ─────────────────────────────────
  check('o total que falta não muda ao trocar de categoria',
    beb.faltamTotal === 7 && pet.faltamTotal === 7 && sob.faltamTotal === 7);
  check('Finalizar continua travado dentro de uma categoria', beb.finalizarTravado === true);

  // Conta TODA a categoria BEBIDAS: ela fecha, mas a trava geral continua.
  await montar(a.page, ['10', '11', '12']);
  const bebFeita = await verCategoria(a.page, 'BEBIDAS');
  check('com BEBIDAS toda contada, o total ainda acusa os outros 4', bebFeita.faltamTotal === 4);
  const chipBeb = bebFeita.chips.find(t => /^BEBIDAS/.test(t)) || '';
  check('a categoria pronta ganha ✓', /✓/.test(chipBeb));
  const chipPet = bebFeita.chips.find(t => /^PETISCOS/.test(t)) || '';
  check('e a que falta mostra quantos faltam', /\(2\)/.test(chipPet));
  check('e Finalizar segue travado', bebFeita.finalizarTravado === true);

  // Tudo contado: aí sim o contador zera (o envio em si é outro fluxo, já coberto
  // por e2e_envio_semana).
  await montar(a.page, ['10', '11', '12', '20', '21', '30', 'C9']);
  const tudo = await verCategoria(a.page, 'BEBIDAS');
  check('com a urgência inteira contada, nada mais falta', tudo.faltamTotal === 0);

  // ── 5. Categoria que saiu da urgência não deixa a tela vazia e travada ───────
  // O Compras reedita a lista toda semana. Se a loja tinha BEBIDAS escolhida e o item
  // saiu, sem validação a tela voltaria vazia COM a trava de pé — nada pra contar e nada
  // que libere.
  await montar(a.page, []);
  const sumiu = await a.page.evaluate(() => {
    window._urgGrupo = 'BEBIDAS';
    urgenciaGlobal = ['20', '21'];   // só petiscos agora
    render();
    const c = document.getElementById('content') || document.body;
    return {
      grupoEfetivo: _urgGrupoAtivo(),
      itens: Array.from(c.querySelectorAll('.row-item[data-pid]')).map(el => el.getAttribute('data-pid')),
    };
  });
  check('categoria que saiu da urgência cai de volta em TODAS', sumiu.grupoEfetivo === '__TODOS__');
  check('e a lista mostra o que sobrou, em vez de ficar vazia',
    sumiu.itens.sort().join() === ['20','21'].join());

  await a.ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
