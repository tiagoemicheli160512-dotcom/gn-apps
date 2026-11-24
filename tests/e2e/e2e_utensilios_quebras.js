// "No nosso controle de utensílios, não aparece quantidade quebrada, o saldo só diminui — tem
//  como ter essa visão tanto no app lojas (aba utensílios) quanto no painel de gestão."
//  (24/11/2026)
//
// O risco aqui é o NÚMERO. A quebra que fica em aberto é COPIADA pro dia seguinte com id novo
// (novoIdLocalChk): contar linha a linha dava ~500 quebras na rede quando eram 61 lançamentos.
// Então o teste persegue as formas de contar errado:
//   • a mesma quebra contada uma vez por dia em que ficou pendente;
//   • a transição pro orig_id (cópia antiga sem orig_id, cópia nova apontando pra ela);
//   • um "copo 2" novo roubando a identidade do "copo 1" herdado;
//   • a quebra resolvida (que NÃO é copiada) engolindo uma quebra nova igual no dia seguinte;
//   • "Faltando" contado como quebra; a janela usando a data da cópia em vez da 1ª.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK  = process.env.ARQ_CHK  || CAMINHOS.pub('gn-checklist.html');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };
const T = 'Utensílio / Louça';
const it = (id, descricao, qtd, extra) => Object.assign({ id, tipo: T, situacao: 'Quebrou', qtd: String(qtd), descricao, status: 'Pendente', confirmado_loja: false }, extra || {});
const iso = n => { const d = new Date(Date.now() - n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ══ 1. A conta (gn-utensilios-quebras.js), rodando dentro do Check-list ═════════════════
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  let CHK_ROWS = [], chkUrl = '';
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url());
    if (/checklist_diario/.test(u) && /manutencao/.test(u) && r.request().method() === 'GET') { chkUrl = u; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHK_ROWS) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const chk = await ctx.newPage();
  const erros = []; chk.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await chk.goto('file://' + CHK);
    try { await chk.waitForFunction(() => { try { return typeof renderUtensilios === 'function' && typeof CARNES_DEF !== 'undefined'; } catch (e) { return false; } }, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: o Check-list não carregou'); process.exit(1); } }
  }
  if (!(await chk.evaluate(() => !!window.gnUtensQuebras && typeof _utensQuebrasCarregar === 'function'))) {
    console.log('FALHOU: a contagem de quebras não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const conta = (rows, desde, ate) => chk.evaluate(a => window.gnUtensQuebras.agrupar(a.rows, a.desde, a.ate), { rows, desde, ate });
  let r;

  // a) Copiada 3 dias com id novo a cada dia → UMA quebra, datada do 1º dia.
  r = await conta([
    { data_operacao: '2026-11-10', manutencao: [it(1, 'Copo de chopp', 2)] },
    { data_operacao: '2026-11-11', manutencao: [it(2, 'Copo de chopp', 2)] },
    { data_operacao: '2026-11-12', manutencao: [it(3, 'Copo de chopp', 2, { saldo_aplicado: true, saldo_chave: 'copo de chopp' })] },
  ]);
  check('pendência copiada 3 dias com id novo conta UMA vez (2 copos, não 6)', r.total === 2 && r.lancs === 1, r);
  check('…e vale como descontada se foi descontada em qualquer dia', r.naoDesc === 0, r);
  r = await conta([
    { data_operacao: '2026-11-10', manutencao: [it(1, 'Copo de chopp', 2)] },
    { data_operacao: '2026-11-11', manutencao: [it(2, 'Copo de chopp', 2)] },
  ], '2026-11-11');
  check('a janela usa a data em que a quebra APARECEU (10/11), não a da cópia (11/11)', r.total === 0, r);

  // b) Transição: cópia antiga sem orig_id, cópia nova com orig_id apontando pra ELA.
  r = await conta([
    { data_operacao: '2026-11-20', manutencao: [it(10, 'Prato fundo', 1)] },
    { data_operacao: '2026-11-21', manutencao: [it(11, 'Prato fundo', 1)] },                 // cópia de antes do orig_id
    { data_operacao: '2026-11-22', manutencao: [it(12, 'Prato fundo', 1, { orig_id: 11 })] }, // cópia nova: orig_id = id de ontem
    { data_operacao: '2026-11-23', manutencao: [it(13, 'Prato fundo', 1, { orig_id: 11 })] },
  ]);
  check('transição pro orig_id: a cópia nova que aponta pra cópia antiga continua UMA quebra', r.total === 1 && r.lancs === 1, r);
  r = await conta([
    { data_operacao: '2026-11-20', manutencao: [it(20, 'Prato fundo', 1)] },
    { data_operacao: '2026-11-21', manutencao: [it(21, 'Prato fundo', 4, { orig_id: 20 })] },
  ]);
  check('orig_id casa mesmo com a quantidade corrigida no dia seguinte (vale a última: 4)', r.total === 4 && r.lancs === 1, r);

  // c) Um "copo 2" novo listado ANTES do "copo 1" herdado não rouba a identidade dele.
  r = await conta([
    { data_operacao: '2026-11-20', manutencao: [it(30, 'Copo', 1)] },
    { data_operacao: '2026-11-21', manutencao: [it(31, 'Copo', 2), it(32, 'Copo', 1)] },
  ]);
  const rHoje = await conta([
    { data_operacao: '2026-11-20', manutencao: [it(30, 'Copo', 1)] },
    { data_operacao: '2026-11-21', manutencao: [it(31, 'Copo', 2), it(32, 'Copo', 1)] },
  ], '2026-11-21');
  check('herdado "copo 1" + novo "copo 2" no mesmo dia = 3 copos em 2 lançamentos', r.total === 3 && r.lancs === 2, r);
  check('…e o novo é o de 2 (só ele cai na janela de 21/11)', rHoje.total === 2 && rHoje.lancs === 1, rHoje);

  // d) Resolvida e confirmada não é copiada: igual no dia seguinte é quebra NOVA.
  r = await conta([
    { data_operacao: '2026-11-20', manutencao: [it(40, 'Taça', 1, { status: 'Resolvido', confirmado_loja: true })] },
    { data_operacao: '2026-11-21', manutencao: [it(41, 'Taça', 1)] },
  ]);
  check('quebra resolvida+confirmada não engole a quebra igual do dia seguinte (2 taças)', r.total === 2 && r.lancs === 2, r);

  // e) Dia sem louça no meio corta a cadeia (a pendência foi resolvida/apagada).
  r = await conta([
    { data_operacao: '2026-11-20', manutencao: [it(50, 'Garfo', 1)] },
    { data_operacao: '2026-11-21', manutencao: [] },
    { data_operacao: '2026-11-22', manutencao: [it(51, 'Garfo', 1)] },
  ]);
  check('dia sem louça entre os dois: a do dia 22 é quebra nova (2 garfos)', r.total === 2, r);

  // f) Faltando não é quebra; sem situação é "Quebrou"; sem quantidade não conta.
  r = await conta([{ data_operacao: '2026-11-20', manutencao: [
    it(60, 'Faca', 3, { situacao: 'Faltando' }), it(61, 'Faca', 2, { situacao: undefined }), it(62, 'Faca', '', {}),
    { id: 63, tipo: 'Estrutura', descricao: 'Porta', status: 'Pendente' }] }]);
  check('"Faltando" fora, sem situação conta como Quebrou, sem quantidade e outro tipo não contam', r.total === 2 && r.lancs === 1, r);

  // g) Por peça, com o mesmo normalizador (Canecão = canecao) e o que não foi descontado.
  r = await conta([{ data_operacao: '2026-11-20', manutencao: [
    it(70, 'Canecão', 2, { saldo_aplicado: true, saldo_chave: 'canecao' }), it(71, 'canecao ', 3), it(72, 'Prato', 1)] }]);
  check('agrupa por peça normalizada (Canecão + canecao = 5) e separa o não descontado (3)',
    r.porPeca.canecao && r.porPeca.canecao.qtd === 5 && r.porPeca.canecao.naoDesc === 3 && r.porPeca.prato.qtd === 1 && r.naoDesc === 4, r.porPeca);

  // ══ 2. A tela da loja: Check-list › Utensílios ════════════════════════════════════════════
  const hoje = iso(0);
  CHK_ROWS = [
    { data_operacao: iso(40), manutencao: [it(100, 'Copo de chopp', 9)] },                 // antes da janela: fora
    // cópia dela no dia seguinte, já resolvida e confirmada: não vira quebra nova nem é copiada adiante
    { data_operacao: iso(39), manutencao: [it(101, 'Copo de chopp', 9, { status: 'Resolvido', confirmado_loja: true })] },
    { data_operacao: iso(10), manutencao: [it(102, 'Copo de chopp', 2, { saldo_aplicado: true, saldo_chave: 'copo de chopp' })] },
    // a de 10 dias atrás continua pendente (cópia, mesmo conteúdo) + uma quebra NOVA igual + prato
    { data_operacao: iso(5),  manutencao: [it(103, 'Copo de chopp', 2, { saldo_aplicado: true, saldo_chave: 'copo de chopp' }),
                                           it(107, 'Copo de chopp', 2, { saldo_aplicado: true, saldo_chave: 'copo de chopp' }), it(104, 'Prato fundo', 3)] },
    { data_operacao: iso(4),  manutencao: [it(105, 'Taça de vinho', 1)] },
    { data_operacao: hoje,    manutencao: [it(106, 'Lixo do banco', 50)] },               // o dia aberto vem da TELA, não do banco
  ];
  const tela = await chk.evaluate(async (hoje) => {
    usuarioLogado = { id: 1, nome: 'Taynara', cargo: 'sub_gerente', loja: 'BANGU' };
    LOJA = 'Bangu'; state.data = hoje;
    state.utensiliosSaldo = {
      'copo de chopp': { nome: 'Copo de chopp', qtd: 40, inicial: 44 },
      'prato fundo': { nome: 'Prato fundo', qtd: 12, inicial: 12 },
    };
    state.manutencao = [{ id: 200, tipo: 'Utensílio / Louça', situacao: 'Quebrou', qtd: '1', descricao: 'Prato fundo', status: 'Pendente', orig_id: 999 }];
    await _utensQuebrasCarregar();
    const el = document.getElementById('utens-saldos');
    return {
      txt: el.innerText.replace(/\s+/g, ' '),
      total: (el.querySelector('.utens-quebras-total') || {}).innerText,
      naoDesc: (el.querySelector('.utens-quebras-naodesc') || {}).innerText || '',
      porPeca: [...el.querySelectorAll('.utens-peca-quebrou')].map(x => x.innerText.replace(/\s+/g, ' ')),
      fora: (el.querySelector('.utens-quebras-fora') || {}).innerText || '',
    };
  }, hoje);
  check('a tela lê o banco só da loja e com folga antes da janela (pra reconhecer a herdada)',
    /loja=eq\.Bangu/.test(chkUrl) && new RegExp('data_operacao=gte\\.' + iso(44)).test(chkUrl), chkUrl);
  // Copo: 2 (dia -10) + 2 (dia -5) = 4. Prato: 3 (dia -5) + 1 (hoje, da tela, orig_id desconhecido → nova) = 4.
  // Taça: 1. Total 9. "Lixo do banco" do dia de hoje NÃO entra: hoje vem de state.manutencao.
  check('loja: total no topo = 9 peças (copo 4, prato 4, taça 1), sem o lixo do banco de hoje e sem a de 40 dias atrás',
    tela.total === '9' && !/Lixo|50/.test(tela.txt.replace(/últimos 30/, '')), tela);
  check('…quantas ainda não foram descontadas do saldo (prato 4 + taça 1 = 5)', /^5 peças ainda não descontadas/.test(tela.naoDesc), tela.naoDesc);
  check('cada peça do controle mostra quanto quebrou (Copo 4, Prato 4 com 4 não descontadas)',
    tela.porPeca.some(x => /quebrou 4 em 30 dias/.test(x) && !/não descontada/.test(x)) && tela.porPeca.some(x => /quebrou 4 em 30 dias · 4 não descontadas/.test(x)), tela.porPeca);
  check('…o saldo continua ali do lado (40 e 12)', /Copo de chopp.*40/.test(tela.txt) && /Prato fundo.*12/.test(tela.txt), tela.txt);
  check('peça que quebrou e não está no controle aparece à parte (Taça de vinho 1)', /Taça de vinho \(1\)/.test(tela.fora), tela.fora);

  const falha = await chk.evaluate(async () => {
    _utensQuebrasRows = null;
    const o = sb.from; sb.from = () => { throw new Error('rede caiu'); };
    try { await _utensQuebrasCarregar(); } finally { sb.from = o; }
    renderUtensilios();   // é o caminho do app: abrir a aba redesenha com o que tiver
    const el = document.getElementById('utens-saldos');
    return { txt: el.innerText.replace(/\s+/g, ' '), temQuebra: !!el.querySelector('.utens-quebras-resumo') };
  });
  check('leitura falhou: a tela segue com o saldo, sem inventar quebra', !falha.temQuebra && /Copo de chopp/.test(falha.txt), falha);

  // A cópia do dia seguinte passa a levar orig_id (identidade certa daqui pra frente).
  const src = require('fs').readFileSync(CHK, 'utf8');
  check('a cópia das pendências pro dia seguinte grava orig_id (3 caminhos)',
    (src.match(/orig_id: ?m\.orig_id ?\|\| ?m\.id/g) || []).length >= 3, (src.match(/orig_id: ?m\.orig_id ?\|\| ?m\.id/g) || []).length);

  // ══ 3. O Painel de Gestão › Utensílios ═══════════════════════════════════════════════════
  const ctxH = await browser.newContext({ viewport: { width: 390, height: 900 } });
  let qUrl = '', qFalha = false;
  const SALDOS = [
    { loja: 'BANGU', us: { 'copo de chopp': { nome: 'Copo de chopp', qtd: 60 }, 'prato fundo': { nome: 'Prato fundo', qtd: 5 } } },
    { loja: 'NORTE', us: { 'garfo': { nome: 'Garfo', qtd: 80 } } },
    { loja: 'CAXIAS', us: null },
  ];
  const QROWS = [
    { loja: 'Bangu', data_operacao: iso(3), manutencao: [it(1, 'Copo de chopp', 2, { saldo_aplicado: true, saldo_chave: 'copo de chopp' }), it(2, 'Prato fundo', 1)] },
    { loja: 'Bangu', data_operacao: iso(2), manutencao: [it(3, 'Copo de chopp', 2, { saldo_aplicado: true, saldo_chave: 'copo de chopp' }), it(4, 'Prato fundo', 1), it(5, 'Travessa', 3)] },
    { loja: 'Bangu', data_operacao: iso(50), manutencao: [it(6, 'Copo de chopp', 7, { status: 'Resolvido', confirmado_loja: true })] },
    { loja: 'Caxias', data_operacao: iso(1), manutencao: [it(7, 'Copo', 1)] },
  ];
  await ctxH.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url());
    if (/gn_lojas/.test(u) && /utensilios_saldo/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SALDOS) });
    if (/checklist_diario/.test(u) && /manutencao/.test(u)) { qUrl = u;
      if (qFalha) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"erro"}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QROWS) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const home = await ctxH.newPage();
  home.on('pageerror', e => erros.push(String(e.message || e)));
  for (let i = 1; ; i++) {
    await home.goto('file://' + HOME);
    try { await home.waitForFunction(() => { try { return typeof renderDashboard === 'function' && typeof _buildUtensEntradasPanel === 'function'; } catch (e) { return false; } }, { timeout: 20000 }); break; }
    catch (e) { if (i >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  const pegaPainel = () => home.evaluate(async () => {
    LOJAS_LISTA = ['BANGU', 'NORTE SHOPPING', 'CAXIAS', 'MAGLIA'];
    _utensEntPainel = null; _utensEntDias = 30; _utensEstAberta = new Set(['BANGU']); _utensRelLojasFiltro = [];
    await _loadUtensEntradasPainel();
    const h = document.createElement('div'); h.innerHTML = _buildUtensEntradasPanel(); document.body.appendChild(h);
    const out = {
      kpi: (h.querySelector('.utens-kpi-quebras') || {}).innerText || '',
      bloco: (h.querySelector('.utens-quebras') || {}).innerText || '',
      erro: (h.querySelector('.utens-quebras-erro') || {}).innerText || '',
      ordem: [...h.querySelectorAll('.utens-quebras-loja')].map(x => x.dataset.loja),
      qtds: [...h.querySelectorAll('.utens-quebras-qtd')].map(x => x.innerText),
      estoque: (h.querySelector('.utensest') || {}).innerText || '',
      pecas: [...h.querySelectorAll('.utensest-pecas > div')].map(x => x.innerText.replace(/\s+/g, ' ')),
      rede: _utensRelatorioTexto(true).msg,
    };
    _utensRelLojasFiltro = ['BANGU']; out.bangu = _utensRelatorioTexto(true).msg;
    let pdf = null; const o = window.gnRelatorioPDF; window.gnRelatorioPDF = a => { pdf = a; }; gerarPDFUtens(); window.gnRelatorioPDF = o; out.pdf = pdf;
    _utensRelLojasFiltro = [];
    h.remove(); return out;
  });
  const p = await pegaPainel();
  const norm = s => String(s).replace(/\s+/g, ' ');
  check('painel lê as quebras das lojas numa requisição, pela chave do Check-list, sem a Maglia',
    /loja=in\.\("Bangu","Norte Shopping","Caxias"\)/.test(qUrl) && !/Maglia/i.test(qUrl), qUrl);
  check('painel: KPI "Peças quebradas" = 7 (Bangu 6: copo 2, prato 1, travessa 3; Caxias 1) com 5 não descontadas',
    /Peças quebradas\s*7/i.test(p.kpi) && /5 não descontadas/.test(p.kpi), p.kpi);
  check('a de 50 dias atrás fica fora dos 30 dias', !/\b14\b/.test(p.kpi));
  check('"Quebras por loja": da que mais quebrou pra menos (Bangu 6, Caxias 1), Norte em "sem quebra"',
    p.ordem.join() === 'BANGU,CAXIAS' && p.qtds.join() === '6,1' && /Sem quebra lançada: Norte Shopping/.test(norm(p.bloco)), { ordem: p.ordem, qtds: p.qtds, bloco: norm(p.bloco) });
  check('…com as peças que mais quebraram e a que está fora do controle (Travessa 3)',
    /Travessa 3 \(fora do controle\) · Copo de chopp 2 · Prato fundo 1/.test(norm(p.bloco)), norm(p.bloco));
  check('…e quantas não foram descontadas por loja (Bangu 4, Caxias 1)', /4 não descontadas/.test(norm(p.bloco)) && /1 não descontada\b/.test(norm(p.bloco)), norm(p.bloco));
  check('estoque: a loja mostra quantas quebraram e cada peça o 💥 ao lado do saldo',
    /💥 6 quebradas/.test(norm(p.estoque)) && p.pecas.some(x => /Prato fundo 💥 1 \(1 não desc\.\) · 5$/.test(x)) && p.pecas.some(x => /Copo de chopp 💥 2 · 60$/.test(x)), { est: norm(p.estoque), pecas: p.pecas });
  check('relatório da rede traz a seção de quebras', /Quebras — últimos 30 dias/.test(p.rede) && /7 peças \(5 não descontadas do saldo\)/.test(p.rede) && /Bangu: 6 \(4 não desc\.\)/.test(p.rede), p.rede);
  check('relatório só de Bangu lista as peças quebradas (inclusive fora do controle)',
    /Travessa \(fora do controle\): 3/.test(p.bangu) && /Prato fundo: 5 · quebrou 1/.test(p.bangu) && !/Caxias: 1/.test(p.bangu), p.bangu);
  check('o PDF ganha o quadro "Quebradas"', p.pdf && p.pdf.kpis.some(k => /Quebradas/.test(k.label) && k.valor === '6'), p.pdf && p.pdf.kpis);

  qFalha = true;
  const pf = await pegaPainel();
  check('quebras não carregaram: a aba segue (estoque e entradas) e avisa, sem KPI de quebra',
    /Não deu pra carregar as quebras/.test(pf.erro) && !pf.kpi && /Copo de chopp/.test(pf.estoque) && !/Quebras —/.test(pf.rede), pf);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
