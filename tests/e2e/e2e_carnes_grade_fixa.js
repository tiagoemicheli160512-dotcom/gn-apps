// "Nessa aba, no painel gestão, aba carne, tem como ao arrastar pra ver os outros dias se
//  manter os nomes carne de sol, picanha e etc, pois ao arrastar o nome vai junto."
//
// A grade tem 8 colunas e não cabe num celular: pra ver sexta, sábado e domingo é preciso
// arrastar — e o nome do corte ia junto, deixando quatro fileiras de números sem dizer de
// que carne eram.
//
// MEDIDO em 390px de largura, antes: o container tinha 338px e a tabela 360, então o
// arrasto INTEIRO era de 22px — menos que a largura de uma coluna (42). Isso cria um
// segundo problema, mais traiçoeiro que o primeiro: a segunda-feira ficava eternamente
// pela metade atrás da coluna fixa, e o pedaço que sobrava ao lado do nome do corte lia-se
// como um valor daquela linha. Por isso esta suíte cobra as duas coisas — o nome ficar, e
// haver arrasto suficiente pra um dia sumir por inteiro em vez de ficar pela metade.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const corte = (ini, dias, ent) => Object.assign({ inicial: String(ini) }, dias, ent || {});
const CARNES = [
  { loja: 'Bangu', semana_inicio: '2026-10-26', updated_at: '2026-10-30T15:25:37Z', carnes: {
      carne_sol:  corte(92.3,  { ter:'80.10', qua:'73.93', qui:'67.26', sex:'62.60' }, { ent_ter:140.67 }),
      picanha:    corte(40.65, { ter:'37.63', qua:'56.36', qui:'50.96', sex:'50.44' }, { ent_ter:21.45 }),
      carne_seca: corte(18.16, { ter:'15.63', qua:'16.38', qui:'16.06', sex:'8.90'  }, { ent_ter:19.53 }),
      camarao:    corte(35.67, { ter:'31.08', qua:'30.21', qui:'29',    sex:'26.67' }) } },
];
const DIARIO = [
  { loja: 'Bangu', data_operacao: '2026-10-26', venda_salao: 5848.30, venda_delivery: 1665.44 },
  { loja: 'Bangu', data_operacao: '2026-10-27', venda_salao: 2491.66, venda_delivery: 1546.67 },
  { loja: 'Bangu', data_operacao: '2026-10-28', venda_salao: 4876.47, venda_delivery: 1355.79 },
  { loja: 'Bangu', data_operacao: '2026-10-29', venda_salao: 3643.42, venda_delivery: 781.75 },
];
const ROTULOS = ['Corte', '💰 Venda (R$)', 'Carne de Sol', 'Picanha', 'Carne Seca', 'Camarão'];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  // 390px: o celular em que a loja abre. Numa tela larga a tabela cabe e nada disto se
  // exerce — é exatamente por isso que a largura faz parte do cenário.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-30T12:57:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['_buildCarnesPanel', '_loadCarnesGerencia'], 25000);

  const montar = (tema) => page.evaluate(async ({ CARNES, DIARIO, tema }) => {
    if (tema === 'escuro') document.documentElement.setAttribute('data-tema', 'escuro');
    else document.documentElement.removeAttribute('data-tema');
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url) => /checklist_carnes/.test(url) ? CARNES
                                      : /checklist_diario/.test(url) ? DIARIO : [];
    _carnesGerLoaded = false; _carnesGerData = null; _carnesGerOff = 1; _carnesRelatorioLojasFiltro = [];
    try { await _loadCarnesGerencia(); } finally { window.gnFetchJson = orig; }
    const el = document.createElement('div'); el.innerHTML = _buildCarnesPanel();
    const card = [...el.querySelectorAll('div')].find(d => /border-left:3px solid/.test(d.getAttribute('style') || ''));
    // No documento de verdade: position:sticky e rolagem só existem renderizados.
    document.body.innerHTML = '<div id="alvo" style="padding:10px">' + card.outerHTML + '</div>';
    const box = document.querySelector('#alvo div[style*="overflow-x"]');
    const linhas = [...box.querySelectorAll('tr')];
    const primeira = linhas.map(t => t.children[0]);
    const estilo = c => { const s = getComputedStyle(c);
      return { position: s.position, left: s.left, bg: s.backgroundColor,
               sombra: s.boxShadow, z: s.zIndex }; };
    const x = c => Math.round(c.getBoundingClientRect().left);
    const antes = { rotulos: primeira.map(x), dia2: x(linhas[0].children[2]) };
    const cardBg = getComputedStyle(document.querySelector('#alvo div[style*="border-left:3px solid"]')).backgroundColor;
    box.scrollLeft = 1e6;
    const maxScroll = box.scrollLeft;
    const depois = { rotulos: primeira.map(x), dia2: x(linhas[0].children[2]) };
    return {
      textos: primeira.map(c => c.textContent.replace(/\s+/g, ' ').trim()),
      estilos: primeira.map(estilo), cardBg,
      colunas: [...linhas[0].children].map(c => Math.round(c.getBoundingClientRect().width)),
      clientWidth: box.clientWidth, scrollWidth: box.scrollWidth, maxScroll, antes, depois,
    };
  }, { CARNES, DIARIO, tema });

  const r = await montar('claro');

  // ══ 1. A COLUNA DOS NOMES É A PRIMEIRA DE CADA LINHA ════════════════════════════
  check('a grade tem a linha de cabeçalho, a da venda e os quatro cortes',
    JSON.stringify(r.textos) === JSON.stringify(ROTULOS), JSON.stringify(r.textos));

  // ══ 2. ELA GRUDA ═══════════════════════════════════════════════════════════════
  check('toda célula de nome é fixada à esquerda',
    r.estilos.every(e => e.position === 'sticky' && e.left === '0px'), JSON.stringify(r.estilos));

  // Fundo OPACO, e é o pedaço que mais importa: sticky sem fundo deixa o conteúdo rolar
  // POR BAIXO do texto, e aí o nome fica ilegível em cima dos números — pior do que o
  // problema original, porque parece que funciona até alguém arrastar.
  const opaco = bg => /^rgb\(/.test(bg) && !/rgba\([^)]*,\s*0(\.\d+)?\)$/.test(bg);
  check('com fundo opaco, pra nada passar por baixo do texto',
    r.estilos.every(e => opaco(e.bg)), JSON.stringify(r.estilos.map(e => e.bg)));
  check('e o mesmo fundo do cartão, pra não virar um bloco à parte',
    r.estilos.every(e => e.bg === r.cardBg), JSON.stringify({ card: r.cardBg, cels: r.estilos.map(e => e.bg) }));
  check('com uma linha separando do que passa atrás',
    r.estilos.every(e => e.sombra && e.sombra !== 'none'), JSON.stringify(r.estilos.map(e => e.sombra)));

  // ══ 3. ARRASTANDO, O NOME FICA E O DIA ANDA ════════════════════════════════════
  // É a queixa, medida: a posição do nome não muda, a da coluna de dia muda.
  check('há o que arrastar nesta largura de tela',
    r.maxScroll > 0 && r.scrollWidth > r.clientWidth,
    JSON.stringify({ clientWidth: r.clientWidth, scrollWidth: r.scrollWidth, maxScroll: r.maxScroll }));
  check('depois de arrastar até o fim, os nomes continuam no mesmo lugar',
    JSON.stringify(r.antes.rotulos) === JSON.stringify(r.depois.rotulos),
    JSON.stringify({ antes: r.antes.rotulos, depois: r.depois.rotulos }));
  check('e as colunas de dia andaram de verdade',
    r.depois.dia2 < r.antes.dia2 - 20, JSON.stringify({ antes: r.antes.dia2, depois: r.depois.dia2 }));

  // ══ 4. DÁ PRA ESCONDER UM DIA INTEIRO, NÃO METADE ══════════════════════════════
  // O arrasto total precisa cobrir pelo menos a primeira coluna de dia. Menos que isso e
  // ela fica presa pela metade atrás do nome, e o pedaço que sobra parece um valor da
  // linha — foi o que a medição de 390px mostrou antes (arrasto de 22px, coluna de 42).
  const colSeg = r.colunas[1];
  check('o arrasto cobre pelo menos uma coluna de dia inteira',
    r.maxScroll >= colSeg,
    JSON.stringify({ maxScroll: r.maxScroll, colunaDia: colSeg, colunas: r.colunas }));

  // ══ 5. NO TEMA ESCURO TAMBÉM ═══════════════════════════════════════════════════
  // É o tema que a loja usa. Fundo claro fixo aqui seria uma faixa branca sobre o cartão
  // escuro, e uma sombra preta seria invisível.
  const e = await montar('escuro');
  check('no escuro os nomes também ficam',
    JSON.stringify(e.antes.rotulos) === JSON.stringify(e.depois.rotulos),
    JSON.stringify({ antes: e.antes.rotulos, depois: e.depois.rotulos }));
  check('o fundo fixo acompanha o tema, em vez de ficar branco sobre o escuro',
    e.estilos.every(x => opaco(x.bg) && x.bg === e.cardBg) && e.cardBg !== r.cardBg,
    JSON.stringify({ claro: r.cardBg, escuro: e.cardBg }));
  check('e a linha separadora continua existindo no escuro',
    e.estilos.every(x => x.sombra && x.sombra !== 'none'), JSON.stringify(e.estilos.map(x => x.sombra)));

  const reais = erros.filter(x => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(x));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
