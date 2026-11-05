// "Se tiver no cadastro do app Check-list, aba Dados em funcionários, selecionado férias
//  nos usuários que têm acesso ao app, não permitir o acesso durante todo o período de
//  férias. A mesma coisa quando tiver folga. Única exceção a princípio é a Renata de
//  Caxias, gerente — ela pode usar nas folgas e férias."
//
// O risco desta funcionalidade não é deixar alguém entrar: é TRANCAR quem deveria entrar.
// Por isso metade das checagens aqui é sobre o que NÃO pode bloquear.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const APP = process.env.ARQ_APP || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// 02/10/2026 é uma SEXTA. No calendário compartilhado é a semana de índice 38, dia 4
// (Seg=0 … Dom=6). Confirmado contra gn-comissoes-calendario.js.
const HOJE = '2026-10-02', SEM = 38, DIA_SEX = 4;

const func = (nome, dias, extra) => Object.assign(
  { id: 0, nome, setor: 'Salão', ferias_ini: '', ferias_fim: '', dias }, extra || {});
const P = 'PRESENTE';
const SEMANA = {
  funcs: [
    func('Renata ALVES - gerente',  [P, 'FOLGA', P, P, 'FOLGA', P, P]),       // folga na sexta
    func('Marcos ALVES - gerente',[P, P, P, P, P, P, P]),                    // trabalhando
    func('Jandy ALVES - estoque',    [P, P, P, P, P, P, P],
         { ferias_ini: '2026-09-28', ferias_fim: '2026-10-20' }),               // férias pela aba Dados
    func('Kelven ALVES- garçom',     [P, P, P, P, 'FÉRIAS', P, P]),             // férias pela escala
    func('Mara ALVES- cozinha',   [P, P, P, P, 'AFASTAMENTO', P, P]),        // não foi pedido
    func('Luana ALVES- caixa',      [P, P, P, P, 'FOLGA', P, P], { arquivado: true }), // desligada
    func('Patrícia ALVES - cozinha',[P, P, P, P, 'FOLGA', P, P]),
    func('Patrícia LIMA - salão',    [P, P, P, P, P, P, P]),                    // duas Patrícias
  ]
};

const sessao = (over) => Object.assign(
  { id: 99, nome: 'Fulano', loja: 'CAXIAS', cargo: 'gerente', permissoes: {}, ts: Date.now() }, over || {});

async function abrir(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  const pedidos = [];
  await ctx.route('**/rest/v1/**', r => {
    const url = r.request().url();
    pedidos.push(url);
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_comissoes/.test(url)) {
      if (opts.semRede) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      if (opts.lojaVazia) return json([]);
      return json([{ [String(SEM)]: SEMANA }]);
    }
    if (/rpc\/verificar_login/.test(url)) return json(opts.loginRows || []);
    return json([]);
  });
  const page = await ctx.newPage();
  await page.goto('file://' + APP);
  await page.waitForFunction(() => !!window.gnEscalaAcesso, { timeout: 25000 });
  return { ctx, page, pedidos };
}

const verificar = (page, sess) => page.evaluate(
  ([s, hoje]) => gnEscalaAcesso.verificar(s, { hoje, semCache: true }),
  [sess, HOJE]);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const a = await abrir(browser);

  // ── 1. A semana e o dia saem certos ───────────────────────────────────────────────
  const cal = await a.page.evaluate(h => ({
    sem: gnEscalaAcesso._semIdx(new Date(h + 'T12:00:00')),
    dia: gnEscalaAcesso._diaIdx(new Date(h + 'T12:00:00')),
  }), HOJE);
  check('02/10/2026 cai na semana 38, sexta (dia 4) — mesma conta do Check-list',
    cal.sem === SEM && cal.dia === DIA_SEX);

  // ── 2. Bloqueia o que foi pedido ──────────────────────────────────────────────────
  const folga = await verificar(a.page, sessao({ permissoes: { escala_nome: 'Renata ALVES - gerente' } }));
  check('quem está de FOLGA hoje não entra', folga.bloqueado === true && folga.motivo === 'folga');

  const feriasCad = await verificar(a.page, sessao({ permissoes: { escala_nome: 'Jandy ALVES - estoque' } }));
  check('quem tem período de férias na aba Dados não entra',
    feriasCad.bloqueado === true && feriasCad.motivo === 'ferias' && feriasCad.origem === 'cadastro');
  check('e a tela sabe dizer até quando', feriasCad.ate === '2026-10-20');

  const feriasEsc = await verificar(a.page, sessao({ permissoes: { escala_nome: 'Kelven ALVES- garçom' } }));
  check('quem está marcado FÉRIAS na escala também não entra',
    feriasEsc.bloqueado === true && feriasEsc.motivo === 'ferias' && feriasEsc.origem === 'escala');

  // ── 3. O que NÃO pode bloquear ────────────────────────────────────────────────────
  const trab = await verificar(a.page, sessao({ permissoes: { escala_nome: 'Marcos ALVES - gerente' } }));
  check('quem está trabalhando entra normalmente', trab.bloqueado === false);

  const semVinculo = await verificar(a.page, sessao({ nome: 'Renata' }));
  check('sem vínculo salvo, ninguém é bloqueado (é o estado de hoje de todos)',
    semVinculo.bloqueado === false);

  const geral = await verificar(a.page, sessao({ loja: 'GERAL', cargo: 'supervisor',
    permissoes: { escala_nome: 'Renata ALVES - gerente' } }));
  check('quem é GERAL (supervisor, mestre, RH, compras) nunca entra nessa conta',
    geral.bloqueado === false);

  const afast = await verificar(a.page, sessao({ permissoes: { escala_nome: 'Mara ALVES- cozinha' } }));
  check('AFASTAMENTO na escala não bloqueia — o pedido foi férias e folga', afast.bloqueado === false);

  const arquivada = await verificar(a.page, sessao({ permissoes: { escala_nome: 'Luana ALVES- caixa' } }));
  check('funcionário arquivado (desligado) não serve de base pra bloquear', arquivada.bloqueado === false);

  const renata = await verificar(a.page, sessao({ id: 1, nome: 'Renata',
    permissoes: { escala_nome: 'Renata ALVES - gerente' } }));
  check('a Renata de Caxias passa mesmo de folga — a exceção combinada', renata.bloqueado === false);

  const outraRenata = await verificar(a.page, sessao({ id: 25, nome: 'Renata Soares', loja: 'NOVA AMERICA',
    permissoes: { escala_nome: 'Renata ALVES - gerente' } }));
  check('a exceção é por ID: a Renata de Nova América NÃO herda a liberação',
    outraRenata.bloqueado === true);

  // ── 4. Falha aberto ───────────────────────────────────────────────────────────────
  const semEscala = await abrir(browser, { lojaVazia: true });
  const vazio = await verificar(semEscala.page, sessao({ permissoes: { escala_nome: 'Renata ALVES - gerente' } }));
  check('loja sem escala cadastrada libera (nunca tranca por falta de dado)', vazio.bloqueado === false);
  await semEscala.ctx.close();

  const caiu = await abrir(browser, { semRede: true });
  const offline = await verificar(caiu.page, sessao({ permissoes: { escala_nome: 'Renata ALVES - gerente' } }));
  check('banco fora do ar libera (um blip de rede não tranca a loja)', offline.bloqueado === false);
  await caiu.ctx.close();

  // ── 5. Só puxa a semana necessária ────────────────────────────────────────────────
  const urlEscala = a.pedidos.filter(u => /gn_comissoes/.test(u)).pop();
  check('a busca pede a semana por chave, não o histórico inteiro da loja',
    !!urlEscala && /all_data-%3E%2238%22/.test(urlEscala) && !/select=all_data&/.test(urlEscala));

  // ── 6. A sugestão de vínculo não chuta ────────────────────────────────────────────
  const sug = await a.page.evaluate(() => {
    const lista = [
      { nome: 'Renata ALVES - gerente' }, { nome: 'Marcos ALVES - gerente' },
      { nome: 'Patrícia ALVES - cozinha' }, { nome: 'Patrícia LIMA - salão' },
    ];
    return {
      renata: gnEscalaAcesso.sugerirVinculo(lista, 'Renata'),
      marquinhos: gnEscalaAcesso.sugerirVinculo(lista, 'Marquinhos'),
      patricia: gnEscalaAcesso.sugerirVinculo(lista, 'Patrícia'),
      semAcento: gnEscalaAcesso.sugerirVinculo(lista, 'Patricia'),
    };
  });
  check('sugere quando o primeiro nome bate sozinho', sug.renata === 'Renata ALVES - gerente');
  check('não sugere nada pro apelido (Marquinhos ≠ Marcos) — fica pro humano', sug.marquinhos === null);
  check('com duas Patrícias na loja não chuta nenhuma', sug.patricia === null && sug.semAcento === null);

  // ── 7. A tela de bloqueio ─────────────────────────────────────────────────────────
  const tela = await a.page.evaluate(() => {
    gnEscalaAcesso.mostrar({ id: 9, nome: 'Fulano', loja: 'CAXIAS' }, { bloqueado: true, motivo: 'folga' });
    const el = document.getElementById('gn-escala-bloqueio');
    return { existe: !!el, texto: el ? el.textContent : '',
             temLiberar: !!document.getElementById('gn-eb-abrir'),
             temRetry: !!document.getElementById('gn-eb-retry'),
             formEscondido: document.getElementById('gn-eb-form').style.display === 'none' };
  });
  check('a tela cobre o app e explica o motivo',
    tela.existe && /dia de folga/.test(tela.texto) && /Check-list/.test(tela.texto));
  check('traz a liberação por senha e o "já corrigiram, verificar de novo"',
    tela.temLiberar && tela.temRetry && tela.formEscondido);

  // ── 8. Liberar com senha: só supervisor e mestre ──────────────────────────────────
  await a.ctx.close();
  const comGerente = await abrir(browser, { loginRows: [{ id: 5, nome: 'Leandro', cargo: 'gerente' }] });
  const negado = await comGerente.page.evaluate(s => gnEscalaAcesso.liberar(s, 'Leandro', 'x'), sessao());
  check('senha de gerente NÃO libera (verificar_login não filtra cargo — a trava é nossa)',
    negado.ok === false && /supervisor ou mestre/i.test(negado.erro));
  await comGerente.ctx.close();

  const comSup = await abrir(browser, { loginRows: [{ id: 36, nome: 'Anderson', cargo: 'supervisor' }] });
  // liberar() grava a liberação pro dia REAL de hoje — é o dia que ela libera. Fixar
  // '2026-10-02' aqui fazia o teste passar só em 02/10: a partir do dia seguinte ele
  // comparava a liberação de hoje com um dia que já passou e acusava falha sem nada ter
  // quebrado no app. O resto do teste segue com data fixa de propósito (a escala da semana
  // 38 é o fixture); só a liberação precisa da data de verdade.
  const lib = await comSup.page.evaluate(async s => {
    const hojeReal = new Date().getFullYear() + '-' +
      String(new Date().getMonth() + 1).padStart(2, '0') + '-' +
      String(new Date().getDate()).padStart(2, '0');
    const r = await gnEscalaAcesso.liberar(s, 'Anderson', 'x');
    const depois = await gnEscalaAcesso.verificar(s, { hoje: hojeReal, semCache: true });
    return { r, hojeReal, bloqueadoDepois: depois.bloqueado,
             guardado: JSON.parse(localStorage.getItem('gn_escala_liberacao') || 'null') };
  }, sessao({ permissoes: { escala_nome: 'Renata ALVES - gerente' } }));
  check('senha de supervisor libera', lib.r.ok === true && lib.r.por === 'Anderson');
  check('e a pessoa entra depois disso, sem digitar senha de novo', lib.bloqueadoDepois === false);
  check('fica registrado quem liberou e em que dia',
    lib.guardado && lib.guardado.por === 'Anderson' && lib.guardado.dia === lib.hojeReal);
  // O registro no banco é disparado sem esperar (não pode atrasar a liberação de quem está
  // na porta da loja), então o teste dá um instante pra ele sair.
  await comSup.page.waitForTimeout(400);
  const gravou = comSup.pedidos.some(u => /gn_lojas/.test(u));
  check('a liberação também é gravada no banco, pra ter histórico', gravou);
  await comSup.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
