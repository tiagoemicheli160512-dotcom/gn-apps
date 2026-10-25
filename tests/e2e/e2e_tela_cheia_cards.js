// "Ao clicar no card ele abre na tela toda, e tendo a opção de voltar ao home na seta ou
//  algo assim." — só nos cards que hoje CORTAM conteúdo ("+25", "+7"), como combinado.
//
// Duas coisas são testadas aqui, e a segunda é a que mais importa no celular:
//
// 1. O card de lista abre a lista INTEIRA em tela cheia, com seta de voltar.
// 2. O VOLTAR DO CELULAR fecha essa tela em vez de sair do Painel. Antes desta mudança o
//    Painel não registrava nada no histórico: quem deslizava pra voltar — o gesto mais
//    natural que existe no celular — saía do app inteiro e perdia o lugar onde estava.
//
// E o detalhe que decide se a coisa presta: ao fechar, a rolagem do Painel tem que estar
// exatamente onde estava. Voltar pro topo de um painel longo é pior que não ter a tela.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));

  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof abrirTelaCheia === 'function'; } catch (e) { return false; } }, { timeout: 20000 });

  // ── 1. A tela cheia em si ─────────────────────────────────────────────────────────────
  const aberta = await page.evaluate(() => {
    document.body.style.minHeight = '3000px';      // Painel longo, como é de verdade
    window.scrollTo(0, 900);
    abrirTelaCheia({
      titulo: 'Fechamentos sem conferência', sub: 'Loja Bangu', cor: '#38bdf8',
      itens: Array.from({ length: 28 }, (_, i) => ({ texto: '2026-09-' + String(i + 1).padStart(2, '0'), extra: 'NOITE' })),
      acaoUrl: 'gn-caixa.html', acaoLabel: '💵 Abrir o Caixa',
    });
    const el = document.getElementById('_tela-cheia');
    return {
      existe: !!el,
      cobreATela: el ? getComputedStyle(el).position === 'fixed' : false,
      titulo: el ? (el.textContent || '').includes('Fechamentos sem conferência') : false,
      // o que o card escondia tem que estar aqui: todos os 28
      linhas: el ? (el.textContent.match(/2026-09-/g) || []).length : 0,
      temSeta: el ? !!el.querySelector('button[aria-label="Voltar"]') : false,
      temAcao: el ? !!el.querySelector('a[href="gn-caixa.html"]') : false,
      scrollDoPainel: Math.round(window.scrollY),
    };
  });
  check('o card abre em tela cheia, por cima do Painel', aberta.existe && aberta.cobreATela);
  check('com o título do card', aberta.titulo);
  check('e a lista INTEIRA, não só os 3 primeiros', aberta.linhas === 28);
  check('tem seta de voltar', aberta.temSeta);
  check('e o atalho pro app de origem', aberta.temAcao);
  check('abrir não mexe na rolagem do Painel', aberta.scrollDoPainel === 900);

  // ── 2. O voltar do celular ────────────────────────────────────────────────────────────
  const urlAntes = page.url();
  await page.goBack();
  await page.waitForTimeout(150);
  const depoisDoVoltar = await page.evaluate(() => ({
    telaAberta: !!document.getElementById('_tela-cheia'),
    scroll: Math.round(window.scrollY),
    aindaNoPainel: typeof abrirTelaCheia === 'function',
  }));
  check('o voltar do celular FECHA a tela', depoisDoVoltar.telaAberta === false);
  check('e não sai do Painel', depoisDoVoltar.aindaNoPainel && page.url() === urlAntes);
  check('a rolagem continua onde a pessoa deixou', depoisDoVoltar.scroll === 900);

  // ── 3. A seta faz o mesmo caminho (e desfaz o histórico) ──────────────────────────────
  await page.evaluate(() => {
    abrirTelaCheia({ titulo: 'Teste da seta', itens: [{ texto: 'linha' }] });
  });
  await page.click('#_tela-cheia button[aria-label="Voltar"]');
  await page.waitForTimeout(150);
  check('a seta fecha a tela', await page.evaluate(() => !document.getElementById('_tela-cheia')));
  check('e sem deixar entrada pendurada no histórico',
    await page.evaluate(() => _telasSobrepostas.length === 0));

  // ── 4. Duas telas abertas: cada voltar fecha uma ──────────────────────────────────────
  await page.evaluate(() => {
    abrirTelaCheia({ titulo: 'Primeira', itens: [{ texto: 'a' }] });
    _showChipDetail('Segunda', [{ nome: 'loja X' }]);
  });
  await page.goBack(); await page.waitForTimeout(150);
  const meio = await page.evaluate(() => ({ chip: !!document.getElementById('_chip-modal'), cheia: !!document.getElementById('_tela-cheia') }));
  check('o primeiro voltar fecha só a de cima', meio.chip === false && meio.cheia === true);
  await page.goBack(); await page.waitForTimeout(150);
  check('o segundo voltar fecha a de baixo',
    await page.evaluate(() => !document.getElementById('_tela-cheia')));

  // ── 5. O card de Pendências de verdade, com mais itens do que cabe ────────────────────
  const pend = await page.evaluate(async () => {
    // Troca a camada de busca por respostas fixas — é o mesmo caminho que o card usa.
    const fixtures = {
      'pendLoja:caixa': Array.from({ length: 28 }, (_, i) => ({ id: i + 1, data: '2026-09-' + String((i % 28) + 1).padStart(2, '0'), turno: 'NOITE' })),
      'pendLoja:com': [], 'pendLoja:bh': [], 'pendLoja:lojas': [{ all_data: {} }],
      'pendLoja:chk': [], 'pendLoja:provAg': [], 'pendLoja:provHist': [],
    };
    window.gnFetchJson = async (url, h, contexto, fallback) =>
      (contexto in fixtures) ? fixtures[contexto] : fallback;
    const sess = { id: 1, nome: 'T', cargo: 'gerente', loja: LOJAS_LISTA[0] };
    await _renderPendenciasLojaHome(true, sess, false);
    const card = document.getElementById('pendencias-loja-home-card');
    const linha = [...card.querySelectorAll('[onclick^="abrirListaCard"]')][0];
    const resumo = card.textContent.replace(/\s+/g, ' ');
    if (linha) linha.click();
    const tela = document.getElementById('_tela-cheia');
    return {
      cardTemItem: /28 fechamentos de caixa sem conferência/.test(resumo),
      cardCorta: /\+25/.test(resumo),               // o card continua resumindo
      abriu: !!tela,
      naTelaCheia: tela ? (tela.textContent.match(/2026-09-/g) || []).length : 0,
    };
  });
  check('o card de Pendências mostra o item', pend.cardTemItem);
  check('e continua resumindo com "+25" (não virou lista gigante no Painel)', pend.cardCorta);
  check('tocar no item abre a tela cheia', pend.abriu);
  check('com as 28 datas, não com 3', pend.naTelaCheia === 28);

  check('nenhum erro de JS em nenhum momento', erros.length === 0);
  if (erros.length) erros.slice(0, 5).forEach(e => console.log('      ' + e.slice(0, 200)));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
