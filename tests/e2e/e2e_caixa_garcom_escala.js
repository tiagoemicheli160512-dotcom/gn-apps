// "Pode fazer pra todas. E em vez de outro colocar extra e pedir o nome." (08/11/2026)
//
// O campo Garçom da nota sem 10% era texto livre, e a mesma pessoa entrava com grafias
// diferentes — Nova América, out/2026: "ISMAEL" em 01–03/10 e "ESMAEL" depois. Nome
// digitado não liga a nota a ninguém, e foi por isso que um garçom fora da escala passou
// quatro semanas sem a loja perceber. Agora o Caixa oferece a lista da escala da semana
// (cadastro do Check-list/Gorjetas), e quem não está nela entra como "Extra" com o nome.
//
// Esta suíte cobra:
//   1. a lista vem da escala da semana do caixa, em ordem, Salão separado dos outros;
//   2. semana que ninguém abriu ainda (só repique, sem funcs) usa a anterior;
//   3. sem escolher, não lança; escolhido, grava o nome da escala;
//   4. Extra pede o nome e grava "NOME (EXTRA)"; sem nome, não lança;
//   5. sem escala (rede caiu, semana vazia) e na Maglia, volta o campo de texto;
//   6. o campo Garçom não estoura 320 px com nome comprido.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const f = (nome, setor) => ({ nome, setor, tipo: 'CLT / MENSALISTA', dias: Array(7).fill('PRESENTE') });
// Sábado 07/11/2026 = índice 43.
const SEM43 = [f('ESMAEL DA SILVA ATHAIDE', 'Salão'), f('ANA PAULA  ', 'Salão'), f('BRUNO COZINHEIRO DE NOME BEM COMPRIDO MESMO', 'Cozinha'),
  { nome: '', setor: '', dias: [] }, f('ana paula', 'Salão')];
const SEM42 = [f('CARLOS ANTERIOR', 'Salão')];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 320, height: 800 } });
  let modo = 'normal';
  const posts = [], gets = [];
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url());
    if (/gn_comissoes\?/.test(u)) {
      gets.push(u);
      if (modo === 'falha') return r.fulfill({ status: 500, body: 'x' });
      if (modo === 'semFuncs') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ cur: null, ant: SEM42 }]) });
      if (modo === 'vazio') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ cur: [], ant: [] }]) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ cur: SEM43, ant: SEM42 }]) });
    }
    if (/gn_caixa_gorjeta/.test(u) && r.request().method() === 'POST') {
      const b = r.request().postDataJSON(); posts.push(b);
      return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: 'n' + posts.length, ...b }]) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  await page.goto('file://' + ARQ);
  try { await page.waitForFunction(() => { try { return typeof addNota10 === 'function' && typeof _carregarGarconsEscala === 'function' && typeof S !== 'undefined'; } catch (e) { return false; } }, { timeout: 25000 }); }
  catch (e) { console.log('FALHOU: o app Caixa não carregou'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }

  const abrir = (loja, data) => page.evaluate(async ({ loja, data }) => {
    S.user = { nome: 'Tiago', cargo: 'gerente' }; S.loja = loja; S.modoConsulta = false;
    S.fech = { id: 'f-' + loja + data, loja, data, turno: 'NOITE', status: 'ABERTO' };
    S.notas10 = []; S._garconsChave = ''; S.garcons = null;
    document.getElementById('dezGarcomBox').innerHTML = '<label>Garçom</label><input id="dezGarcom" type="text" placeholder="Nome">';
    await _carregarGarconsEscala();
    const sel = document.getElementById('dezGarcomSel');
    return { sel: !!sel, opcoes: sel ? [...sel.options].map(o => o.textContent.trim()) : [],
      grupos: sel ? [...sel.querySelectorAll('optgroup')].map(g => g.label) : [],
      texto: !!document.getElementById('dezGarcom') && (!sel) };
  }, { loja, data });
  const lancar = (valor, escolha, extraNome) => page.evaluate(async ({ valor, escolha, extraNome }) => {
    // A tela de fechamento não está montada no teste: renderTudo/toast não importam aqui.
    window._toasts = []; toast = m => window._toasts.push(m); renderTudo = () => {};
    document.getElementById('dezVal').value = valor;
    const sel = document.getElementById('dezGarcomSel');
    if (sel && escolha != null) { sel.value = escolha; _garcomMudou(); }
    if (extraNome != null) document.getElementById('dezGarcom').value = extraNome;
    await addNota10();
    return window._toasts;
  }, { valor, escolha, extraNome });

  let r = await abrir('NOVA AMERICA', '2026-11-07');
  check('busca só as semanas 43 e 42 da loja certa, não o all_data inteiro',
    gets.some(u => /loja=eq\.NOVA_AMERICA/.test(u) && /all_data->"43"->funcs/.test(u) && /all_data->"42"->funcs/.test(u)), gets.join('\n'));
  check('o campo vira lista quando a escala tem gente', r.sel, JSON.stringify(r));
  check('Salão primeiro, outros setores separados', r.grupos.join('|') === 'Salão|Outros setores', JSON.stringify(r.grupos));
  check('nomes da escala em ordem, sem vaga vazia nem nome repetido (ANA PAULA / ana paula)',
    JSON.stringify(r.opcoes) === JSON.stringify(['Escolha…', 'ANA PAULA', 'ESMAEL DA SILVA ATHAIDE', 'BRUNO COZINHEIRO DE NOME BEM COMPRIDO MESMO', 'Extra (fora da escala)']),
    JSON.stringify(r.opcoes));
  const larg = await page.evaluate(() => document.documentElement.scrollWidth);
  check('nome comprido não estoura a tela de 320 px', larg <= 320, larg);

  let t = await lancar('50,00', '', null);
  check('sem escolher o garçom, a nota não é lançada', posts.length === 0 && t.includes('Escolha o garçom'), JSON.stringify(t));
  t = await lancar('50,00', 'ESMAEL DA SILVA ATHAIDE', null);
  check('escolhido da lista, grava o nome da escala', posts.length === 1 && posts[0].garcom === 'ESMAEL DA SILVA ATHAIDE' && posts[0].valor === 50, JSON.stringify(posts));
  check('e o campo volta pro "Escolha…" depois de lançar', await page.$eval('#dezGarcomSel', s => s.value === ''));

  // A aba do caixa não está aberta no teste (elemento invisível): escolhe como o onchange faria.
  await page.evaluate(() => { document.getElementById('dezGarcomSel').value = '__EXTRA__'; _garcomMudou(); });
  check('Extra mostra o campo pra digitar o nome', await page.$eval('#dezGarcom', i => i.style.display !== 'none'));
  t = await lancar('30,00', '__EXTRA__', '  ');
  check('Extra sem nome não lança', posts.length === 1 && t.includes('Digite o nome do extra'), JSON.stringify(t));
  t = await lancar('30,00', '__EXTRA__', 'joão  silva');
  check('Extra grava o nome digitado com a marca (EXTRA)', posts.length === 2 && posts[1].garcom === 'JOÃO SILVA (EXTRA)', JSON.stringify(posts[1]));
  check('o campo do extra some de novo depois de lançar', await page.$eval('#dezGarcom', i => i.style.display === 'none' && i.value === ''));

  modo = 'semFuncs';
  r = await abrir('NOVA AMERICA', '2026-11-09');
  check('semana que ninguém abriu (só repique) usa a escala da semana anterior',
    r.sel && r.opcoes.includes('CARLOS ANTERIOR'), JSON.stringify(r.opcoes));

  modo = 'falha';
  r = await abrir('NOVA AMERICA', '2026-11-07');
  check('se a escala não carrega, volta o campo de texto (nota não deixa de ser lançada)', r.texto && !r.sel, JSON.stringify(r));
  await lancar('20,00', null, 'Fulano');
  check('…e lança com o nome digitado, como antes', posts.length === 3 && posts[2].garcom === 'Fulano', JSON.stringify(posts[2]));

  modo = 'vazio';
  r = await abrir('NOVA AMERICA', '2026-11-07');
  check('escala sem ninguém também volta o campo de texto', r.texto && !r.sel, JSON.stringify(r));

  modo = 'normal';
  const antes = gets.length;
  r = await abrir('MAGLIA', '2026-11-07');
  check('Maglia continua com o campo de texto (não foi citada no pedido)', r.texto && !r.sel && gets.length === antes, JSON.stringify(r));
  for (const loja of ['BANGU', 'CAXIAS', 'SÃO GONÇALO', 'NORTE SHOPPING', 'BOULEVARD', 'RANCHO', 'PEDREIRA', 'CAMPO GRANDE', 'ITAQUERA', 'GUARULHOS']) {
    r = await abrir(loja, '2026-11-07');
    check(`${loja}: lista da escala`, r.sel, JSON.stringify(r));
  }
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
