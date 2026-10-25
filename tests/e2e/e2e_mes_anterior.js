// "No card de veja o desempenho de setembro, colocar o comparativo de vendas de um mês para
//  o outro [...] e também a opção do relatório, se possível puxar quantos atestados, faltas,
//  suspensão e advertência teve no mês [...] e se der puxar quanto foi pago de funcionários
//  extra também."
//
// Os números do fixture são os reais da Boulevard: agosto 354.051,97 e setembro 316.337,84
// (−10,7%), com 15 lançamentos de funcionário extra somando R$ 1.500 em setembro.
//
// O card só aparece nos 3 primeiros dias do mês, então o teste fixa "hoje" em 01/10/2026 —
// senão ele passaria hoje e quebraria no dia 4.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const dia = (v) => ({ venda_salao: v, venda_delivery: 0 });

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        // _renderMesAnteriorHome existe nas DUAS versões (o card já existia, só sem
        // comparativo/ocorrências/extra) — esperar pela função nova do relatório faria a
        // contraprova estourar o tempo em vez de medir comportamento.
        try { return typeof _renderMesAnteriorHome === 'function' && typeof COMISSOES_CAL !== 'undefined'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: o card novo não existe'); falhou++; break; } }
  }

  // Descobre os índices de semana de setembro pra montar o fixture de ocorrências com as
  // mesmas chaves que o app vai ler.
  const sem = await page.evaluate(() => {
    const idx = [];
    COMISSOES_CAL.forEach((w, i) => {
      if ((w.days || []).some(d => d.y === 2026 && d.m === 9)) idx.push({ i, header: w.header, days: w.days.map(d => d.m) });
    });
    return idx;
  });
  const semSet = sem.find(s => s.days.every(m => m === 9));          // semana inteira em setembro
  const semVirada = sem.find(s => s.days.some(m => m !== 9));        // semana que cruza o mês

  let vendaSet = [], vendaAgo = [], comissoes = {}, caixa = [];
  await ctx.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const corpo = url.includes('checklist_diario')
        ? (/2026-09-01/.test(url) ? vendaSet : vendaAgo)
      : url.includes('gn_comissoes')  ? [{ all_data: comissoes }]
      : url.includes('gn_caixa_fechamento') ? caixa
      : url.includes('gn_lojas')      ? [{ all_data: {} }]
      : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });

  const abrir = async (hojeFixo) => page.evaluate(async (hojeFixo) => {
    // "Hoje" fixo pra o teste não depender da data real da máquina.
    const Real = Date;
    const FIXO = hojeFixo || '2026-10-01T12:00:00';
    window.Date = class extends Real {
      constructor(...a) { if (!a.length) super(FIXO); else super(...a); }
      static now() { return new Real(FIXO).getTime(); }
    };
    masterLoja = null;
    try {
      await _renderMesAnteriorHome(true, { loja: 'BOULEVARD' }, false);
    } finally { window.Date = Real; }
    return { html: document.getElementById('mes-anterior-home-card').innerHTML,
             dados: (typeof _mesAnteriorHomeData !== 'undefined' && _mesAnteriorHomeData) || { ocor:{}, extraValor:null, extraQtd:null } };
  }, hojeFixo);

  // ── Comparativo ──────────────────────────────────────────────────────────────────────
  vendaAgo = [dia(354051.97)];
  vendaSet = [dia(316337.84)];
  let r = await abrir();
  check('mostra os dois meses lado a lado',
    /Agosto/.test(r.html) && /354\.051,97/.test(r.html) && /Setembro/.test(r.html) && /316\.337,84/.test(r.html));
  check('diz que ficou abaixo, com o percentual',
    /Abaixo/.test(r.html) && /10,7%/.test(r.html));
  check('e mostra a diferença em reais', /37\.714,13/.test(r.html));

  vendaAgo = [dia(300000)]; vendaSet = [dia(330000)];
  r = await abrir();
  check('quando o mês sobe, diz acima e com sinal de mais',
    /Acima/.test(r.html) && /10,0%/.test(r.html) && /\+ R\$ 30\.000,00/.test(r.html));

  vendaAgo = []; vendaSet = [dia(100000)];
  r = await abrir();
  check('sem faturamento no mês de trás, avisa em vez de inventar variação',
    /não dá pra comparar/i.test(r.html) && !/Abaixo|Acima/.test(r.html));

  // ── Ocorrências ──────────────────────────────────────────────────────────────────────
  vendaAgo = [dia(300000)]; vendaSet = [dia(300000)];
  comissoes = {};
  comissoes[semSet.i] = { funcs: [
    { nome: 'A', dias: ['FALTA','ATESTADO','PRESENTE','SUSPENSÃO','PRESENTE','FALTA','PRESENTE'], docs: { ADVERTENCIA: 'x' } },
    { nome: 'B', dias: ['PRESENTE','PRESENTE','ATESTADO','PRESENTE','PRESENTE','PRESENTE','PRESENTE'] },
  ] };
  r = await abrir();
  check('conta faltas, atestados e suspensões do mês',
    r.dados.ocor.FALTA === 2 && r.dados.ocor.ATESTADO === 2 && r.dados.ocor['SUSPENSÃO'] === 1);
  check('conta a advertência, que é documento e não status do dia', r.dados.ocor.ADVERTENCIA === 1);
  check('e mostra tudo no card', /Atestados/.test(r.html) && /Advertências/.test(r.html));

  // A semana que cruza o mês só pode contar os dias que caem dentro dele
  const diasForaDoMes = semVirada.days.map((m, i) => m !== 9 ? i : -1).filter(i => i >= 0);
  const diasDentro = semVirada.days.map((m, i) => m === 9 ? i : -1).filter(i => i >= 0);
  const diasV = Array(7).fill('PRESENTE');
  diasForaDoMes.forEach(i => diasV[i] = 'FALTA');
  diasDentro.forEach(i => diasV[i] = 'FALTA');
  comissoes = {}; comissoes[semVirada.i] = { funcs: [{ nome: 'C', dias: diasV }] };
  r = await abrir();
  check(`semana que cruza o mês conta só os dias de setembro (${diasDentro.length} de 7)`,
    r.dados.ocor.FALTA === diasDentro.length);

  // ── Funcionário extra ────────────────────────────────────────────────────────────────
  comissoes = {};
  caixa = [
    { data: '2026-09-10', gn_caixa_despesa: [{ categoria: 'funcionario_extra', valor: 100 },
                                             { categoria: 'transporte', valor: 12 }] },
    { data: '2026-09-20', gn_caixa_despesa: [{ categoria: 'funcionario_extra', valor: 1400 }] },
  ];
  r = await abrir();
  check('soma só o que é funcionário extra, ignorando as outras despesas',
    r.dados.extraValor === 1500 && r.dados.extraQtd === 2);
  check('e mostra no card', /Funcionário extra/.test(r.html) && /1\.500,00/.test(r.html));

  // ── Relatório ────────────────────────────────────────────────────────────────────────
  const texto = await page.evaluate(() => {
    let capturado = null;
    const real = window.open;
    window.open = (u) => { capturado = decodeURIComponent(String(u).replace('https://wa.me/?text=', '')); return { closed: false }; };
    if (typeof _relatorioMesAnteriorWhats !== 'function') return 'SEM RELATORIO';
    _relatorioMesAnteriorWhats();
    window.open = real;
    return capturado;
  });
  check('o relatório traz a loja e o mês', /BOULEVARD/.test(texto) && /Setembro/.test(texto));
  check('traz os dois meses e a variação', /Agosto/.test(texto) && /300\.000,00/.test(texto));
  check('traz as ocorrências', /Atestados/.test(texto) && /Faltas/.test(texto) && /Suspensões/.test(texto) && /Advertências/.test(texto));
  check('e traz o funcionário extra com valor', /Funcionário extra/.test(texto) && /1\.500,00/.test(texto));

  // ── O card dura o mês inteiro ────────────────────────────────────────────────────────
  // Antes ele sumia depois do dia 3. Com comparativo, ocorrências e relatório dentro, virou
  // a consulta do mês fechado — e consulta que some no dia 4 não serve.
  vendaAgo = [dia(300000)]; vendaSet = [dia(270000)]; comissoes = {}; caixa = [];
  const noDia20 = await abrir('2026-10-20T12:00:00');
  check('o card continua aparecendo no dia 20 do mês, não só nos 3 primeiros',
    /desempenho de setembro/i.test(noDia20.html) && /Abaixo/.test(noDia20.html));
  const noDia31 = await abrir('2026-10-31T12:00:00');
  check('e no último dia do mês também', /desempenho de setembro/i.test(noDia31.html));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
