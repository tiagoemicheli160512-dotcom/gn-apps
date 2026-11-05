// "No app lojas, a aba chopp tinha sumido na senha do estoquista. Eles precisam ver a aba.
//  O caso foi no Norte Shopping, no app do Luis."
//
// Dado real do banco: os 11 estoquistas (um por loja) têm lojas_abas = ['pedido','entrega'].
// Com as derivadas isso dá 4 abas e nenhuma é 'barris'. Os outros 65 usuários têm
// lojas_abas = null (acesso total), e é por isso que só o estoquista reclamou.
//
// O que torna isso um defeito e não uma permissão a menos: _cargoContaBarris() COBRA a
// contagem semanal de barris de todo mundo lotado numa loja — inclusive do estoquista. O app
// descia a trava de tela cheia pedindo a contagem da mesma pessoa de quem escondia a aba.
//
// O teste usa a lista real salva, não uma inventada, e checa as duas pontas: a aba aparece
// pra quem é cobrado, e continua escondida o que não foi concedido (senão "corrigir" virava
// dar acesso geral ao estoquista).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS_APP = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Exatamente o que está gravado pros 11 estoquistas hoje.
const ABAS_ESTOQUISTA = ['pedido', 'entrega'];

async function abrir(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS_APP);
    try {
      await page.waitForFunction(() => {
        try { return typeof carregarPermissaoAbas === 'function' && typeof _abasComDerivadas === 'function'
                   && BARRIS_SEMANAL_CARGOS_LIVRES; } catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  return { ctx, page };
}

// Monta a sessão no localStorage como o login faz e roda o carregador de permissões.
const permissoesDe = (page, sess) => page.evaluate((sess) => {
  localStorage.setItem('gn_session_v1', JSON.stringify(Object.assign({ ts: Date.now() }, sess)));
  abasPermitidas = null;
  tab = 'home';
  carregarPermissaoAbas();
  return { abas: abasPermitidas, tab };
}, sess);

const sessao = (o) => Object.assign({
  id: 50, nome: 'Luiz', cargo: 'estoquista', loja: 'NORTE SHOPPING',
  permissoes: { lojas_abas: ABAS_ESTOQUISTA.slice() },
}, o || {});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const a = await abrir(browser);

  // ── O caso relatado ────────────────────────────────────────────────────────────
  const luiz = await permissoesDe(a.page, sessao());
  check('o estoquista do Norte Shopping passa a ver a aba Barris', luiz.abas.includes('barris'));
  check('e continua com as abas que já tinha', luiz.abas.includes('pedido') && luiz.abas.includes('entrega'));
  check('e com as derivadas de antes (notas, hortifruti)',
    luiz.abas.includes('notas') && luiz.abas.includes('hortifruti'));
  check('sem ganhar o que não foi concedido',
    !luiz.abas.includes('estoque') && !luiz.abas.includes('vendas') && !luiz.abas.includes('fichas')
    && !luiz.abas.includes('contagem') && !luiz.abas.includes('relatorio') && !luiz.abas.includes('transf'));
  check('5 abas no total, sem duplicata', luiz.abas.length === 5 && new Set(luiz.abas).size === 5);

  // ── O app cobra a contagem exatamente de quem agora vê a aba ──────────────────
  const coerencia = await a.page.evaluate((abasSalvas) => {
    const casos = [
      { cargo: 'estoquista',  loja: 'NORTE SHOPPING' },
      { cargo: 'caixa',       loja: 'BANGU' },
      { cargo: 'garcom',      loja: 'CAXIAS' },
      { cargo: 'gerente',     loja: 'PEDREIRA' },
      { cargo: 'sub_gerente', loja: 'BANGU' },
      { cargo: 'mestre',      loja: 'GERAL' },
      { cargo: 'supervisor',  loja: 'GERAL' },
      { cargo: 'compras',     loja: 'GERAL' },
      { cargo: 'estoquista',  loja: 'Maglia' },
    ];
    return casos.map(c => {
      usuarioAtual = { id: 1, nome: 'X', cargo: c.cargo, loja: c.loja };
      const cobrado = _cargoContaBarris() && c.loja !== 'Maglia';
      const concedido = _abasObrigatoriasDoCargo(c.cargo, c.loja).includes('barris');
      return { cargo: c.cargo, loja: c.loja, cobrado, concedido };
    });
  }, ABAS_ESTOQUISTA);
  const incoerentes = coerencia.filter(c => c.cobrado !== c.concedido);
  check('quem é cobrado pela contagem recebe a aba, e só ele — nos 9 casos',
    incoerentes.length === 0);
  if (incoerentes.length) incoerentes.forEach(c => console.log('      incoerente:', JSON.stringify(c)));

  // ── Quem já via tudo não muda ────────────────────────────────────────────────
  const semRestricao = await permissoesDe(a.page, sessao({ cargo: 'gerente', permissoes: { lojas_abas: null } }));
  check('quem tem lojas_abas = null continua sem restrição', semRestricao.abas === null);

  // ── Gestão central não ganha aba por este caminho ────────────────────────────
  const mestre = await permissoesDe(a.page, sessao({
    cargo: 'mestre', loja: 'GERAL', permissoes: { lojas_abas: ['pedido'] } }));
  check('mestre com lista restrita não ganha Barris de brinde', !mestre.abas.includes('barris'));

  // ── Maglia fica de fora (não foi citada — CLAUDE.md), igual à trava ─────────
  const maglia = await permissoesDe(a.page, sessao({ loja: 'Maglia' }));
  check('Maglia fica de fora, como já fica na trava de barris', !maglia.abas.includes('barris'));

  // ── A trava de barris mostra a aba, então a aba inicial não pode ser inválida ─
  check('a aba inicial continua válida', luiz.abas.includes(luiz.tab) || luiz.tab === 'home');

  // ── O aviso de barril crítico passa a alcançar o estoquista ──────────────────
  // Reestabelece a sessão do Luiz: os casos acima (Maglia, mestre) deixaram abasPermitidas
  // no estado deles, e ler o global sem isso media a sessão errada.
  await permissoesDe(a.page, sessao());
  const avisoAlcanca = await a.page.evaluate(() => {
    // Mesma condição da linha do _renderAvisoBarris: a lista precisa conter 'barris'.
    return abasPermitidas ? abasPermitidas.includes('barris') : true;
  });
  check('o aviso de barril crítico deixa de ser filtrado pra ele', avisoAlcanca === true);

  // ── O cadastro para de mostrar a caixinha desmarcada ────────────────────────
  const modal = await a.page.evaluate((abasSalvas) => {
    // O modal existe no DOM? Se não, monta só as caixinhas que _aplicarAbasModal procura.
    if (!document.getElementById('aba-lojas-barris')) {
      const d = document.createElement('div');
      d.innerHTML = LOJAS_TABS_CONFIG.map(t =>
        `<input type="checkbox" id="aba-lojas-${t.id}">`).join('');
      document.body.appendChild(d);
    }
    const ler = () => LOJAS_TABS_CONFIG
      .filter(t => document.getElementById('aba-lojas-' + t.id).checked).map(t => t.id);
    _aplicarAbasModal(abasSalvas.slice(), 'estoquista', 'NORTE SHOPPING');
    const estoquista = ler();
    _aplicarAbasModal(abasSalvas.slice(), 'mestre', 'GERAL');
    const mestreRestrito = ler();
    _aplicarAbasModal(null, 'gerente', 'PEDREIRA');
    const todos = ler();
    return { estoquista, mestreRestrito, todosQtd: todos.length, totalAbas: LOJAS_TABS_CONFIG.length };
  }, ABAS_ESTOQUISTA);
  check('no cadastro, Barris aparece marcada pro estoquista', modal.estoquista.includes('barris'));
  check('e não aparece marcada pra mestre com lista restrita', !modal.mestreRestrito.includes('barris'));
  check('e lista nula continua marcando tudo', modal.todosQtd === modal.totalAbas);

  await a.ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
