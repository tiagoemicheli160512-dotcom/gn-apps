// O print do celular do usuário mostrou o que o emulador a 390px escondia:
//
//   - as linhas da gerência quebrando no meio ("Gerente:" numa linha, o nome em duas,
//     o horário noutra), porque cada linha era um inline-flex que não podia quebrar e
//     espremia os pedaços;
//   - a fachada sumida, porque o corte estava em 340px e o aparelho dele — tela grande,
//     mas com fonte/zoom do sistema aumentados — tem viewport menor que isso.
//
// Este teste roda nas larguras estreitas de verdade (320 e 300px) e cobra as duas coisas.
// Vale como regra geral: o Painel é usado em aparelho de loja, não em emulador.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 320, height: 800 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof showHome === 'function'; } catch (e) { return false; } }, { timeout: 20000 });

  // Monta o plantão com os nomes REAIS do print — são eles que estouram a linha.
  const montar = () => page.evaluate(async () => {
    window.gnFetchJson = async (u, h, c, fb) => fb;
    session = { id: 1, nome: 'Tiago Silva', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    masterLoja = LOJAS_LISTA[0];
    showHome(session);
    await new Promise(r => setTimeout(r, 400));
    // Alimenta a FUNÇÃO DE VERDADE com uma escala falsa — injetar o HTML na mão faria
    // as duas versões do arquivo renderizarem o mesmo markup, que é o erro que essa
    // comparação já cometeu uma vez.
    const hojeISO = (d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))(new Date());
    const idx = _escalaHomeSemIdx(hojeISO);
    const diaIdx = (new Date().getDay() + 6) % 7;
    const pessoa = (nome, setor, folga) => {
      const dias = Array(7).fill('PRESENTE');
      if (folga) dias[diaIdx] = 'FOLGA';
      const horario_dias = Array(7).fill(null).map(() => ({ entrada: '08:00', saida: '17:00' }));
      return { nome, setor, dias, horario_dias, tipo: 'CLT' };
    };
    const allData = { [String(idx)]: { funcs: [
      pessoa('ANTÔNIO ALVES', 'Gerente', false),
      pessoa('A.CAROLINA BRAGA', 'Sub Gerente', false),
      pessoa('TAYNARA ALVES', 'Sub Gerente', true),
    ] } };
    window.gnFetchJson = async (u, h, c, fb) => (c === 'plantaoHome:rows' ? [{ all_data: allData }] : fb);
    await _renderPlantaoHome(true, session, true);
    await new Promise(r => setTimeout(r, 150));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

  for (const w of [320, 300]) {
    await page.setViewportSize({ width: w, height: 800 });
    await montar();
    const r = await page.evaluate(() => {
      const linhas = [...document.querySelectorAll('#hero-plantao > div > span')];
      const alturas = linhas.map(l => Math.round(l.getBoundingClientRect().height));
      // O horário é a última parte de cada linha: tem que caber inteiro numa linha só.
      const horarios = linhas.map(l => {
        const h = l.lastElementChild;
        return { txt: h.textContent.trim(), altura: Math.round(h.getBoundingClientRect().height) };
      });
      const svg = document.querySelector('.hero-ilustra');
      return {
        alturas, horarios,
        umaOuDuasLinhas: alturas.every(a => a <= 40),   // 11,5px → ~16px por linha
        horarioInteiro: horarios.every(h => h.altura <= 20),
        ilustracaoVisivel: !!svg && svg.getBoundingClientRect().width > 0,
        larguraIlustracao: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
        vazaLado: Math.ceil(document.getElementById('hero').getBoundingClientRect().right) > window.innerWidth,
      };
    });
    console.log(`\n── ${w}px: alturas das linhas = ${r.alturas.join(', ')}px · fachada = ${r.larguraIlustracao}px`);
    check(`${w}px: nenhuma linha da gerência passa de duas linhas`, r.umaOuDuasLinhas);
    check(`${w}px: o horário não quebra no meio`, r.horarioInteiro);
    check(`${w}px: o topo não vaza pro lado`, r.vazaLado === false);
    if (w === 320) check('320px: a fachada continua aparecendo (era onde ela sumia)', r.ilustracaoVisivel);
    if (w === 300) check('300px: aí sim a fachada sai, pra não espremer o texto', r.ilustracaoVisivel === false);
  }

  check('nenhum erro de JS', erros.length === 0);
  if (erros.length) erros.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 160)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
