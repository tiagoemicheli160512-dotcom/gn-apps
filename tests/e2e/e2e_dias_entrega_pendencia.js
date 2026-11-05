// "Tem como gerar essa tela no app Estoque e Pedido para o Matheus selecionar quando ele
//  abrir na próxima vez, explicando o motivo pra ele selecionar? Pois ele sabe exatamente
//  a data."
//
// A data de entrega da provisão é CALCULADA a partir dos dias do fornecedor (ver
// confirmarPedido). Fornecedor sem dia e sem prazo gera a provisão com data_entrega NULL,
// e aí ela não entra em nenhuma busca por intervalo de datas.
//
// MEDIDO: 532 das 13.198 provisões vivas (4,0%) estão sem data — 237 de 506 em SP (46,8%)
// contra 295 de 11.363 no Rio (2,6%). São 7 fornecedores ativos sem dia e sem prazo:
// WASAN (113 provisões sem data), DMIC (109), PMG (83), PETICO (39), NOGMIX - JBS (15),
// QUENTE (2) e NOGMIX (1).
//
// O conserto da Prov.ant fez o número voltar a aparecer; esta tela conserta a ORIGEM. E
// ela PERGUNTA em vez de preencher: quem sabe o dia de cada fornecedor é o comprador, e
// inventar uma data de entrega seria pior que não ter nenhuma.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Os quatro estados de cadastro que decidem se o fornecedor entra na lista.
const FORNECEDORES = [
  { id: 'f-wasan',  nome: 'WASAN',    dias_entrega: [],              prazo_dias_min: null, ativo: true  },
  { id: 'f-pmg',    nome: 'PMG',      dias_entrega: null,            prazo_dias_min: null, ativo: true  },
  { id: 'f-casa',   nome: 'CASA',     dias_entrega: ['SEG','QUA'],   prazo_dias_min: null, ativo: true  },
  { id: 'f-prazo',  nome: 'POR PRAZO',dias_entrega: [],              prazo_dias_min: 3,    ativo: true  },
  { id: 'f-morto',  nome: 'DESATIVADO', dias_entrega: [],            prazo_dias_min: null, ativo: false },
];
// Quantas provisões sem data cada um tem — é o que diz qual pesa mais.
const PROVISOES = [
  ...Array.from({ length: 113 }, (_, i) => ({ id: 'w' + i, fornecedor: 'WASAN', data_entrega: null, status: 'AGUARDANDO' })),
  ...Array.from({ length: 83  }, (_, i) => ({ id: 'p' + i, fornecedor: 'PMG',   data_entrega: null, status: 'AGUARDANDO' })),
  { id: 'x1', fornecedor: 'WASAN', data_entrega: '2026-10-22', status: 'AGUARDANDO' },  // tem data
  { id: 'x2', fornecedor: 'PMG',   data_entrega: null,         status: 'CANCELADO' },   // cancelada
];

function responder(url) {
  const u = new URL(url);
  const tabela = u.pathname.split('/').pop();
  let linhas = (tabela === 'gn_provisoes' ? PROVISOES
             : tabela === 'gn_fornecedores_pedido' ? FORNECEDORES : []).slice();
  u.searchParams.forEach((valor, campo) => {
    if (['select','order','limit','offset'].includes(campo)) return;
    const m = String(valor).match(/^(eq|neq|in|gte|lte|is)\.(.*)$/s);
    if (!m) return;
    const [, op, resto] = m;
    if (op === 'eq')  linhas = linhas.filter(l => String(l[campo]) === resto);
    if (op === 'neq') linhas = linhas.filter(l => String(l[campo]) !== resto);
    if (op === 'is')  linhas = linhas.filter(l => (resto === 'null') === (l[campo] == null));
    if (op === 'in') {
      const lista = resto.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''));
      linhas = linhas.filter(l => lista.includes(String(l[campo])));
    }
  });
  return linhas;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const patches = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    if (req.method() === 'PATCH') {
      try { patches.push({ url: req.url(), corpo: JSON.parse(req.postData() || '{}') }); } catch (e) {}
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    let corpo = '[]';
    try { corpo = JSON.stringify(responder(req.url())); } catch (e) {}
    return r.fulfill({ status: 200, contentType: 'application/json', body: corpo });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + ARQ);
  await CAMINHOS.esperarApp(page, ['S', 'DIAS_SEMANA'],
    ['_abrirPendenciaDiasEntrega', '_fornecedoresSemDiaEntrega', '_alternarDiaEntrega',
     'toggleDia', 'renderFornecedores'], 30000);

  const abrir = (forcado) => page.evaluate(async ({ FORNECEDORES, forcado }) => {
    S.fornecedores = JSON.parse(JSON.stringify(FORNECEDORES));
    S._diasPendLista = null; S._diasPendSemData = null;
    try { sessionStorage.removeItem('gn_pedidos_dias_entrega_adiado'); } catch (e) {}
    $('modal-bg').classList.remove('ativo');
    await _abrirPendenciaDiasEntrega(forcado);
    const box = $('modal-box');
    return {
      aberto: $('modal-bg').classList.contains('ativo'),
      txt: box.textContent.replace(/\s+/g, ' ').trim(),
      nomes: [...box.querySelectorAll('div')].map(d => d.firstElementChild)
        .filter(x => x && x.tagName === 'SPAN').map(x => x.textContent.trim()),
      botoesPorForn: [...box.querySelectorAll('.dias-grid')].map(g =>
        [...g.querySelectorAll('.dia-btn')].map(b => b.textContent.trim())),
    };
  }, { FORNECEDORES, forcado });

  const r = await abrir(false);

  // ══ 1. QUEM ENTRA NA LISTA ══════════════════════════════════════════════════════
  check('a tela abre sozinha quando falta dia de entrega', r.aberto === true, r.txt.slice(0, 120));
  check('lista o fornecedor com os dias vazios', r.nomes.includes('WASAN'), JSON.stringify(r.nomes));
  check('e o que tem os dias nulos, não só vazios',
    r.nomes.includes('PMG'), JSON.stringify(r.nomes));
  check('quem já tem dia não entra', !r.nomes.includes('CASA'), JSON.stringify(r.nomes));
  // Prazo em dias tem prioridade sobre o dia da semana no cálculo da data (ver
  // confirmarPedido): a provisão dele já nasce com data, então cobrar dia seria falso.
  check('quem tem prazo em dias também não entra, porque a data dele já sai',
    !r.nomes.includes('POR PRAZO'), JSON.stringify(r.nomes));
  check('fornecedor desativado não entra', !r.nomes.includes('DESATIVADO'), JSON.stringify(r.nomes));
  check('são exatamente os dois pendentes', r.nomes.length === 2, JSON.stringify(r.nomes));

  // ══ 2. A TELA EXPLICA O MOTIVO ══════════════════════════════════════════════════
  // Era o pedido: "explicando o motivo pra ele selecionar".
  check('diz o que acontece sem o dia: a provisão nasce sem data',
    /sem data/.test(r.txt) && /Prov\.ant/.test(r.txt), r.txt.slice(0, 400));
  check('e diz por que é ele quem preenche, em vez de o app chutar',
    /Matheus/.test(r.txt) && /em vez de chutar/.test(r.txt), r.txt.slice(0, 500));
  check('mostra quantas provisões de cada um estão sem data',
    /113 provisões sem data/.test(r.txt) && /83 provisões sem data/.test(r.txt), r.txt.slice(0, 500));
  check('e o mais pesado vem primeiro', r.nomes[0] === 'WASAN', JSON.stringify(r.nomes));
  check('oferece os sete dias da semana pra cada fornecedor',
    r.botoesPorForn.length === 2 && r.botoesPorForn.every(b =>
      JSON.stringify(b) === JSON.stringify(['DOM','SEG','TER','QUA','QUI','SEX','SAB'])),
    JSON.stringify(r.botoesPorForn));

  // ══ 3. TOCAR NUM DIA SALVA ══════════════════════════════════════════════════════
  const salvou = await page.evaluate(async () => {
    await _pendDiaToggle('f-wasan', 'QUI');
    await _pendDiaToggle('f-wasan', 'SEG');
    const f = S.fornecedores.find(x => x.id === 'f-wasan');
    return { dias: f.dias_entrega, txt: $('modal-box').textContent.replace(/\s+/g, ' ').trim() };
  });
  check('marcar um dia grava no fornecedor',
    JSON.stringify(salvou.dias) === JSON.stringify(['SEG','QUI']),
    JSON.stringify(salvou.dias));
  // Ordem da semana, não de clique: cliquei QUI e depois SEG.
  check('e os dias ficam na ordem da semana, não na ordem em que foram tocados',
    salvou.dias[0] === 'SEG' && salvou.dias[1] === 'QUI', JSON.stringify(salvou.dias));
  check('o banco recebe a gravação',
    patches.some(p => /gn_fornecedores_pedido/.test(p.url)
      && JSON.stringify(p.corpo.dias_entrega) === JSON.stringify(['SEG','QUI'])),
    JSON.stringify(patches.map(p => p.corpo)));
  check('a linha resolvida fica marcada como pronta, sem sumir da tela',
    /WASAN/.test(salvou.txt) && /SEG, QUI/.test(salvou.txt), salvou.txt.slice(0, 400));
  check('e o contador passa a cobrar só o que falta',
    /faltam 1/.test(salvou.txt), salvou.txt.slice(0, 200));

  // ══ 4. "AGORA NÃO" VOLTA NA PRÓXIMA ABERTURA ════════════════════════════════════
  // Em localStorage, um toque distraído esconderia pra sempre. Em sessionStorage, o
  // próximo acesso pergunta de novo — que foi o pedido: "quando ele abrir na próxima vez".
  const adiou = await page.evaluate(async ({ FORNECEDORES }) => {
    S.fornecedores = JSON.parse(JSON.stringify(FORNECEDORES));
    S._diasPendLista = null;
    _pendDiasAdiar();
    const fechou = !$('modal-bg').classList.contains('ativo');
    await _abrirPendenciaDiasEntrega(false);           // mesma sessão: não insiste
    const naMesmaSessao = $('modal-bg').classList.contains('ativo');
    let guardadoEm = { sessao: false, permanente: false };
    try { guardadoEm.sessao = !!sessionStorage.getItem('gn_pedidos_dias_entrega_adiado'); } catch (e) {}
    try { guardadoEm.permanente = !!localStorage.getItem('gn_pedidos_dias_entrega_adiado'); } catch (e) {}
    await _abrirPendenciaDiasEntrega(true);            // mas o botão "Preencher" abre
    return { fechou, naMesmaSessao, guardadoEm, forcado: $('modal-bg').classList.contains('ativo') };
  }, { FORNECEDORES });
  check('"Agora não" fecha a tela', adiou.fechou === true, JSON.stringify(adiou));
  check('e não insiste na mesma sessão', adiou.naMesmaSessao === false, JSON.stringify(adiou));
  check('o adiamento vive só na sessão, pra voltar a perguntar na próxima abertura',
    adiou.guardadoEm.sessao === true && adiou.guardadoEm.permanente === false,
    JSON.stringify(adiou.guardadoEm));
  check('mas o botão Preencher reabre na hora', adiou.forcado === true, JSON.stringify(adiou));

  // ══ 5. SEM PENDÊNCIA, NÃO INCOMODA ══════════════════════════════════════════════
  const limpo = await page.evaluate(async () => {
    S.fornecedores = [{ id: 'f-ok', nome: 'CASA', dias_entrega: ['SEG'], prazo_dias_min: null, ativo: true }];
    S._diasPendLista = null;
    try { sessionStorage.removeItem('gn_pedidos_dias_entrega_adiado'); } catch (e) {}
    $('modal-bg').classList.remove('ativo');
    await _abrirPendenciaDiasEntrega(false);
    const abriu = $('modal-bg').classList.contains('ativo');
    S.tab = 'fornecedores'; renderFornecedores();
    const semFaixa = !/sem dia de entrega/.test($('content').textContent);
    return { abriu, semFaixa };
  });
  check('com todos preenchidos a tela não abre', limpo.abriu === false, JSON.stringify(limpo));
  check('e a faixa some da aba Fornecedores', limpo.semFaixa === true, JSON.stringify(limpo));

  // ══ 6. A ABA FORNECEDORES AVISA E DÁ A PORTA DE VOLTA ═══════════════════════════
  const faixa = await page.evaluate(({ FORNECEDORES }) => {
    S.fornecedores = JSON.parse(JSON.stringify(FORNECEDORES));
    S.tab = 'fornecedores'; renderFornecedores();
    const t = $('content').textContent.replace(/\s+/g, ' ').trim();
    return { txt: t, temBotao: /_abrirPendenciaDiasEntrega\(true\)/.test($('content').innerHTML) };
  }, { FORNECEDORES });
  check('a aba Fornecedores aponta quantos faltam',
    /2 fornecedores sem dia de entrega/.test(faixa.txt), faixa.txt.slice(0, 300));
  check('e tem o botão que reabre a tela', faixa.temBotao === true, '');

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
