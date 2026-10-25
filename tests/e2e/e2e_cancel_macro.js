// "No home painel de gestão, abrir uma aba onde tivesse as informações das lojas, onde lá
//  mostrasse as fotos também, além do valor, quem autorizou e motivo, com a opção de gerar
//  relatórios, mesmo padrão dos cards. Lá teria uma visão macro, sem precisar abrir loja a
//  loja."
//
// Dois pontos que a aba não pode errar:
//  - o total em R$ tem que bater com o que as lojas de fato cancelaram, então nota sem
//    foto NÃO pode ser escondida: ela aparece com "sem foto" dito em letras. Esconder
//    faria a aba virar uma segunda contabilidade, menor que a real.
//  - a URL da foto vem do banco e vai pra dentro de um atributo HTML.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => {
  console.log((c ? 'OK: ' : 'FALHOU: ') + n);
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 320));
  c ? ok++ : falhou++;
};

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
        try { return typeof _buildCancelPanel === 'function' && typeof _cancelRelatorioTexto === 'function'; }
        catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const semear = (cancel, decl) => page.evaluate(({ cancel, decl }) => {
    _dashCancelPer = cancel;
    _dashDeclPer = decl || {};
    _dashPer = 'sem'; _dashWoff = 0;
    return { painel: _buildCancelPanel(), wpp: _cancelRelatorioTexto(true).msg,
             pdf: _cancelRelatorioTexto(false).msg, dados: _cancelMacroDados() };
  }, { cancel, decl });

  // Bangu com duas notas (uma com foto, outra não) e Caxias com uma.
  const r = await semear({
    BANGU: [
      { data: '2026-10-15', valor: 120.50, motivo: 'Cliente desistiu', autor: 'Marcos', foto: 'https://sb/f1.jpg' },
      { data: '2026-10-14', valor: 45.98,  motivo: 'Erro de comanda',  autor: 'Ana',    foto: null },
    ],
    CAXIAS: [
      { data: '2026-10-15', valor: 300,    motivo: 'Mesa trocada',     autor: 'Rita',   foto: 'https://sb/f2.jpg' },
    ],
  }, {
    // Guarulhos respondeu os 5 caixas; Pedreira só 3 dos 5; Itaquera fechou 2 e não
    // respondeu nenhum; Boulevard não fechou caixa nenhum no período.
    GUARULHOS: { caixas: 5, declarados: 5, abertos: 0, responsaveis: ['Rafael'],
      datasOk: ['13','14','15','16','17'].map(d => ({ data: '2026-10-' + d, turno: 'NOITE' })), datasFalta: [] },
    // Pedreira: 13 e 14 ok; 15 tem os dois turnos e só o da NOITE ficou sem resposta;
    // 16 inteiro sem resposta. É o caso que separa "faltou o dia" de "faltou um turno".
    PEDREIRA:  { caixas: 5, declarados: 3, abertos: 0, responsaveis: ['Bia', 'Caio'],
      datasOk: [{ data: '2026-10-13', turno: 'NOITE', por: 'Bia' }, { data: '2026-10-14', turno: 'NOITE', por: 'Bia' }, { data: '2026-10-15', turno: 'DIA', por: 'Caio' }],
      datasFalta: [{ data: '2026-10-15', turno: 'NOITE' }, { data: '2026-10-16', turno: 'NOITE' }] },
    ITAQUERA:  { caixas: 2, declarados: 0, abertos: 0, responsaveis: [], datasOk: [],
      datasFalta: [{ data: '2026-10-13', turno: 'NOITE' }, { data: '2026-10-14', turno: 'NOITE' }] },
    BOULEVARD: { caixas: 0, declarados: 0, abertos: 1, responsaveis: [], datasOk: [], datasFalta: [] },
  });

  // ── Visão macro: todas as lojas numa tela ───────────────────────────────────
  check('soma o total da rede, não de uma loja', Math.abs(r.dados.valor - 466.48) < 0.01, JSON.stringify(r.dados.valor));
  check('e mostra esse total no topo', /R\$ 466,48/.test(r.painel));
  check('conta as notas e as lojas', r.dados.qtd === 3 && r.dados.lojas.length === 2);
  check('lista a loja que mais cancelou primeiro', r.dados.lojas[0].nome === 'Caxias', r.dados.lojas.map(l => l.nome).join(','));
  check('traz as duas lojas, sem precisar abrir loja a loja',
    /Bangu/.test(r.painel) && /Caxias/.test(r.painel));
  check('e nomeia as lojas que não cancelaram nada',
    /Sem cancelamento · \d+ loja/.test(r.painel) && /Guarulhos/.test(r.painel));

  // ── Loja sem cancelamento: diz que não teve E quem confirmou ────────────────
  // Sem o nome, "não teve" é um silêncio. Com o nome, é uma afirmação com dono.
  check('loja que respondeu todos os caixas aparece com quem confirmou',
    /Guarulhos[\s\S]{0,160}Confirmado por <b[^>]*>Rafael<\/b>/.test(r.painel),
    r.painel.match(/Guarulhos[\s\S]{0,220}/));
  check('e com quantos caixas foram confirmados', /Rafael<\/b> · 5 caixas/.test(r.painel));

  // ── As datas ────────────────────────────────────────────────────────────────
  // "5 caixas" sozinho é vago: não dá pra saber de quando, nem o que cobrar.
  check('quem confirmou tudo mostra o intervalo, não uma lista de 5 datas',
    /5 caixas, 13\/10 a 17\/10/.test(r.painel), r.painel.match(/Guarulhos[\s\S]{0,200}/));
  check('o que ficou sem resposta vem data a data, que é o que se cobra',
    /Sem resposta em 15\/10 \(NOITE\) e 16\/10/.test(r.painel), r.painel.match(/Pedreira[\s\S]{0,320}/));
  check('dia com um turno faltando mostra o turno; dia inteiro mostra só a data',
    /15\/10 \(NOITE\)/.test(r.painel) && !/16\/10 \(NOITE\)/.test(r.painel),
    r.painel.match(/Sem resposta[\s\S]{0,120}/));
  check('loja que não confirmou nada também lista as datas',
    /Itaquera[\s\S]{0,260}Sem resposta em 13\/10 e 14\/10/.test(r.painel),
    r.painel.match(/Itaquera[\s\S]{0,300}/));
  check('loja que respondeu só parte mostra os dois lados',
    /Pedreira[\s\S]{0,260}3 de 5 caixas[\s\S]{0,120}Sem resposta em/.test(r.painel),
    r.painel.match(/Pedreira[\s\S]{0,300}/));
  check('loja que fechou e ninguém confirmou NÃO é tratada como "não teve"',
    /Itaquera[\s\S]{0,200}sem ninguém confirmar que não houve cancelamento/.test(r.painel),
    r.painel.match(/Itaquera[\s\S]{0,240}/));
  check('e sai em âmbar, não em verde junto das que responderam', (() => {
    const i = r.painel.indexOf('Itaquera');
    const trecho = r.painel.slice(Math.max(0, i - 220), i);
    return /var\(--txt-amber\)/.test(trecho);
  })(), r.painel.slice(Math.max(0, r.painel.indexOf('Itaquera') - 220), r.painel.indexOf('Itaquera') + 40));
  check('loja sem caixa fechado é dita assim, não como "confirmou que não teve"',
    /Boulevard[\s\S]{0,200}Nenhum caixa fechado no período/.test(r.painel),
    r.painel.match(/Boulevard[\s\S]{0,220}/));
  check('quem não respondeu vem antes de quem respondeu',
    r.dados.semCancel[0].estado === 'sem_info', r.dados.semCancel.map(l => l.nome + ':' + l.estado).join(' '));
  check('e o caixa ainda aberto é explicado em vez de sumir',
    /Caixa ainda aberto não entra nesta conta/.test(r.painel));
  // A Maglia não usa o controle de cancelamento: dizer que ela "não cancelou nada" seria
  // afirmar algo falso sobre uma função que ela nem tem.
  check('a Maglia não entra na lista de quem não cancelou (ela não usa o controle)',
    !/Maglia/.test(r.painel), r.painel.match(/Sem cancelamento[\s\S]{0,220}/));

  // ── As informações pedidas ──────────────────────────────────────────────────
  check('mostra o motivo', /Cliente desistiu/.test(r.painel) && /Mesa trocada/.test(r.painel));
  check('quem autorizou', /autorizado por Marcos/.test(r.painel) && /autorizado por Rita/.test(r.painel));
  check('o valor de cada nota', /R\$ 120,50/.test(r.painel) && /R\$ 45,98/.test(r.painel));
  check('e a data', /15\/10/.test(r.painel) && /14\/10/.test(r.painel));
  check('a foto aparece como miniatura clicável',
    /<img src="https:\/\/sb\/f1\.jpg"/.test(r.painel) && /_cancelMacroAbrirFoto/.test(r.painel));

  // ── Sem foto: dito, não escondido ───────────────────────────────────────────
  check('nota sem foto NÃO some da lista (o total deixaria de bater)',
    /Erro de comanda/.test(r.painel) && r.dados.qtd === 3);
  check('ela aparece com "sem foto" em letras, não com imagem quebrada',
    /sem<br>foto/.test(r.painel) && !/<img src="null"/.test(r.painel) && !/<img src=""/.test(r.painel));
  check('o topo diz quantas têm foto', /2\/3/.test(r.painel), r.painel.match(/Com foto[\s\S]{0,200}/));
  check('e explica por que algumas não têm',
    /antes da foto passar a ser exigida/.test(r.painel));

  // ── Relatórios, mesmo padrão dos cards ──────────────────────────────────────
  check('os três botões de relatório estão na aba',
    /gerarWppCancel\(\)/.test(r.painel) && /gerarPDFCancel\(\)/.test(r.painel) && /enviarPDFCancelWpp\(\)/.test(r.painel));
  check('o relatório traz o total da rede', /Total: R\$ 466,48/.test(r.wpp.replace(/\*/g, '')));
  check('cada nota com valor, motivo, autorizador e data',
    /R\$ 120,50 — Cliente desistiu · Marcos · 15\/10/.test(r.wpp));
  check('marca quais não têm foto, em vez de colar link de imagem no WhatsApp',
    /· sem foto/.test(r.wpp) && !/https:\/\/sb\//.test(r.wpp), r.wpp);
  check('o relatório também traz quem confirmou que não teve',
    /Guarulhos — confirmado por Rafael \(5 caixas, 13\/10 a 17\/10\)/.test(r.wpp), r.wpp);
  check('separa quem fechou sem ninguém confirmar, com as datas, como cobrança',
    /Fechou sem ninguém confirmar:[\s\S]{0,80}Itaquera — 2 caixas: 13\/10 e 14\/10/.test(r.wpp), r.wpp);
  // Os dois lados com DATA: as confirmadas (com quem assinou cada caixa) e as que ficaram
  // sem resposta. Antes o lado confirmado era só contagem, e o registro de que não houve
  // cancelamento naqueles dias não aparecia em lugar nenhum.
  check('e a parcial mostra os dois lados, com as datas dos dois',
    /Pedreira — confirmado em 13\/10 por Bia, 14\/10 por Bia e 15\/10 \(DIA\) por Caio \(3 de 5 caixas\); sem resposta em 15\/10 \(NOITE\) e 16\/10/.test(r.wpp), r.wpp);
  check('a versão do PDF não leva asterisco', !r.pdf.includes('*'));
  check('e diz quantas têm foto', /Com foto do cupom: 2 de 3/.test(r.pdf));

  // ── Período sem cancelamento nenhum ─────────────────────────────────────────
  const vazio = await semear({}, { BANGU: { caixas: 5, declarados: 5, abertos: 0, responsaveis: ['Ana'],
      datasOk: ['13','14','15','16','17'].map(d => ({ data: '2026-10-' + d, turno: 'NOITE' })), datasFalta: [] } });
  check('período sem cancelamento diz isso, em vez de tela vazia',
    /Nenhuma nota cancelada em/.test(vazio.painel) && /Nenhuma das 11 lojas lançou/.test(vazio.painel),
    vazio.painel.slice(0, 300));
  check('e os botões de relatório continuam lá', /gerarWppCancel\(\)/.test(vazio.painel));
  check('mesmo sem nenhum cancelamento na rede, quem confirmou aparece',
    /Confirmado por <b[^>]*>Ana<\/b>/.test(vazio.painel), vazio.painel.match(/Sem cancelamento[\s\S]{0,260}/));
  check('o relatório vazio também se explica',
    /Nenhuma das 11 lojas lançou cancelamento neste período/.test(vazio.wpp));

  // ── Ainda carregando ────────────────────────────────────────────────────────
  check('antes dos dados chegarem mostra esqueleto, não "nenhum cancelamento"',
    await page.evaluate(() => { _dashCancelPer = null; const h = _buildCancelPanel();
      return !/Nenhuma nota cancelada/.test(h); }));

  // ── A URL da foto vem do banco ──────────────────────────────────────────────
  const xss = await semear({ BANGU: [{ data: '2026-10-15', valor: 10,
    motivo: '<b>x</b>', autor: '"><script>alert(1)</script>',
    foto: 'https://sb/a.jpg" onerror="alert(1)' }] },
    { CAXIAS: { caixas: 1, declarados: 1, abertos: 0, responsaveis: ['<img src=x onerror=alert(1)>'],
      datasOk: [{ data: '2026-10-13', turno: 'NOITE' }], datasFalta: [] } });
  check('o nome de quem confirmou também sai escapado',
    !/<img src=x onerror/.test(xss.painel) && /&lt;img src=x/.test(xss.painel),
    xss.painel.match(/Confirmado por[\s\S]{0,140}/));
  check('motivo e autorizador saem escapados',
    !/<b>x<\/b>/.test(xss.painel) && !/<script>alert\(1\)<\/script>/.test(xss.painel),
    xss.painel.match(/motivo[\s\S]{0,120}/));
  check('e a URL da foto não escapa do atributo',
    !/onerror="alert\(1\)"/.test(xss.painel) && /&quot;/.test(xss.painel),
    xss.painel.match(/<img[\s\S]{0,180}/));

  // ── O mapeador contra a forma crua do banco ─────────────────────────────────
  // A consulta devolve `loja` como o app Caixa grava ('SÃO GONÇALO', 'NOVA AMERICA'),
  // não a chave interna. Foi exatamente aqui que eu errei montando a massa de exemplo:
  // chave que não bate vira "nenhum caixa fechado no período", que é uma afirmação falsa
  // sobre a loja.
  const mapeado = await page.evaluate(() => {
    const rows = [
      { loja: 'SÃO GONÇALO', data: '2026-10-13', turno: 'DIA',   status: 'FECHADO', sem_cancelamento_por: 'Marcia', sem_cancelamento_em: '2026-10-13T23:00:00Z', gn_caixa_cancelamento: [] },
      { loja: 'SÃO GONÇALO', data: '2026-10-13', turno: 'NOITE', status: 'FECHADO', sem_cancelamento_por: 'Marcia', sem_cancelamento_em: '2026-10-14T01:00:00Z', gn_caixa_cancelamento: [] },
      { loja: 'NOVA AMERICA', data: '2026-10-13', turno: 'DIA',  status: 'FECHADO', sem_cancelamento_por: null, sem_cancelamento_em: null, gn_caixa_cancelamento: [] },
      { loja: 'CAMPO GRANDE', data: '2026-10-13', turno: 'DIA',  status: 'ABERTO',  sem_cancelamento_por: null, sem_cancelamento_em: null, gn_caixa_cancelamento: [] },
    ];
    const d = _raioxMapearDecl(rows);
    return { chaves: Object.keys(d), sg: d['SÃO GONÇALO'], na: d['NOVA AMERICA'], cg: d['CAMPO GRANDE'] };
  });
  check('o mapeador reconhece o nome da loja como o Caixa grava',
    mapeado.chaves.length === 3, mapeado.chaves.join(','));
  check('dois turnos do mesmo dia contam como dois caixas, não dois dias',
    mapeado.sg && mapeado.sg.caixas === 2 && mapeado.sg.declarados === 2, JSON.stringify(mapeado.sg));
  check('sem repetir o nome de quem assinou os dois',
    mapeado.sg && mapeado.sg.responsaveis.length === 1 && mapeado.sg.responsaveis[0] === 'Marcia');
  check('caixa fechado sem assinatura conta como fechado e não declarado',
    mapeado.na && mapeado.na.caixas === 1 && mapeado.na.declarados === 0, JSON.stringify(mapeado.na));
  check('caixa ainda aberto não entra na contagem de fechados',
    mapeado.cg && mapeado.cg.caixas === 0 && mapeado.cg.abertos === 1, JSON.stringify(mapeado.cg));
  check('o mapeador guarda as datas, não só a contagem',
    mapeado.sg && mapeado.sg.datasOk.length === 2
    && mapeado.sg.datasOk.every(x => x.data === '2026-10-13')
    && mapeado.na && mapeado.na.datasFalta.length === 1
    && mapeado.na.datasFalta[0].data === '2026-10-13', JSON.stringify(mapeado.sg) + JSON.stringify(mapeado.na));

  // Lista longa não pode virar paredão.
  const longa = await page.evaluate(() => {
    const faltas = Array.from({ length: 10 }, (_, i) => ({ data: '2026-10-0' + ((i % 9) + 1), turno: 'NOITE' }));
    return _cancelDatas(faltas, faltas);
  });
  check('mais de 6 datas vira "e mais N", em vez de um paredão',
    /e mais \d+$/.test(longa) && longa.split(',').length <= 7, longa);

  // ── A aba existe e é alcançável ─────────────────────────────────────────────
  const abas = await page.evaluate(() => {
    _dashTab = 'cancel';
    return { tab: _dashTab, temBotao: typeof _setDashTab === 'function' };
  });
  check('a aba é selecionável', abas.tab === 'cancel' && abas.temBotao);

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  if (process.env.VER) console.log('\n--- relatório ---\n' + r.wpp);
  process.exit(falhou ? 1 : 0);
})();
