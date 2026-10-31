// "No fornecedor CIA MATHEUS o pedido e feito toda quinta pra chegar na segunda da semana
//  seguinte, e quando faz a conferencia na semana seguinte os dados nao batem com o que
//  ele pediu. Esta puxando uma semana atras."
//
// A Prov.ant sempre quis dizer "o que o Compras provisionou na semana passada" — o ATO de
// provisionar, que acontece quando o comprador confirma o fornecedor. Mas ela procurava
// pela DATA DE ENTREGA, e entrega nao e pedido: fornecedor que recebe o pedido na quinta e
// entrega na segunda seguinte cai sempre na semana de calendario seguinte.
//
// MEDIDO na semana de 26/10, CIA MATHEUS:
//   · pela data de entrega (como estava): 1.130 — a entrega que caiu em 19–25/10, que veio
//     do pedido de 12/10, DOIS pedidos atras;
//   · pela semana do pedido (como fica):     980 — o que ele realmente pediu em 19/10.
//
// Nao e caso isolado nem universal, e e por isso que ninguem tinha visto: das 12.666
// provisoes com data, 11.341 (89,5%) entregam na mesma semana do pedido e as duas leituras
// coincidem. As 1.325 (10,5%) que escorregam se concentram em poucos fornecedores — CIA
// MATHEUS em 217 de 218 linhas (99,5%), VITOR em 920 de 1.340 (68,7%), SAUDALI/CIACARNE em
// 51 de 73 (69,9%). Nenhuma entrega cai ANTES da semana do pedido.
//
// De quebra resolve a provisao SEM data de entrega (532 linhas, 4,0%; 237 de 506 em SP),
// que sumia da coluna porque NULL nao entra em comparacao de intervalo em SQL. Pela semana
// do pedido ela vale igual as outras, e toda provisao tem pedido.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const PEDIDOS = [
  { id: 'p-2sem',   regiao: 'SP', status: 'CONFIRMADO', semana_inicio: '2026-10-12' },
  { id: 'p-ant-sp', regiao: 'SP', status: 'CONFIRMADO', semana_inicio: '2026-10-19' },
  { id: 'p-ant-rj', regiao: 'RJ', status: 'CONFIRMADO', semana_inicio: '2026-10-19' },
  { id: 'p-atual',  regiao: 'SP', status: 'RASCUNHO',   semana_inicio: '2026-10-26' },
];
// Os quatro casos que importam, com os numeros da semana 19/10 em SP.
const PROVISOES = [
  // 1. Com data dentro da semana passada — ja aparecia, nao pode mudar.
  { id: 1, pedido_id: 'p-ant-sp', catalogo_id: 'cat-casa', loja_slug: 'itaquera',
    qtd_prevista: 52, data_entrega: '2026-10-22', status: 'AGUARDANDO' },
  // 2. SEM data, do pedido da semana passada — o buraco. PETICO em Itaquera.
  { id: 2, pedido_id: 'p-ant-sp', catalogo_id: 'cat-petico', loja_slug: 'itaquera',
    qtd_prevista: 100, data_entrega: null, status: 'AGUARDANDO' },
  { id: 3, pedido_id: 'p-ant-sp', catalogo_id: 'cat-petico', loja_slug: 'guarulhos',
    qtd_prevista: 56, data_entrega: null, status: 'AGUARDANDO' },
  // 3. SEM data mas CANCELADA — nao conta nunca.
  { id: 4, pedido_id: 'p-ant-sp', catalogo_id: 'cat-pmg', loja_slug: 'itaquera',
    qtd_prevista: 999, data_entrega: null, status: 'CANCELADO' },
  // 4. SEM data, mas do pedido da semana ATUAL — e provisao desta semana, nao da passada.
  { id: 5, pedido_id: 'p-atual', catalogo_id: 'cat-petico', loja_slug: 'itaquera',
    qtd_prevista: 777, data_entrega: null, status: 'AGUARDANDO' },
  // 5. Com data NA semana passada, mas de um pedido de outra regiao — a coluna nao filtra
  //    por regiao (o catalogo_id ja e de uma regiao so), e isso tem que continuar assim.
  { id: 6, pedido_id: 'p-ant-rj', catalogo_id: 'cat-rj', loja_slug: 'bangu',
    qtd_prevista: 40, data_entrega: '2026-10-21', status: 'AGUARDANDO' },
  // 6. Com data FORA da semana passada — nao e da semana passada.
  { id: 7, pedido_id: 'p-ant-sp', catalogo_id: 'cat-casa', loja_slug: 'guarulhos',
    qtd_prevista: 500, data_entrega: '2026-11-02', status: 'AGUARDANDO' },
  // 7. O outro lado da mesma moeda: entrega DENTRO da janela da semana passada, mas de um
  //    pedido de DUAS semanas atras. E o 1.130 que aparecia no lugar do 980.
  { id: 8, pedido_id: 'p-2sem', catalogo_id: 'cat-casa', loja_slug: 'itaquera',
    qtd_prevista: 1130, data_entrega: '2026-10-21', status: 'AGUARDANDO' },
];

function responder(url) {
  const u = new URL(url);
  const tabela = u.pathname.split('/').pop();
  let linhas = (tabela === 'gn_pedidos' ? PEDIDOS : tabela === 'gn_provisoes' ? PROVISOES : []).slice();
  u.searchParams.forEach((valor, campo) => {
    if (['select','order','limit','offset'].includes(campo)) return;
    const m = String(valor).match(/^(eq|neq|in|gte|lte|is)\.(.*)$/s);
    if (!m) return;
    const [, op, resto] = m;
    if (op === 'eq')  linhas = linhas.filter(l => String(l[campo]) === resto);
    if (op === 'neq') linhas = linhas.filter(l => String(l[campo]) !== resto);
    // gte/lte com NULL sao DESCONHECIDOS em SQL — a linha nao entra. E exatamente isso
    // que escondia a provisao sem data, entao o dublê precisa se comportar igual.
    if (op === 'gte') linhas = linhas.filter(l => l[campo] != null && String(l[campo]) >= resto);
    if (op === 'lte') linhas = linhas.filter(l => l[campo] != null && String(l[campo]) <= resto);
    if (op === 'is')  linhas = linhas.filter(l => (resto === 'null') === (l[campo] == null));
    if (op === 'in') {
      const lista = resto.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''));
      linhas = linhas.filter(l => lista.includes(String(l[campo])));
    }
  });
  return linhas;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.route('**/rest/v1/**', r => {
    let corpo = '[]';
    try { corpo = JSON.stringify(responder(r.request().url())); } catch (e) {}
    return r.fulfill({ status: 200, contentType: 'application/json', body: corpo });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + ARQ);
  await CAMINHOS.esperarApp(page, ['S'], ['carregarProvisaoAnterior'], 30000);

  const r = await page.evaluate(async () => {
    // Semana ativa 26/10 → a anterior é 19/10–25/10.
    S.semanaAtiva = new Date('2026-10-26T12:00:00');
    await carregarProvisaoAnterior();
    return JSON.parse(JSON.stringify(S.provisaoAnterior));
  });

  const q = (cat, loja) => (r[cat] || {})[loja];

  // ══ 1. O BURACO: PROVISÃO SEM DATA DE ENTREGA ═══════════════════════════════════
  check('a provisão sem data do pedido da semana passada passa a aparecer',
    q('cat-petico', 'itaquera') === 100, JSON.stringify(r['cat-petico']));
  check('e vale pra cada loja, não só pra uma',
    q('cat-petico', 'guarulhos') === 56, JSON.stringify(r['cat-petico']));

  // ══ 2. O QUE JÁ APARECIA NÃO PODE MUDAR ═════════════════════════════════════════
  check('a provisão com data dentro da semana passada continua igual',
    q('cat-casa', 'itaquera') === 52, JSON.stringify(r['cat-casa']));
  check('e a coluna não passou a filtrar por região',
    q('cat-rj', 'bangu') === 40, JSON.stringify(r['cat-rj']));

  // ══ 3. O QUE NÃO PODE ENTRAR ════════════════════════════════════════════════════
  check('provisão cancelada não entra, nem sem data',
    q('cat-pmg', 'itaquera') === undefined, JSON.stringify(r['cat-pmg']));
  // A de 777 e do pedido DESTA semana e tambem nao tem data: se a busca pegasse "toda
  // provisao sem data", ela entraria. O 100 do mesmo produto/loja prova que ela nao somou.
  check('provisão sem data do pedido DESTA semana não vira semana passada',
    !JSON.stringify(r).includes('777') && q('cat-petico', 'itaquera') === 100, JSON.stringify(r));
  // ══ O CASO DO CIA MATHEUS ════════════════════════════════
  check('pedido da semana passada com entrega na SEGUINTE entra — é o que ele pediu',
    q('cat-casa', 'guarulhos') === 500, JSON.stringify(r['cat-casa']));
  check('e a entrega de um pedido de DUAS semanas atrás não toma o lugar dele',
    q('cat-casa', 'itaquera') === 52 && !JSON.stringify(r).includes('1130'),
    JSON.stringify(r['cat-casa']));

  // ══ 4. NADA É SOMADO DUAS VEZES ═════════════════════════════════════════════════
  // As duas buscas são disjuntas por construção, mas somar a mesma linha duas vezes
  // dobraria a quantidade na tela — erro que ninguém percebe olhando.
  const soma = Object.values(r).reduce((a, porLoja) =>
    a + Object.values(porLoja).reduce((b, v) => b + v, 0), 0);
  check('a soma total bate exatamente com as linhas que deviam entrar (52+100+56+40+500)',
    soma === 748, JSON.stringify({ soma, esperado: 748, estado: r }));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
