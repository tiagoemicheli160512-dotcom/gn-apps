// "Trazer as informações do banco de horas para o home painel gestão, trazendo o cenário da
//  loja só dos casos que tem banco positivo ou negativo. Fica no app check aba banco."
//
// O número que a aba Banco do Check-list mostra é o do CICLO — os 6 meses em que o banco tem
// que fechar —, e o Painel só tinha o do período escolhido no toggle (dia/semana/mês), dentro
// do raio-x de cada loja. São coisas diferentes: em 31/10/2026 a Pedreira carregava -585h no
// ciclo e o mês de Out/26 sozinho mostrava -168,5h; no Norte Shopping e na Nova Iguaçu o mês
// mostrava ZERO, porque o saldo todo está nos meses anteriores do ciclo.
//
// Esta suíte cobra as regras que não podem divergir da aba Banco, porque é dela que o número
// sai: os meses do ciclo (conferidos contra o PRÓPRIO _bhMesesDoCiclo do Check-list), o
// legado que só soma no primeiro ciclo, o lançamento de férias que não conta, o nome antigo
// que pertence a quem foi renomeado, e o saldo zerado que não vira linha.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const CHK  = process.env.ARQ_CHK  || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra ? ' >> ' + extra : '')); c ? ok++ : falhou++; };

const HOJE = '2026-10-31';

// Os meses de cada âncora, conferidos nos DOIS apps. Divergir aqui muda o saldo da loja
// inteira sem nenhum erro aparecer na tela.
const CICLOS = [
  ['2026-03-26', '2026-09-25', ['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09'], 'ciclo no dia 26: Abr..Set'],
  ['2026-09-26', '2027-03-25', ['2026-10','2026-11','2026-12','2027-01','2027-02','2027-03'], 'virada de ano: Out..Mar'],
  ['2026-06-26', '2026-12-25', ['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'], 'ciclo da Pedreira: Jul..Dez'],
  ['2026-01-01', '2026-06-30', ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'], 'ciclo no dia 1: o mês da coluna é o próprio'],
];

// ── O cenário de cada loja ───────────────────────────────────────────────────────────────
// Tudo em horas inteiras e salário 2200 (= R$ 10,00 por hora) pra a conta ser conferível de
// cabeça: hora negativa sai pelo valor cheio, positiva com o adicional de 50%.
const CFG = {
  // Segundo ciclo (Out/26 → Mar/27). O lançamento de Ago/26 é do ciclo ANTERIOR.
  'Bangu':        { periodo_inicio: '2026-03-26', salariosSetor: { 'Salão': 2200, 'Cozinha': 2200 } },
  // Primeiro ciclo (Jul..Dez/26) — e é só nele que o legado de Mai/26 soma.
  'Pedreira':     { periodo_inicio: '2026-06-26', salariosSetor: { 'Salão': 2200 } },
  // Segundo ciclo: lançamento de Mar/26 é anterior ao 1º mês do 1º ciclo, mas o legado
  // pertence àquele ciclo, não a este.
  'Caxias':       { periodo_inicio: '2026-03-26', salariosSetor: { 'Salão': 2200 } },
  // Primeiro ciclo (Out/26 → Mar/27) com Set/26 de legado — o caso da Nova Iguaçu.
  'Rancho':       { periodo_inicio: '2026-09-26', salariosSetor: { 'Caixa': 2200 } },
  'Boulevard':    { periodo_inicio: '2026-03-26', salariosSetor: { 'Salão': 2200 } },
  // Maglia tem ciclo e lançamento e MESMO ASSIM não entra: a regra do CLAUDE.md é que ela só
  // entra quando o pedido cita o nome, e este não citou.
  'Maglia':       { periodo_inicio: '2026-03-26', salariosSetor: { 'Salão': 2200 } },
  // 'Nova América' de propósito SEM linha CONFIG: sem âncora não há ciclo pra somar.
};

const MESES = {
  'Bangu': {
    '2026-08': [{ nome: 'Ana Paula', horas: 20 }],
    '2026-10': [
      { nome: 'Ana Paula',   horas: -12 },
      { nome: 'Joana Reis',  horas: -9 },
      { nome: 'Bruno Dias',  horas: 3 },
      { nome: 'Carla Nunes', horas: 0 },
      { nome: 'Davi Souza',  horas: 0, semBanco: 'FERIAS' },
    ],
  },
  'Pedreira': {
    '2026-05': [{ nome: 'Elias Rocha', horas: -10 }],
    '2026-07': [{ nome: 'Elias Rocha', horas: -8 }],
  },
  'Caxias':   { '2026-03': [{ nome: 'Fabio Lima', horas: -30 }] },
  'Rancho':   {
    '2026-09': [{ nome: 'Carol', horas: 9 }],
    '2026-10': [{ nome: 'Carol Marinho', horas: 4 }],
  },
  'Boulevard':    { '2026-10': [{ nome: 'Iris Melo', horas: 2 }] },
  'Nova América': { '2026-10': [{ nome: 'Gisele Alves', horas: -40 }] },
  'Maglia':       { '2026-10': [{ nome: 'Heitor Paz', horas: -99 }] },
};

// O setor vem da escala, e é ele que acha o salário. 'Estoque' da Joana não tem salário
// cadastrado de propósito: o saldo dela sai em horas e a tela diz por quê.
//
// A escala vem por SEMANA, e a Ana Paula só está na semana 28 — ela saiu no meio do ciclo e
// não aparece na 30, que é a última que a loja preencheu. É o caso que obriga a varrer todas
// as semanas: olhando só a última, 44 das 129 pessoas com saldo na rede perdiam o setor
// (medido), e sem setor não há salário nem R$.
const ESCALA = {
  BANGU: {
    '28': [
      { nome: 'Ana Paula',   setor: 'Salão' },
      { nome: 'Joana Reis',  setor: 'Estoque' },
      { nome: 'Bruno Dias',  setor: 'Cozinha' },
    ],
    '30': [
      { nome: 'Joana Reis',  setor: 'Estoque' },
      { nome: 'Bruno Dias',  setor: 'Cozinha' },
      { nome: 'Carla Nunes', setor: 'Salão' },
      { nome: 'Davi Souza',  setor: 'Salão' },
    ],
  },
  PEDREIRA: { '30': [{ nome: 'Elias Rocha', setor: 'Salão' }] },
  CAXIAS:   { '30': [{ nome: 'Fabio Lima', setor: 'Salão' }] },
  // A loja renomeou o cadastro: o lançamento de Set está no nome antigo.
  RANCHO:   { '30': [{ nome: 'Carol Marinho', setor: 'Caixa', _nomesAnteriores: ['Carol'] }] },
  BOULEVARD: { '30': [{ nome: 'Iris Melo', setor: 'Salão' }] },
  MAGLIA:    { '30': [{ nome: 'Heitor Paz', setor: 'Salão' }] },
  NOVA_AMERICA: { '30': [{ nome: 'Gisele Alves', setor: 'Salão' }] },
};

const LOJAS = ['BANGU', 'CAXIAS', 'PEDREIRA', 'RANCHO', 'BOULEVARD', 'NOVA AMERICA', 'MAGLIA'];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, HOJE + 'T12:00:00');

  // ── Os meses do ciclo, nos dois apps ───────────────────────────────────────────────────
  for (const [arquivo, fn, rotulo] of [[CHK, '_bhMesesDoCiclo', 'Check-list'], [HOME, '_gnBhMesesDoCiclo', 'Painel']]) {
    const p = await ctx.newPage();
    await p.goto('file://' + arquivo);
    // Espera por algo que existe nas DUAS versões do arquivo: esperar pela função nova faria
    // a contraprova estourar o tempo sem medir número nenhum.
    try {
      await CAMINHOS.esperarApp(p, [], [rotulo === 'Check-list' ? '_bhCicloVigente' : '_gnBhCicloVigente']);
    } catch (e) { console.log(`FALHOU: ${rotulo} — o app não carregou`); falhou++; await p.close(); continue; }
    const res = await p.evaluate(({ ciclos, fn }) => ciclos.map(c => {
      try { return typeof window[fn] === 'function' ? window[fn](c[0], c[1]) : 'AUSENTE'; }
      catch (e) { return 'ERRO'; }
    }), { ciclos: CICLOS, fn }).catch(() => null);
    if (!res) { console.log(`FALHOU: ${rotulo} — não deu pra avaliar`); falhou++; await p.close(); continue; }
    CICLOS.forEach((c, i) => check(`${rotulo}: ${c[3]}`, JSON.stringify(res[i]) === JSON.stringify(c[2])));
    await p.close();
  }

  // ── O cenário de verdade, pelo caminho real ────────────────────────────────────────────
  const page = await ctx.newPage();
  await ctx.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('gn_banco_horas')) {
      const corpo = [];
      Object.keys(CFG).forEach(loja => corpo.push({ loja, mes: 'CONFIG', registros: CFG[loja] }));
      Object.keys(MESES).forEach(loja => Object.keys(MESES[loja]).forEach(mes =>
        corpo.push({ loja, mes, registros: MESES[loja][mes] })));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('file://' + HOME);
  try {
    await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', '_dashComissoesAll'], ['_gnBhCicloVigente']);
  } catch (e) { console.log('FALHOU: o Painel não carregou'); falhou++; await browser.close(); process.exit(1); }

  const carregou = await page.evaluate(async ({ escala, lojas }) => {
    try {
      LOJAS_LISTA = lojas;
      _dashComissoesAll = Object.keys(escala).map(k => {
        const all = {};
        Object.keys(escala[k]).forEach(sem => { all[sem] = { funcs: escala[k][sem] }; });
        return { loja: k, all_data: all };
      });
      // A tela inteira não é o que esta suíte mede, e renderDashboard() depende de sessão.
      window.renderDashboard = () => {};
      if (typeof _loadBancoGerencia !== 'function') return { ausente: true };
      await _loadBancoGerencia();
      return { ok: true };
    } catch (e) { return { erro: String(e && e.message) }; }
  }, { escala: ESCALA, lojas: LOJAS });

  if (!carregou || !carregou.ok) {
    console.log('FALHOU: a aba Banco do Painel não existe ou não carregou — ' + JSON.stringify(carregou));
    falhou++;
    await browser.close();
    console.log(`\n${ok} OK, ${falhou} falhou`);
    process.exit(1);
  }

  const d = await page.evaluate(() => {
    const limpa = c => ({
      ciclo: c.ciclo, meses: c.meses, legado: c.legado, fora: c.mesesForaDoCiclo,
      pos: c.pos, neg: c.neg, valorPos: c.valorPos, valorNeg: c.valorNeg,
      acima: c.acima, semSalario: c.semSalario, dias: c.diasPraFechar,
      pessoas: c.pessoas.map(p => ({ nome: p.nome, setor: p.setor, horas: p.horas, valor: p.valor, semValor: p.semValor })),
    });
    const o = {};
    _bancoGerData.lojas.forEach(k => { o[k] = limpa(_bancoGerData.porLoja[k]); });
    return { lojas: _bancoGerData.lojas, porLoja: o };
  });

  const B = d.porLoja['BANGU'], P = d.porLoja['PEDREIRA'], C = d.porLoja['CAXIAS'],
        R = d.porLoja['RANCHO'], BV = d.porLoja['BOULEVARD'], NA = d.porLoja['NOVA AMERICA'];

  // ── 1. Maglia fora ─────────────────────────────────────────────────────────────────────
  check('Maglia fica fora da aba (o pedido não citou o nome dela)', !d.lojas.includes('MAGLIA') && !d.porLoja['MAGLIA']);

  // ── 2. O ciclo de cada loja, que é diferente em cada uma ───────────────────────────────
  check('Bangu: ciclo vigente é o SEGUNDO (26/09/26 → 25/03/27)',
    B && B.ciclo && B.ciclo.inicio === '2026-09-26' && B.ciclo.fim === '2027-03-25');
  check('Pedreira: ciclo vigente é o PRIMEIRO (26/06/26 → 25/12/26)',
    P && P.ciclo && P.ciclo.inicio === '2026-06-26' && P.ciclo.fim === '2026-12-25');
  check('Pedreira: faltam 55 dias pro ciclo fechar', P && P.dias === 55);
  check('Bangu: faltam 145 dias', B && B.dias === 145);

  // ── 3. Bangu: a soma é do ciclo, não do mês ────────────────────────────────────────────
  check('Bangu: 3 pessoas com saldo', B && B.pessoas.length === 3);
  check('Bangu: -21h a compensar (as 20h de Ago são do ciclo anterior e não entram)', B && B.neg === 21);
  check('Bangu: +3h a pagar', B && B.pos === 3);
  check('Bangu: Ago/26 é apontado como mês de outro ciclo', B && JSON.stringify(B.fora) === JSON.stringify(['2026-08']));
  check('Bangu: R$ 120,00 de hora negativa (12h × R$ 10,00, só a Ana tem salário)', B && Math.abs(B.valorNeg - 120) < 0.005);
  const ana = B && B.pessoas.find(p => p.nome === 'Ana Paula');
  check('Ana saiu no meio do ciclo e ainda assim tem setor e R$ — a varredura pega as semanas antigas',
    !!ana && ana.setor === 'Salão' && Math.abs(ana.valor - 120) < 0.005 && ana.semValor === false);
  check('Bangu: R$ 45,00 de hora positiva (3h × R$ 10,00 + 50%)', B && Math.abs(B.valorPos - 45) < 0.005);
  check('Bangu: os casos mais graves primeiro (Ana -12h, Joana -9h, Bruno +3h)',
    B && B.pessoas.map(p => p.nome).join('|') === 'Ana Paula|Joana Reis|Bruno Dias');
  check('Bangu: 2 pessoas acima de ±8h', B && B.acima === 2);

  // ── 4. O que NÃO é caso ────────────────────────────────────────────────────────────────
  const nomesB = B ? B.pessoas.map(p => p.nome) : [];
  check('saldo zerado não vira linha (Carla, que lançou 0h, fica fora)', !nomesB.includes('Carla Nunes'));
  check('férias/afastamento não vira linha (Davi, marcado semBanco)', !nomesB.includes('Davi Souza'));

  // ── 5. Sem salário do setor: horas sim, R$ não ─────────────────────────────────────────
  const joana = B && B.pessoas.find(p => p.nome === 'Joana Reis');
  check('Joana: -9h com R$ 0,00 e a marca de sem salário (o setor Estoque não tem salário)',
    !!joana && joana.horas === -9 && joana.valor === 0 && joana.semValor === true);
  check('Bangu: a loja diz que 1 pessoa está sem salário do setor', B && B.semSalario === 1);

  // ── 6. Legado: soma no primeiro ciclo, e só nele ───────────────────────────────────────
  check('Pedreira: -18h — o legado de Mai/26 soma no primeiro ciclo (-10h) junto com Jul (-8h)',
    P && P.neg === 18 && P.pessoas.length === 1);
  check('Pedreira: Mai/26 aparece como legado', P && JSON.stringify(P.legado) === JSON.stringify(['2026-05']));
  check('Caxias: no SEGUNDO ciclo o legado não existe — Mar/26 não soma', C && C.pessoas.length === 0 && C.neg === 0);
  check('Caxias: Mar/26 é apontado como mês de outro ciclo', C && JSON.stringify(C.fora) === JSON.stringify(['2026-03']));

  // ── 7. Nome antigo é da mesma pessoa ──────────────────────────────────────────────────
  check('Nova Iguaçu: uma linha só, +13h — o lançamento em "Carol" é de quem hoje é "Carol Marinho"',
    R && R.pessoas.length === 1 && R.pessoas[0].horas === 13);
  check('Nova Iguaçu: a linha sai com o nome de hoje', R && R.pessoas[0].nome === 'Carol Marinho');
  check('Nova Iguaçu: R$ 195,00 (13h × R$ 10,00 + 50%)', R && Math.abs(R.valorPos - 195) < 0.005);
  check('Nova Iguaçu: Set/26 é legado do primeiro ciclo', R && JSON.stringify(R.legado) === JSON.stringify(['2026-09']));

  // ── 8. Loja sem o 1º ciclo cadastrado ─────────────────────────────────────────────────
  check('Nova América: sem âncora não há ciclo', NA && NA.ciclo === null && NA.pessoas.length === 0);
  check('Nova América: o mês lançado é apontado como fora de qualquer ciclo',
    NA && JSON.stringify(NA.fora) === JSON.stringify(['2026-10']));

  // ── 9. A tela ─────────────────────────────────────────────────────────────────────────
  const html = await page.evaluate(() => { try { return _buildBancoPanel(); } catch (e) { return 'ERRO: ' + e.message; } });
  const txt = String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  check('a tela soma a rede: -39h a compensar', /-39h/.test(txt));
  check('a tela soma a rede: +18h a pagar', /\+18h/.test(txt));
  check('a tela soma a rede: R$ 300,00 já pagos em hora negativa', /R\$ 300,00/.test(txt));
  check('a tela soma a rede: R$ 270,00 em hora positiva com +50%', /R\$ 270,00/.test(txt));
  check('a tela soma a rede: R$ 570,00 em jogo', /R\$ 570,00/.test(txt));
  check('a tela diz 6 pessoas com saldo e 4 acima de ±8h', /6 pessoas/.test(txt) && /4 acima de ±8h/.test(txt));
  check('as -99h da Maglia não entram em nada', !/99h/.test(txt) && !txt.includes('Heitor'));

  // Molde das abas Carnes e Trios: um cartão por loja, em ordem alfabética, inclusive as
  // que não têm nada — quem some da lista não pode ser conferido.
  // Os títulos dos cartões, na ordem em que saem — não o texto inteiro, que tem o nome das
  // lojas também nos avisos lá em cima.
  const titulos = String(html).match(/font-weight:(?:800|700);color:var\(--t[12]\);flex:1">([^<]+)</g)
    .map(x => x.replace(/.*">/, '').replace(/<$/, ''));
  check('um cartão por loja, em ordem alfabética (Maglia de fora)',
    titulos.join('|') === 'Bangu|Boulevard|Caxias|Nova América|Nova Iguaçu|Pedreira', titulos.join('|'));

  // ── 13. Navegar pro ciclo ANTERIOR ────────────────────────────────────────────────────
  // É o que a aba Banco do Check-list já permite loja a loja: consultar o ciclo que fechou.
  // Um passo pra trás cai em datas diferentes em cada loja, porque cada uma tem a sua âncora.
  const ant = await page.evaluate(() => {
    try {
      _bancoGerNav(-1);
      const o = {};
      _bancoGerData.lojas.forEach(k => {
        const c = _bancoGerData.porLoja[k];
        o[k] = { ciclo: c.ciclo, neg: c.neg, pos: c.pos, legado: c.legado,
                 fora: c.mesesForaDoCiclo, antes: c.anteriorAoPrimeiro,
                 pessoas: c.pessoas.map(p => p.nome) };
      });
      return { off: _bancoGerData.off, porLoja: o, html: _buildBancoPanel() };
    } catch (e) { return { erro: String(e && e.message) }; }
  });
  const aTxt = ant.html ? String(ant.html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') : '';
  check('o ‹ volta um ciclo e o cabeçalho diz isso', ant.off === -1 && /CICLO ANTERIOR/.test(aTxt));
  check('Bangu no ciclo anterior: 26/03/26 → 25/09/26, e agora são as 20h de Ago que contam',
    ant.porLoja && ant.porLoja['BANGU'].ciclo.inicio === '2026-03-26' &&
    ant.porLoja['BANGU'].ciclo.fim === '2026-09-25' && ant.porLoja['BANGU'].pos === 20);
  check('e Out/26, que era o saldo do ciclo vigente, passa a ser mês de outro ciclo',
    ant.porLoja && JSON.stringify(ant.porLoja['BANGU'].fora) === JSON.stringify(['2026-10']));
  check('Caxias no ciclo anterior: as -30h de Mar/26 aparecem — é ali que o legado mora',
    ant.porLoja && ant.porLoja['CAXIAS'].neg === 30 &&
    JSON.stringify(ant.porLoja['CAXIAS'].legado) === JSON.stringify(['2026-03']));
  check('Pedreira e Nova Iguaçu dizem que o ciclo ainda não existia, em vez de fechar zeradas',
    ant.porLoja && ant.porLoja['PEDREIRA'].antes === true && ant.porLoja['RANCHO'].antes === true &&
    /ciclo ainda não existia/i.test(aTxt));
  check('o cartão de um ciclo encerrado diz quando ele fechou, não quantos dias faltam',
    /fechou em 25\/09\/26/.test(aTxt) && !/fecha em/.test(aTxt));
  // Ciclo que já fechou tem prazo NEGATIVO, e "negativo é menor que 45": sem a trava, o
  // aviso vermelho de prazo apareceria em cima de todo ciclo encerrado que se consultasse.
  check('e ciclo encerrado não ganha aviso de prazo', !/fecham? o ciclo em menos de/.test(aTxt));
  const volta = await page.evaluate(() => { _bancoGerNav(1); return { off: _bancoGerData.off, neg: _bancoGerData.porLoja['BANGU'].neg }; });
  check('o › volta pro ciclo vigente', volta.off === 0 && volta.neg === 21);
  // O ciclo vigente é o fim da linha: não há o que consultar adiante dele, e um passo a
  // mais cairia numa janela de 6 meses que ainda não começou.
  const alem = await page.evaluate(() => {
    _bancoGerNav(1);
    return { off: _bancoGerData.off, html: _buildBancoPanel() };
  });
  check('o › não passa do ciclo vigente', alem.off === 0 && /CICLO VIGENTE/.test(String(alem.html)));
  check('e o botão vem desabilitado quando não há pra onde avançar',
    /_bancoGerNav\(1\)[^>]*disabled/.test(String(alem.html)));
  check('o cabeçalho de navegação diz qual ciclo está em vista', /CICLO VIGENTE/.test(txt));

  check('Bangu: mostra os casos acima de ±8h', txt.includes('Ana Paula') && txt.includes('Joana Reis'));
  check('Bangu: o saldo pequeno fica recolhido por padrão', !txt.includes('Bruno Dias'));
  check('e há o botão pra abrir o que sobrou', /Ver as outras 1 com saldo menor/.test(txt));
  check('Joana aparece com a marca de sem salário do setor', /sem salário do setor/.test(txt));

  const htmlAberto = await page.evaluate(() => {
    try { _bancoGerToggle('BANGU'); return _buildBancoPanel(); } catch (e) { return 'ERRO: ' + e.message; }
  });
  check('depois de abrir, o saldo pequeno aparece', String(htmlAberto).includes('Bruno Dias'));

  check('Boulevard: ninguém acima de ±8h, mas a pessoa com saldo aparece do mesmo jeito',
    txt.includes('Iris Melo') && BV && BV.pessoas.length === 1 && BV.acima === 0);
  check('Caxias tem cartão próprio, com o selo de sem saldo e o motivo escrito',
    txt.includes('Caxias') && /sem saldo/i.test(txt) && /Ninguém com saldo positivo ou negativo neste ciclo/.test(txt));
  check('Nova América entra no bloco de quem está sem o 1º ciclo cadastrado',
    /sem o 1º ciclo cadastrado/i.test(txt) && txt.includes('Nova América') && /Out\/26/.test(txt));

  // ── 10. O prazo do ciclo ──────────────────────────────────────────────────────────────
  check('a 55 dias do fechamento ainda não há aviso de prazo', !/fecham? o ciclo em menos de/.test(txt));
  check('mas o cartão da Pedreira já mostra o prazo', /fecha em 55 dias/.test(txt));
  const htmlPerto = await page.evaluate(() => {
    try {
      // Mesmos dados, 20 dias depois: a Pedreira passa a fechar em 35 dias.
      const hoje = '2026-11-20';
      _bancoGerData.porLoja['PEDREIRA'].diasPraFechar =
        Math.round((new Date('2026-12-25T12:00:00') - new Date(hoje + 'T12:00:00')) / 864e5);
      return _buildBancoPanel();
    } catch (e) { return 'ERRO: ' + e.message; }
  });
  check('a 35 dias o aviso sobe pro topo, com a loja e o número',
    /1 loja fecha o ciclo em menos de 45 dias/.test(String(htmlPerto)) &&
    /Pedreira .*35 dias/.test(String(htmlPerto).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')));

  // ── 11. O relatório ───────────────────────────────────────────────────────────────────
  const rel = await page.evaluate(() => {
    try {
      return { wpp: _bancoRelatorioTexto(true), pdf: _bancoRelatorioTexto(false) };
    } catch (e) { return { erro: String(e && e.message) }; }
  });
  check('o relatório existe e traz o total da rede',
    rel && rel.pdf && /-39h/.test(rel.pdf.msg) && /R\$ 570,00/.test(rel.pdf.msg));
  check('o PDF leva a lista inteira', rel && rel.pdf && rel.pdf.msg.includes('Bruno Dias'));
  check('o WhatsApp leva só quem passou de ±8h, e diz quantos ficaram de fora',
    rel && rel.wpp && !rel.wpp.msg.includes('Bruno Dias') && /e mais 1 com saldo até ±8h/.test(rel.wpp.msg));
  check('o relatório aponta quem está sem o 1º ciclo cadastrado',
    rel && rel.pdf && /Sem o 1º ciclo cadastrado.*Nova América/.test(rel.pdf.msg));

  // ── 12. O raio-x da loja e a aba não são o mesmo número, e a tela diz qual é qual ──────
  // É a diferença que motivou a aba: o raio-x soma o PERÍODO escolhido no toggle, e a
  // Pedreira não lançou nada em Out/26 — o saldo dela está em Mai e Jul, dentro do ciclo.
  // Olhando só o raio-x em Out, a loja parece limpa; são -18h.
  const rx = await page.evaluate(async ({ cfg, meses }) => {
    try {
      _dashBhCfg = { 'Pedreira': cfg };
      _dashBhMesesRows = Object.keys(meses).map(mes => ({ loja: 'Pedreira', mes, registros: meses[mes] }));
      _dashPer = 'mes'; _dashMoff = 0;
      await _raioxAbrir('PEDREIRA');
      const el = document.getElementById('_raiox-modal');
      return el ? el.innerText.replace(/\s+/g, ' ') : 'SEM MODAL';
    } catch (e) { return 'ERRO: ' + String(e && e.message); }
  }, { cfg: CFG['Pedreira'], meses: MESES['Pedreira'] });

  check('o raio-x do mês de Out/26 não acha saldo nenhum na Pedreira — o dela está nos meses anteriores do ciclo',
    /Nenhum saldo lançado no período/.test(rx));
  check('e o raio-x diz onde está o acumulado do ciclo', /aba ⏱ Banco do Painel/.test(rx));
  check('enquanto a aba Banco mostra as -18h do ciclo da Pedreira', /-18h/.test(txt));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
