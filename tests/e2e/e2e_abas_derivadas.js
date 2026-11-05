// "No app Lojas não tá aparecendo a aba no Hortifruti."
//
// Hortifruti saiu do ciclo semanal e virou aba própria em setembro. As listas de abas dos
// usuários são anteriores a isso: os 11 estoquistas — um por loja, justamente quem faz o
// pedido — têm ["pedido","entrega"] salvo. Resultado: o item sumiu da aba Pedido (o
// catálogo do Pedido exclui HORTIFRUTI) e a aba nova nunca apareceu pra eles. Nenhum dos 73
// usuários ativos tem 'hortifruti' na lista.
//
// É o mesmo buraco que a aba Notas já tinha tapado pra si: quem tem a aba de origem ganha a
// derivada, sem depender de alguém reeditar 55 cadastros um a um.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// O cadastro real dos 11 estoquistas.
const ABAS_ESTOQUISTA = ['pedido', 'entrega'];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try {
      await page.waitForFunction(() => {
        try { return typeof render === 'function' && typeof carregarPermissaoAbas === 'function' && LOJAS_TABS_CONFIG; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: o app Lojas não carregou'); await browser.close(); process.exit(1); } }
  }

  const temFix = await page.evaluate(() => typeof _abasComDerivadas === 'function');
  if (!temFix) console.log('· contraprova: arquivo sem _abasComDerivadas — rodando o comportamento antigo');

  // Entra como o estoquista da loja e desenha a tela.
  const entrar = (abas) => page.evaluate(([abas]) => {
    localStorage.setItem('gn_session_v1', JSON.stringify({
      nome: 'Jonas', cargo: 'estoquista', loja: 'ITAQUERA', ts: Date.now(),
      permissoes: { lojas_abas: abas },
    }));
    usuarioAtual = { nome: 'Jonas', cargo: 'estoquista', loja: 'ITAQUERA' };
    loja = 'ITAQUERA';
    tab = 'pedido';
    carregarPermissaoAbas();
    render();
    const visivel = id => {
      const el = document.getElementById(id);
      return !!el && el.style.display !== 'none';
    };
    return {
      permitidas: (abasPermitidas || []).slice(),
      navHortifruti: visivel('nav-hortifruti'),
      navNotas: visivel('nav-notas'),
      navPedido: visivel('nav-pedido'),
      navEstoque: visivel('nav-estoque'),
    };
  }, [abas]);

  // ── 1. O caso do relato ──────────────────────────────────────────────────────────
  const est = await entrar(ABAS_ESTOQUISTA);
  check('o estoquista passa a enxergar a aba Hortifruti', est.navHortifruti === true);
  check('e ela entra na lista de abas permitidas', est.permitidas.includes('hortifruti'));
  check('sem perder o que já tinha', est.navPedido === true && est.navNotas === true);
  check('e sem ganhar o que não é dele', est.navEstoque === false && !est.permitidas.includes('estoque'));

  // ── 2. goTab tem que deixar entrar de verdade, não só mostrar o botão ────────────
  const entrou = await page.evaluate(() => { goTab('hortifruti'); return tab; });
  check('e consegue abrir a aba (goTab não barra mais)', entrou === 'hortifruti');

  // ── 3. Quem não faz pedido não ganha hortifruti ──────────────────────────────────
  const semPedido = await entrar(['estoque', 'contagem']);
  check('quem não tem Pedido não ganha Hortifruti',
    semPedido.navHortifruti === false && !semPedido.permitidas.includes('hortifruti'));
  check('nem Notas sem Entrega', semPedido.navNotas === false);

  // ── 4. A derivação não pode duplicar nem mexer no original ──────────────────────
  const pureza = await page.evaluate(() => {
    if (typeof _abasComDerivadas !== 'function') return null;
    const orig = ['pedido', 'entrega', 'hortifruti'];
    const copia = orig.slice();
    const r = _abasComDerivadas(orig);
    return {
      semDuplicar: r.filter(x => x === 'hortifruti').length === 1,
      naoMutou: JSON.stringify(orig) === JSON.stringify(copia),
      semLista: _abasComDerivadas(null),
      indefinido: _abasComDerivadas(undefined),
    };
  });
  check('não duplica a aba de quem já a tinha', !pureza || pureza.semDuplicar === true);
  check('não altera a lista salva do usuário', !pureza || pureza.naoMutou === true);
  check('sem lista de abas, segue sem lista (todas liberadas)',
    !pureza || (pureza.semLista === null && pureza.indefinido === undefined));

  // ── 5. O cadastro tem que mostrar a caixinha marcada ────────────────────────────
  // Senão quem administra olha a tela, vê Hortifruti desmarcado e conclui, errado, que
  // falta permissão — foi o motivo de a mesma correção existir pra Notas.
  const modal = await page.evaluate(([abas]) => {
    const box = document.createElement('div');
    box.id = '__abas_teste';
    LOJAS_TABS_CONFIG.forEach(t => {
      const i = document.createElement('input');
      i.type = 'checkbox'; i.id = 'aba-lojas-' + t.id;
      box.appendChild(i);
    });
    document.body.appendChild(box);
    _aplicarAbasModal(abas);
    const lido = id => (document.getElementById('aba-lojas-' + id) || {}).checked;
    const r = { hortifruti: lido('hortifruti'), notas: lido('notas'), pedido: lido('pedido'), estoque: lido('estoque') };
    box.remove();
    return r;
  }, [ABAS_ESTOQUISTA]);
  check('no cadastro, Hortifruti aparece marcado pro estoquista', modal.hortifruti === true);
  check('Notas segue marcado, como já era', modal.notas === true);
  check('e o que ele não tem continua desmarcado', modal.estoque === false && modal.pedido === true);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
