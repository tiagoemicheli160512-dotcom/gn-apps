// "Ao gerar o relatório das lojas no app Home, painel de gestão, teria como colocar por
//  loja aquele alfinete ao lado da loja, e dar um espaço a cada nova loja. Assim achei
//  confuso."
//
// O print mostra o problema: cada loja ocupa DUAS linhas quando tem rodízio/feijoada, e no
// celular a linha do buffet de uma loja encostava no nome da seguinte — parecia pertencer
// a ela. O marcador `•` também não separava nada visualmente.
//
// O fixture reproduz o print: Norte Shopping e Bangu com buffet, uma loja sem buffet e uma
// sem dados, com os mesmos valores que aparecem na foto.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const DADOS = {
  range: { label: '01/10 a 09/10' },
  perTipo: 'Período',
  total: 300000,
  dtGer: '09/10/2026 14:51',
  metaFunc: 3500, metaFuncAtencao: 3000,
  lojasDados: [
    { nome: 'Norte Shopping', v: 104420.89, vP: 95800, meta: 149172, funcN: 36,
      vendaPorFunc: 2900, manut: 0,
      buf: { rodizioQtd: 0, rodizio: 0, feijoadaQtd: 62, feijoada: 4100 } },
    { nome: 'Bangu', v: 94940.30, vP: 77800, meta: 120177, funcN: 35,
      vendaPorFunc: 2712, manut: 2,
      buf: { rodizioQtd: 32, rodizio: 2500, feijoadaQtd: 6, feijoada: 419.40 } },
    { nome: 'Pedreira', v: 80000, vP: 0, meta: 100000, funcN: 20,
      vendaPorFunc: 4000, manut: 0, buf: null },
    { nome: 'Guarulhos', v: 0, vP: 0, meta: 90000, funcN: null,
      vendaPorFunc: null, manut: 0, buf: null },
  ],
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => { try { return typeof _relTexto === 'function' && LOJAS_TODAS; } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const r = await page.evaluate((d) => {
    window._relData = d;
    return { wpp: _relTexto(true), pdf: _relTexto(false) };
  }, DADOS);

  const linhas = r.wpp.split('\n');
  const iLojas = linhas.map((l, i) => ({ l, i })).filter(x => /^📍/.test(x.l));

  // ── O alfinete ────────────────────────────────────────────────────────────────
  check('cada loja com dados ganha o alfinete', iLojas.length === 3);
  check('e são as 3 lojas certas, na ordem',
    iLojas.map(x => x.l.replace(/^📍 \*?/, '').split(/[:*]/)[0]).join('|') === 'Norte Shopping|Bangu|Pedreira');
  check('a loja sem dados não entra na lista', !/📍 .*Guarulhos/.test(r.wpp));
  check('o marcador • sumiu da lista de lojas', !/^• /m.test(r.wpp));
  check('o título da seção não usa mais o alfinete — ele agora só marca loja',
    /🏪 \*Por loja:\*/.test(r.wpp) && !/📍 \*Por loja/.test(r.wpp));

  // ── O espaço entre lojas ──────────────────────────────────────────────────────
  check('tem uma linha em branco antes de cada loja, menos a primeira', (() => {
    for (let k = 1; k < iLojas.length; k++) {
      if (linhas[iLojas[k].i - 1].trim() !== '') return false;
    }
    return linhas[iLojas[0].i - 1].trim() !== '';   // a primeira vem logo sob o título
  })());
  check('nunca duas linhas em branco seguidas', !/\n\n\n/.test(r.wpp));

  // ── O buffet continua grudado NA SUA loja ────────────────────────────────────
  // Era esse o engano do print: a linha do rodízio parecia ser da loja de baixo.
  check('a linha de buffet vem logo abaixo da loja dela', (() => {
    const ns = linhas[iLojas[0].i + 1], bg = linhas[iLojas[1].i + 1];
    return /62 feijoadas/.test(ns) && /32 rodízios/.test(bg);
  })());
  check('e o buffet da Bangu não encosta no nome da Pedreira', (() => {
    const depoisDoBuffetBangu = linhas[iLojas[1].i + 2];
    return depoisDoBuffetBangu.trim() === '';
  })());
  check('loja sem buffet não ganha linha vazia extra no meio', (() => {
    const pedreira = iLojas[2].i;
    return linhas[pedreira + 1].trim() === '' || /^[🍽🗓⚠🔧]/.test(linhas[pedreira + 1].trim());
  })());

  // ── Nada do conteúdo se perdeu ───────────────────────────────────────────────
  check('os valores continuam lá', /104\.420,89/.test(r.wpp) && /94\.940,30/.test(r.wpp));
  check('meta, variação e por funcionário continuam', /meta 70%/.test(r.wpp)
    && /\(\+22% vs ant\.\)/.test(r.wpp) && /👥36/.test(r.wpp) && /\/func/.test(r.wpp));
  check('o semáforo de venda por funcionário continua', /🔴/.test(r.wpp));
  check('a loja sem dados continua sendo reportada', /Sem dados:.*Guarulhos/.test(r.wpp));
  check('a manutenção continua', /Manutenção:.*Bangu \(2\)/.test(r.wpp));

  // ── A versão do PDF não pode ganhar asterisco ────────────────────────────────
  check('no PDF o nome da loja sai sem asterisco', (() => {
    const l = r.pdf.split('\n').filter(x => /^📍/.test(x));
    return l.length === 3 && !r.pdf.includes('*');
  })());
  check('e o PDF também ganha o alfinete e o espaço', /📍 Norte Shopping:/.test(r.pdf)
    && /\n\n📍 Bangu:/.test(r.pdf));

  // ── Mês a mês usa o mesmo marcador ───────────────────────────────────────────
  const comMeses = await page.evaluate((d) => {
    window._relData = Object.assign({}, d, {
      mesesLabels: ['Ago 2026', 'Set 2026', 'Out 2026'],
      totaisMes: [100000, 110000, 90000],
      lojasDados: d.lojasDados.map(l => Object.assign({}, l, { porMes: [30000, 40000, 34420] })),
    });
    return _relTexto(true);
  }, DADOS);
  check('no mês a mês a loja também é 📍', /🗓 \*Mês a mês:\*\n📍 /.test(comMeses));
  check('e lá não entra linha em branco — cada loja é uma linha só',
    !/📍 Norte Shopping:.*\n\n📍 Bangu:/.test(comMeses.split('🗓')[1] || ''));

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  console.log('\n--- como fica a mensagem ---\n' + r.wpp.split('🍽')[0]);
  process.exit(falhou ? 1 : 0);
})();
