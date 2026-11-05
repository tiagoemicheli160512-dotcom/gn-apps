// "No app check-list, Nova América, está dando que está faltando itens pra concluir o
//  check-list de abertura, mas tá tudo ok, e não tá salvando o check-list mesmo: clica e
//  não salva."
//
// MEDIDO no banco, e é o que o print mostrava: em 02/11 a Nova América fechou o dia com 33
// dos 36 itens do check-list operacional FOTOGRAFADOS e NENHUM marcado. Não é desleixo — em
// 29 e 31/10 a mesma loja fotografou os 36 e marcou os 36. Nenhuma outra loja da rede põe
// foto em item de check-list (105 fotos dela contra 0 das outras em 8 dias), então o defeito
// só aparecia ali.
//
// A causa: `mergeState` deixa o servidor vencer em TODO campo, e a foto era o único com
// defesa contra uma cópia do servidor anterior ao que o aparelho acabou de fazer
// (_fotoPendente). O toque ia pro estado na hora e pro servidor só no save seguinte;
// qualquer carga do dia nessa janela — recarregar, voltar de outra data, segundo aparelho —
// trazia o `checked:false` de antes e desfazia a marca, com a foto sobrevivendo ao lado.
// Foram as duas SEGUNDAS (27/10 e 02/11) que fecharam com zero: é o dia de contagem, com
// dois aparelhos e muita navegação de data.
//
// Esta suíte cobra os dois sentidos, porque consertar um quebrando o outro é fácil: a marca
// recém-feita não pode voltar, e a marca que o servidor já tem não pode ser apagada por um
// aparelho que nunca viu aquele item.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra !== undefined ? ' >> ' + String(extra).slice(0, 300) : '')); c ? ok++ : falhou++; };

const DIA = '2026-11-02';
// A cópia do servidor ANTERIOR ao toque: é ela que desfazia a marca.
const vazio = () => ({ checked: false, naoConforme: false, problema: '', fotoBase64: '', fotoName: '' });
const LINHA_ANTIGA = () => ({
  data_operacao: DIA, loja: 'Nova América',
  checklist: { salao: { '0': vazio(), '1': vazio() } },
  abertura: { reservas: { '0': vazio(), '1': vazio(), '2': vazio(), _semReservas: false } },
  fechamento: {}, faltas: [], manutencao: [], despesas: [], retiradas: [],
  entradas_manuais: [], iniciado_em: {}, concluido_em: {},
});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  // Dublê: guarda o que o app grava, pra saber o que o save LEVOU.
  const gravados = [];
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), url = req.url();
    if (req.method() !== 'GET') {
      try { gravados.push({ tabela: url.split('/rest/v1/')[1].split('?')[0], corpo: JSON.parse(req.postData() || '{}') }); } catch (e) {}
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message)));
  await page.goto('file://' + ARQ);
  try {
    await CAMINHOS.esperarApp(page, ['LOJA', '_fotoPendente'], ['mergeState', 'toggleCheck', 'toggleNaoConforme']);
  } catch (e) { console.log('FALHOU: o app não carregou'); falhou++; await browser.close(); process.exit(1); }

  const cenario = (corpo) => page.evaluate(async ({ linha, passos }) => {
    const out = {};
    try {
      LOJA = 'Nova América';
      usuarioLogado = { nome: 'Teste', cargo: 'mestre' };
      state.data = passos.dia;
      state.checklist = {}; state.abertura = {}; state.fechamento = {};
      _fotoPendente.clear();
      initAllStates();
      if (passos.partirDoServidor) mergeState(JSON.parse(JSON.stringify(linha)));
      if (passos.antes) eval(passos.antes);
      if (passos.merge) mergeState(JSON.parse(JSON.stringify(linha)));
      if (passos.depois) eval(passos.depois);
      out.salao0 = { ...((state.checklist.salao || {})['0'] || {}) };
      out.salao1 = { ...((state.checklist.salao || {})['1'] || {}) };
      out.reservas = JSON.parse(JSON.stringify(state.abertura.reservas || {}));
      out.contaAbertura = _contarItensChecklist(state.abertura, SETORES_ABERTURA);
      out.pendentes = [..._fotoPendente];
    } catch (e) { out.erro = String(e && e.message); }
    return out;
  }, corpo);

  // ── 1. O caso medido: marcar, chegar a cópia antiga, a marca fica ──────────────────────
  const a = await cenario({ linha: LINHA_ANTIGA(), passos: { dia: DIA,
    antes: `toggleCheck('checklist','salao',0,{checked:true})`, merge: true } });
  check('marcar e receber a cópia anterior do servidor: a marca FICA', a.salao0.checked === true, JSON.stringify(a.salao0));

  // ── 2. A forma exata da linha de 02/11: foto junto ────────────────────────────────────
  const b = await cenario({ linha: LINHA_ANTIGA(), passos: { dia: DIA,
    antes: `toggleCheck('checklist','salao',0,{checked:true});
            state.checklist.salao['0'].fotoBase64='https://ex/foto.jpg';
            _marcarFotoPendente(_chaveFoto('checklist','salao',0),'fotoBase64');`,
    merge: true } });
  check('com foto tirada junto, a foto E a marca ficam (antes ficava só a foto)',
    b.salao0.checked === true && b.salao0.fotoBase64 === 'https://ex/foto.jpg', JSON.stringify(b.salao0));

  // ── 3. Não conforme corre o mesmo risco ───────────────────────────────────────────────
  const c = await cenario({ linha: LINHA_ANTIGA(), passos: { dia: DIA,
    antes: `toggleNaoConforme('checklist','salao',0)`, merge: true } });
  check('"não conforme" também sobrevive à cópia anterior', c.salao0.naoConforme === true, JSON.stringify(c.salao0));

  // ── 4. O sentido contrário não pode quebrar ───────────────────────────────────────────
  // Desmarcar precisa continuar subindo: o item vem marcado do servidor, a loja desmarca, e
  // a carga seguinte não pode remarcar sozinha.
  const marcada = LINHA_ANTIGA(); marcada.checklist.salao['0'].checked = true;
  const d = await cenario({ linha: marcada, passos: { dia: DIA, partirDoServidor: true,
    antes: `toggleCheck('checklist','salao',0,{checked:false})`, merge: true } });
  check('desmarcar continua valendo depois da carga (não volta marcado sozinho)',
    d.salao0.checked === false, JSON.stringify(d.salao0));

  // ── 5. O que este aparelho NÃO tocou continua sendo do servidor ───────────────────────
  // É a outra metade: dois aparelhos na mesma loja, e o que um marcou não pode sumir só
  // porque o outro salvou sem ter visto aquele item.
  const outroMarcou = LINHA_ANTIGA(); outroMarcou.checklist.salao['1'].checked = true;
  const e = await cenario({ linha: outroMarcou, passos: { dia: DIA,
    antes: `toggleCheck('checklist','salao',0,{checked:true})`, merge: true } });
  check('item marcado no OUTRO aparelho chega e fica, mesmo com este tendo marcado outro',
    e.salao1.checked === true && e.salao0.checked === true, JSON.stringify({ s0: e.salao0.checked, s1: e.salao1.checked }));

  // ── 6. "Não tem reservas hoje" ────────────────────────────────────────────────────────
  const f = await cenario({ linha: LINHA_ANTIGA(), passos: { dia: DIA,
    antes: `toggleSemReservas(true)`, merge: true } });
  check('"não tem reservas hoje" não se desmarca sozinho na carga seguinte',
    f.reservas._semReservas === true, JSON.stringify(f.reservas._semReservas));
  check('e os três itens do grupo continuam liberados',
    f.reservas['0'] && f.reservas['0'].checked === true && f.reservas['2'] && f.reservas['2'].checked === true,
    JSON.stringify(f.reservas));
  check('com isso a trava de prazo para de acusar os 3 de 16',
    f.contaAbertura && f.contaAbertura.feitos === 3 && f.contaAbertura.total === 16,
    JSON.stringify(f.contaAbertura));

  // ── 7. A proteção não é eterna: some quando o servidor confirma ───────────────────────
  // Sem isso, um item marcado uma vez ficaria imune pra sempre e o outro aparelho nunca
  // conseguiria desmarcar.
  const g = await page.evaluate(async ({ dia, linha }) => {
    const out = {};
    try {
      LOJA = 'Nova América'; state.data = dia;
      state.checklist = {}; state.abertura = {}; state.fechamento = {};
      _fotoPendente.clear(); initAllStates();
      toggleCheck('checklist', 'salao', 0, { checked: true });
      out.pendenteAntes = [..._fotoPendente].filter(k => k.indexOf('checklist|salao|0') === 0);
      const okSave = await saveAll({ silencioso: true });
      out.okSave = okSave;
      out.pendenteDepois = [..._fotoPendente].filter(k => k.indexOf('checklist|salao|0') === 0);
      // Agora o servidor manda de novo: o outro aparelho desmarcou, e isso tem que chegar.
      mergeState(JSON.parse(JSON.stringify(linha)));
      out.depoisDoServidor = { ...state.checklist.salao['0'] };
    } catch (e) { out.erro = String(e && e.message); }
    return out;
  }, { dia: DIA, linha: LINHA_ANTIGA() });
  check('o toque entra como pendente', (g.pendenteAntes || []).length > 0, JSON.stringify(g));
  check('e sai da pendência quando o save sobe', (g.pendenteDepois || []).length === 0, JSON.stringify(g.pendenteDepois));
  check('depois disso o servidor volta a mandar (outro aparelho consegue desmarcar)',
    g.depoisDoServidor && g.depoisDoServidor.checked === false, JSON.stringify(g.depoisDoServidor));

  // ── 8. O save leva a marca ────────────────────────────────────────────────────────────
  const upserts = gravados.filter(x => x.tabela === 'checklist_diario' && x.corpo && x.corpo.checklist);
  const levou = upserts.some(x => ((x.corpo.checklist.salao || {})['0'] || {}).checked === true);
  check('o upsert do dia leva o item marcado pro servidor', levou,
    JSON.stringify(upserts.map(x => ((x.corpo.checklist.salao || {})['0'] || {}).checked)));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
