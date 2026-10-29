// "Essa questão mesmo do início fora da segunda-feira, se dá quando tem feriado na segunda,
//  por que não fazemos a contagem só na terça. É fundamental fazer que quando seja feito na
//  terça, seja considerado o estoque inicial a contagem feita pela loja, com aviso pra
//  gerência fazer a contagem da carne direto no app check-list aba carne. Se possível já
//  direcionar pra ela ao abrir."
//
// MEDIDO no banco antes de mexer:
//   32 de 148 semanas-loja (22%) SEM contagem na segunda; em 29 delas a loja contou na
//   terça, quarta ou quinta. Não é exceção de feriado isolado, é rotina.
//   Nessas semanas o estoque de abertura fica vazio em 46,7% dos casos, contra 17,4%
//   quando houve contagem na segunda — a contagem da terça simplesmente não era lida,
//   porque a busca pedia `data_contagem === semanaIni`, a segunda exata.
//
// O QUE TORNA O CONSERTO DIFÍCIL, e é metade desta suíte: aceitar QUALQUER contagem da
// semana como abertura seria pior que não aceitar nenhuma. Uma contagem de quinta tem três
// dias de consumo dentro dela; usada como estoque inicial, ela inventa a saída da semana
// toda — e inventa em silêncio, porque o número aparece preenchido e parece certo. Por
// isso há tolerância (segunda + 2) e por isso a tela DIZ de que dia veio quando não é a
// segunda.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const SEG = '2026-10-26';   // relógio na quinta 29/10 → semana corrente 26/10–01/11
const CAT = { 207: 'cat-207', 209: 'cat-209', 392: 'cat-392', 237: 'cat-237' };
const cont = (dia, item, atual) => ({ catalogo_id: CAT[item], atual: String(atual), data_contagem: dia });

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-29T12:00:00');
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  let CONTAGENS = [], CARNES_ROW = null;
  const subiu = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url();
    if (req.method() !== 'GET') { subiu.push(req.method() + ' ' + url);
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); }
    const corpo = /gn_contagens_pedido/.test(url) ? CONTAGENS
                : /checklist_carnes/.test(url) ? (CARNES_ROW ? [CARNES_ROW] : [])
                : [];
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof _contagemDaAbertura === 'function' && typeof _avisoInicialDeOutroDia === 'function'
        && typeof _checarAberturaCarnePendente === 'function'
        && typeof _carregarCarnesAutoLojas === 'function' && Array.isArray(CARNES_DEF); } catch (e) { return false; } },
    null, { timeout: 25000 });
  await page.evaluate(() => { hideLogin(); LOJA = 'Pedreira'; state.data = '2026-10-29';
    usuarioLogado = { id:1, nome:'Tiago', cargo:'gerente', loja:'PEDREIRA' }; });

  // ══ 1. QUAL CONTAGEM VALE COMO ABERTURA ══════════════════════════════════════════
  const esc = (rows) => page.evaluate(({ rows, SEG }) =>
    _contagemDaAbertura(rows, 'cat-207', SEG), { rows, SEG });

  const soSegunda = await esc([cont('2026-10-26', 207, 100)]);
  check('a contagem da própria segunda vale', soSegunda && soSegunda.dia === '2026-10-26', JSON.stringify(soSegunda));
  check('e se identifica como sendo da segunda', soSegunda && soSegunda.naSegunda === true, JSON.stringify(soSegunda));

  // O caso do feriado: segunda sem contagem, loja contou na terça.
  const soTerca = await esc([cont('2026-10-27', 207, 100)]);
  check('sem contagem na segunda, a da terça vale como abertura',
    soTerca && soTerca.dia === '2026-10-27', JSON.stringify(soTerca));
  check('e a tela sabe que NÃO é da segunda', soTerca && soTerca.naSegunda === false, JSON.stringify(soTerca));

  const soQuarta = await esc([cont('2026-10-28', 207, 100)]);
  check('feriado emendado: a da quarta ainda vale', soQuarta && soQuarta.dia === '2026-10-28', JSON.stringify(soQuarta));

  // A metade que importa: quinta em diante NÃO é abertura. Três dias de consumo dentro.
  const soQuinta = await esc([cont('2026-10-29', 207, 100)]);
  check('a da quinta NÃO vale — já tem consumo dentro', soQuinta === null, JSON.stringify(soQuinta));

  // Recontagem no meio da semana não rouba o lugar da abertura.
  const duas = await esc([cont('2026-10-27', 207, 80), cont('2026-10-26', 207, 100)]);
  check('com as duas, a segunda manda — recontagem não vira abertura',
    duas && duas.dia === '2026-10-26' && duas.row.atual === '100', JSON.stringify(duas));

  const outroCorte = await esc([cont('2026-10-26', 209, 50)]);
  check('a contagem de outro corte não serve pra este', outroCorte === null, JSON.stringify(outroCorte));

  // ══ 2. A AUTOMAÇÃO USA ESSA CONTAGEM E REGISTRA DE ONDE VEIO ════════════════════
  const rodar = (contagens) => page.evaluate(async ({ contagens, SEG, CAT }) => {
    _carnesCatalogoIds = CAT;                       // catálogo já resolvido
    state.semanaInicio = SEG; stateWeek.semanaInicio = SEG;
    stateWeek.carnes = {}; CARNES_DEF.forEach(c => { stateWeek.carnes[c.key] = {}; });
    _carnesAutoCarregando = false;
    await _carregarCarnesAutoLojas();
    const cd = stateWeek.carnes.carne_sol || {};
    return { inicial: cd.inicial, inicialDe: cd.inicialDe, aviso: _avisoInicialDeOutroDia() };
  }, { contagens, SEG, CAT });

  CONTAGENS = [cont('2026-10-26', 207, 121.6)];
  const naSeg = await rodar(CONTAGENS);
  check('o estoque de abertura entra a partir da contagem da segunda',
    Number(naSeg.inicial) === 121.6, JSON.stringify(naSeg));
  check('e fica registrado que veio da segunda',
    naSeg.inicialDe === '2026-10-26', JSON.stringify(naSeg));
  check('sem aviso nenhum, porque é o dia esperado', naSeg.aviso === '', JSON.stringify(naSeg.aviso));

  CONTAGENS = [cont('2026-10-27', 207, 98.4)];
  const naTer = await rodar(CONTAGENS);
  check('com a segunda em branco, a contagem da terça vira o estoque de abertura',
    Number(naTer.inicial) === 98.4, JSON.stringify(naTer));
  check('e fica registrado que veio da terça',
    naTer.inicialDe === '2026-10-27', JSON.stringify(naTer));
  // Sem isto o número aparece preenchido e parece o da segunda — o erro fica invisível.
  check('a tela DIZ de que dia veio', /27\/10/.test(naTer.aviso) && /não da segunda/.test(naTer.aviso),
    naTer.aviso.slice(0, 200));

  CONTAGENS = [cont('2026-10-29', 207, 60)];
  const naQui = await rodar(CONTAGENS);
  check('contagem de quinta não entra como abertura',
    naQui.inicial === undefined || naQui.inicial === '', JSON.stringify(naQui));

  // ══ 3. A MARCA DE CONTROLE NÃO É DADO DA LOJA ═══════════════════════════════════
  // Se contasse, toda semana aberta sem nada preenchido viraria linha no banco.
  // Medido pelo EFEITO (o upsert que sai, ou não), não copiando o predicado pra dentro do
  // teste: copiado, ele passa mesmo com a exclusão desfeita no app — foi exatamente o que
  // aconteceu aqui na primeira escrita, e a mutação sobreviveu.
  const salvarCom = (carnes) => page.evaluate(async ({ carnes }) => {
    state.semanaInicio = '2026-10-26'; stateWeek.semanaInicio = '2026-10-26';
    stateWeek.carnes = {}; CARNES_DEF.forEach(c => { stateWeek.carnes[c.key] = { ...carnes }; });
    _carnesLimpos = new Set();
    try { await saveAll(); } catch (e) {}
  }, { carnes });

  subiu.length = 0;
  await salvarCom({ inicialDe: '2026-10-27', autoEntEm: '2026-10-29T12:00:00.000Z' });
  const soControle = subiu.filter(x => /checklist_carnes/.test(x));
  subiu.length = 0;
  await salvarCom({ inicialDe: '2026-10-27', autoEntEm: '2026-10-29T12:00:00.000Z', inicial: 121.6 });
  const comDado = subiu.filter(x => /checklist_carnes/.test(x));
  check('semana que só tem marcas de controle não vira linha no banco',
    soControle.length === 0, soControle.join(' | '));
  check('e a mesma semana COM estoque de abertura vira (a sonda enxerga o upsert)',
    comDado.length > 0, subiu.join(' | ').slice(0, 300));

  // ══ 4. A COBRANÇA QUE DIRECIONA PRA ABA CARNE ═══════════════════════════════════
  CARNES_ROW = null;
  const semLinha = await page.evaluate(async () => await _checarAberturaCarnePendente());
  check('semana sem estoque de abertura é cobrada',
    semLinha && semLinha.chave === 'carnes', JSON.stringify(semLinha && semLinha.titulo));
  check('e a cobrança direciona pra aba Carne',
    semLinha && semLinha.tabAlvo === 'carnes', JSON.stringify(semLinha && semLinha.tabAlvo));
  // Trava LEVE: prende na aba Carne sem o bloqueio total que o couvert tem.
  check('sem bloqueio total — é aviso que direciona, não parede',
    semLinha && semLinha.hard === false, JSON.stringify(semLinha && semLinha.hard));
  check('e a mensagem diz que a contagem da terça também vale',
    semLinha && /terça/.test(semLinha.mensagem), (semLinha || {}).mensagem);

  CARNES_ROW = { carnes: { carne_sol: { inicial: 121.6 }, carne_seca: {}, picanha: {}, camarao: {} } };
  const comAbertura = await page.evaluate(async () => await _checarAberturaCarnePendente());
  check('semana COM estoque de abertura não é cobrada', comAbertura === null, JSON.stringify(comAbertura));

  // Segunda ainda é o dia de contar — cobrar enquanto ela corre é cobrança falsa.
  CARNES_ROW = null;
  const naSegundaHoje = await page.evaluate(async () => {
    const orig = Date;
    const alvo = new Date('2026-11-02T10:00:00');       // uma segunda
    // eslint-disable-next-line no-global-assign
    Date = class extends orig { constructor(...a) { return a.length ? new orig(...a) : new orig(alvo); } };
    Date.now = () => alvo.getTime();
    try { return await _checarAberturaCarnePendente(); } finally { Date = orig; }
  });
  check('na própria segunda não há o que cobrar', naSegundaHoje === null, JSON.stringify(naSegundaHoje));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
