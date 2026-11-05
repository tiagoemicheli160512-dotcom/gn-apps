// "No app home lojas, um novo card com a informação das notas canceladas ou quando não
//  tiver nenhuma. Esse card tem seguir a lógica de fechei o caixa hoje ele aparece no dia
//  seguinte, para já saber se teve notas canceladas no dia anterior e conferir ou se não
//  teve."
//
// O que mais importa aqui é o estado do meio: um caixa que fechou SEM lançar cancelamento
// e SEM ninguém declarar que não houve não é "não teve" — é "não se sabe". Pintar os dois
// de verde faria o card mentir justamente pra quem abriu ele pra conferir.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => {
  console.log((c ? 'OK: ' : 'FALHOU: ') + n);
  if (!c && extra) console.log('      ' + extra);
  c ? ok++ : falhou++;
};

const ID = n => '0000000' + n + '-0000-4000-8000-000000000000';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));

  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _renderCancelamentosOntemHome === 'function' && Array.isArray(LOJAS_LISTA); }
        catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  // Monta o card com um cenário e devolve o HTML + as URLs que o card consultou.
  const montar = (fechs, cancels, opts) => page.evaluate(async ({ fechs, cancels, opts }) => {
    const urls = [];
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url) => {
      urls.push(url);
      if (/gn_caixa_fechamento/.test(url)) return fechs;
      if (/gn_caixa_cancelamento/.test(url)) return cancels;
      return [];
    };
    window.masterLoja = opts.masterLoja || '';
    try {
      await _renderCancelamentosOntemHome(
        opts.mostrar !== false,
        { loja: opts.loja || 'BANGU', cargo: opts.cargo || 'gerente' },
        !!opts.isMaster);
    } finally { window.gnFetchJson = orig; }
    const el = document.getElementById('cancel-ontem-home-card');
    return { html: el ? el.innerHTML : null, urls };
  }, { fechs, cancels, opts: opts || {} });

  const ontem = await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  });
  const dm = ontem.slice(8,10) + '/' + ontem.slice(5,7);

  const FECHADO = (n, turno, por) => ({ id: ID(n), turno, status: 'FECHADO', sem_cancelamento_por: por || null, sem_cancelamento_em: por ? '2026-10-15T23:10:00Z' : null });
  const ABERTO  = (n, turno) => ({ id: ID(n), turno, status: 'ABERTO', sem_cancelamento_por: null, sem_cancelamento_em: null });

  // ── 1. Teve cancelamento ────────────────────────────────────────────────────
  const teve = await montar(
    [FECHADO(1, 'NOITE')],
    [{ fechamento_id: ID(1), valor: 120.50, motivo: 'Cliente desistiu do pedido', autorizado_por: 'Marcos' },
     { fechamento_id: ID(1), valor: 45.98,  motivo: 'Erro de lançamento na comanda', autorizado_por: 'Ana' }]);
  check('o card aparece quando teve cancelamento', !!teve.html && teve.html.trim().length > 0);
  check('diz quantas foram', /2 notas canceladas ontem/.test(teve.html));
  check('e soma o valor certo (120,50 + 45,98)', /R\$ 166,48/.test(teve.html), teve.html.slice(0, 400));
  check('lista o motivo de cada uma',
    /Cliente desistiu do pedido/.test(teve.html) && /Erro de lançamento na comanda/.test(teve.html));
  check('e quem autorizou, que é o ponto de conferir',
    /autorizado por Marcos/.test(teve.html) && /autorizado por Ana/.test(teve.html));
  check('com o valor de cada uma separado',
    /R\$ 120,50/.test(teve.html) && /R\$ 45,98/.test(teve.html));
  check('marca que é de ontem, com a data', new RegExp('Ontem ' + dm.replace('/', '\\/')).test(teve.html));

  // ── 2. Não teve, e alguém assinou ───────────────────────────────────────────
  const naoTeve = await montar([FECHADO(2, 'NOITE', 'Rafael')], []);
  check('sem cancelamento declarado, o card diz que não teve', /Nenhuma nota cancelada ontem/.test(naoTeve.html));
  check('e mostra quem assinou — é uma afirmação com nome em cima', /Declarado por <b[^>]*>Rafael</.test(naoTeve.html));
  check('em verde, não em laranja', /var\(--txt-green\)/.test(naoTeve.html) && !/#E8580A/.test(naoTeve.html));

  // ── 3. O estado que não pode virar verde ────────────────────────────────────
  const semInfo = await montar([FECHADO(3, 'NOITE')], []);
  check('caixa fechado sem lançar e sem declarar NÃO vira "nenhuma nota cancelada"',
    !/Nenhuma nota cancelada/.test(semInfo.html), semInfo.html);
  check('ele diz que não há informação', /Sem informação de cancelamento ontem/.test(semInfo.html));
  check('e explica o que faltou', /sem lançar cancelamento e sem ninguém declarar/.test(semInfo.html));
  check('em cinza, nem verde nem laranja',
    /var\(--t4\)/.test(semInfo.html) && !/var\(--txt-green\)/.test(semInfo.html));

  // ── 4. Dois turnos, só um declarou ──────────────────────────────────────────
  const meio = await montar([FECHADO(4, 'DIA', 'Rafael'), FECHADO(5, 'NOITE')], []);
  check('com um turno declarado e outro não, não dá verde', !/Nenhuma nota cancelada/.test(meio.html));
  check('e diz qual turno ficou sem', /NOITE/.test(meio.html) && /sem lançar nem declarar/.test(meio.html));
  check('sem esconder que o outro declarou', /Rafael/.test(meio.html) && /DIA/.test(meio.html));

  // ── 5. Turno de ontem ainda aberto ──────────────────────────────────────────
  const aberto = await montar([FECHADO(6, 'DIA', 'Rafael'), ABERTO(7, 'NOITE')], []);
  check('turno aberto de ontem é avisado, em vez de somir calado',
    /ainda[\s\S]*não foi fechado/.test(aberto.html) && /pode ter cancelamento ainda não lançado/.test(aberto.html));
  // Com meio dia em aberto, o card não pode cravar em verde que o DIA não teve cancelamento.
  check('com um turno ainda aberto, o card não afirma nada sobre o dia inteiro',
    !/Nenhuma nota cancelada ontem/.test(aberto.html)
    && /Nenhuma nota cancelada no turno DIA/.test(aberto.html), aberto.html);
  check('e sai em âmbar, não em verde',
    /var\(--txt-amber\)/.test(aberto.html) && !/var\(--txt-green\)/.test(aberto.html));

  // ── 6. Cancelamento lançado em turno ainda aberto conta ─────────────────────
  const abertoComCancel = await montar(
    [ABERTO(8, 'NOITE')],
    [{ fechamento_id: ID(8), valor: 8.99, motivo: 'Comanda duplicada', autorizado_por: 'Paulo' }]);
  check('cancelamento lançado em turno aberto aparece do mesmo jeito',
    /1 nota cancelada ontem/.test(abertoComCancel.html) && /Comanda duplicada/.test(abertoComCancel.html));
  check('e o aviso do turno aberto vem junto', /não foi fechado/.test(abertoComCancel.html));

  // ── 7. Quando não há card ───────────────────────────────────────────────────
  const semFech = await montar([], []);
  check('sem nenhum registro de ontem o card não aparece', semFech.html === '');
  const maglia = await montar([FECHADO(9, 'NOITE')], [], { loja: 'MAGLIA' });
  check('na Maglia o card não aparece (ela não usa o controle)', maglia.html === '', maglia.html);
  const cozinha = await montar([FECHADO(10, 'NOITE')], [], { cargo: 'cozinheiro' });
  check('cargo fora da plateia do card não vê', cozinha.html === '');
  const escondido = await montar([FECHADO(11, 'NOITE')], [], { mostrar: false });
  check('e com os cards desligados também não', escondido.html === '');

  // ── 8. A consulta é a de ONTEM ──────────────────────────────────────────────
  const urlFech = teve.urls.find(u => /gn_caixa_fechamento/.test(u)) || '';
  check('consulta o fechamento da data de ontem', urlFech.includes('data=eq.' + ontem), urlFech);
  check('e não filtra por status — turno aberto também precisa ser visto',
    !/status=eq/.test(urlFech), urlFech);
  check('traz a declaração de "dia sem cancelamento" junto',
    /sem_cancelamento_por/.test(urlFech), urlFech);
  const urlCancel = teve.urls.find(u => /gn_caixa_cancelamento/.test(u)) || '';
  check('e busca os cancelamentos pendurados nos fechamentos de ontem',
    urlCancel.includes('fechamento_id=in.(' + ID(1) + ')'), urlCancel);

  // ── 9. Texto do banco não pode virar HTML ───────────────────────────────────
  const xss = await montar(
    [FECHADO(12, 'NOITE')],
    [{ fechamento_id: ID(12), valor: 10, motivo: '<img src=x onerror=alert(1)>', autorizado_por: '<b>fulano</b>' }]);
  check('motivo e autorizador vêm escapados, não interpretados',
    !/<img src=x/.test(xss.html) && !/<b>fulano<\/b>/.test(xss.html)
    && /&lt;img src=x/.test(xss.html));

  // ── 10. Cor por token, pra funcionar no tema escuro ─────────────────────────
  const todos = [teve.html, naoTeve.html, semInfo.html, meio.html].join('');
  check('nenhuma cor de texto fixa escura (quebraria no tema escuro)',
    !/color:\s*#(1A1D23|1a1d23|555|333|000)/.test(todos));
  check('o fundo e o texto saem dos tokens do tema',
    /var\(--s2\)/.test(teve.html) && /var\(--t1\)/.test(teve.html));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
