// "Verificar o app Check-list da loja de São Gonçalo, nas abas Abertura e Fechamento, pois
//  as informações não estão sendo salvas ao clicar nos itens indicando que estão conformes.
//  Dias 27/10 e 28/10. Verificar também em Nova Iguaçu, dia 28/10."
//
// MEDIDO no banco antes de mexer em código (checklist_diario):
//
//   loja          dia     abertura                        fechamento   pct   iniciado_em
//   São Gonçalo   26/10   16/16                           24/24        100   abertura+checklist+fechamento
//   São Gonçalo   27/10   14/16 (pagamento 0/2)            0/24          66   {}  ← VAZIO
//   São Gonçalo   28/10   16/16                           24/24        100   abertura+checklist+fechamento
//   Nova Iguaçu   27/10   16/16                            0/24          68   abertura+checklist
//   Nova Iguaçu   28/10   14/16 (pagamento 0/2)            0/24          66   {}  ← VAZIO
//
// Os dias ruins têm `iniciado_em` vazio e os dias bons não. iniciado_em era gravado CRU no
// upsert de saveAll() — a cópia do servidor vinha no SELECT e não era usada. Então o que
// esvaziou iniciado_em foi um save vindo de um aparelho que ainda não tinha o dia em
// memória; e esse mesmo save é o que zerou a Abertura e o Fechamento, porque:
//
//   1. initAllStates() cria, no boot, TODO item dos três grupos como {checked:false,...};
//   2. loadSupabaseDay() só chega depois, e pode demorar, falhar ou nem ter rodado;
//   3. o `setInterval(saveAll, 30000)` dispara mesmo assim;
//   4. em _mesclarGrupoChk o lado local vencia campo por campo ({...servidor, ...local}),
//      então aquele `false` de vaga em branco sobrescrevia o `true` que a loja já havia
//      marcado — sem erro na tela e com o "Salvo" aparecendo normal.
//
// A distinção que faltava: vaga em branco do boot é "não sei", não "desmarcado". Esta suíte
// cobra as duas pontas — a vaga em branco não apaga nada, e DESMARCAR continua funcionando
// (que é o que torna o conserto difícil: os dois casos mandam `checked:false`).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof saveAll === 'function' && typeof initAllStates === 'function'
        && typeof mergeState === 'function' && typeof toggleCheck === 'function'
        && typeof SETORES_ABERTURA === 'object' && typeof SETORES_FECHAMENTO === 'object';
  } catch (e) { return false; } }, null, { timeout: 25000 });
  // 27/10/2026: o dia de São Gonçalo.
  await page.evaluate(() => { hideLogin(); LOJA='São Gonçalo'; state.data='2026-10-27';
    usuarioLogado={id:1,nome:'Harison',cargo:'gerente',loja:'SAO_GONCALO'}; });

  const SET = await page.evaluate(() => {
    const quantos = m => Object.fromEntries(Object.keys(m).map(s => [s, m[s].items.length]));
    return { ab: Object.keys(SETORES_ABERTURA), fe: Object.keys(SETORES_FECHAMENTO),
             qAb: quantos(SETORES_ABERTURA), qFe: quantos(SETORES_FECHAMENTO) };
  });
  const AB0 = SET.ab[0], AB1 = SET.ab[1], FE0 = SET.fe[0];

  // Reproduz o aparelho recém-aberto: estado zerado e initAllStates() enchendo as vagas,
  // exatamente como no boot — e NADA do servidor em memória, que é o ponto.
  const bootSemCarregarODia = () => page.evaluate(() => {
    state.checklist={}; state.abertura={}; state.fechamento={};
    state.iniciadoEm={}; state.concluidoEm={};
    initAllStates();
  });

  // Salva com um servidor de mentira e devolve o que FOI gravado.
  const salvarContra = (servidor) => page.evaluate(async ({ servidor }) => {
    let pl = null; const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async p => { pl = p; return { error:null }; },
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: servidor }) }) }
      : orig(t);
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    return pl;
  }, { servidor });

  const marcados = (grupo, setor) => Object.keys(grupo && grupo[setor] || {})
    .filter(k => /^\d+$/.test(k) && grupo[setor][k] && grupo[setor][k].checked === true).length;

  // ══ 1. O caso do pedido: o dia já marcado no servidor, aparelho recém-aberto ═══════
  // Abertura e Fechamento cheios no servidor, iniciado_em preenchido — o dia bom de
  // São Gonçalo. O aparelho que acabou de abrir não pode levar nada disso.
  // Exatamente o número REAL de itens de cada setor. Com 24 fixos por setor, os índices
  // acima do real existiam só no servidor, não colidiam com vaga nenhuma e sobreviviam por
  // outro caminho — a verificação passava até no app com o defeito. Mutação confirmou.
  const mkCheio = (quantos, val) => {
    const g = {};
    Object.keys(quantos).forEach(s => {
      g[s] = {};
      for (let i = 0; i < quantos[s]; i++) g[s][i] = { checked: val, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' };
    });
    return g;
  };
  const SERV_CHEIO = {
    dinheiro_caixa: 0,
    abertura: mkCheio(SET.qAb, true),
    fechamento: mkCheio(SET.qFe, true),
    iniciado_em: { abertura:'2026-10-27T11:14:00.000Z', checklist:'2026-10-27T16:00:00.000Z', fechamento:'2026-10-28T02:00:00.000Z' },
    concluido_em: { abertura:'2026-10-27T11:20:00.000Z' },
  };

  await bootSemCarregarODia();
  const p1 = await salvarContra(SERV_CHEIO);
  check('aparelho recém-aberto NÃO zera a Abertura que já estava marcada',
    SET.ab.every(s => marcados(p1.abertura, s) === SET.qAb[s]),
    SET.ab.map(s => s + ':' + marcados(p1.abertura, s) + '/' + SET.qAb[s]).join(' '));
  check('nem o Fechamento',
    SET.fe.every(s => marcados(p1.fechamento, s) === SET.qFe[s]),
    SET.fe.map(s => s + ':' + marcados(p1.fechamento, s) + '/' + SET.qFe[s]).join(' '));
  check('o grupo pagamento da Abertura sobrevive junto com os outros (foi o que zerou em 27/10)',
    marcados(p1.abertura, AB1) === SET.qAb[AB1], AB1 + ':' + marcados(p1.abertura, AB1) + '/' + SET.qAb[AB1]);
  // A assinatura dos dias ruins: iniciado_em vazio.
  check('iniciado_em não é apagado pelo aparelho que não tem o dia',
    p1.iniciado_em && p1.iniciado_em.abertura === '2026-10-27T11:14:00.000Z', JSON.stringify(p1.iniciado_em));
  check('e as três horas continuam lá, não só uma',
    p1.iniciado_em && Object.keys(p1.iniciado_em).length === 3, JSON.stringify(p1.iniciado_em));
  check('concluido_em também não é apagado',
    p1.concluido_em && p1.concluido_em.abertura === '2026-10-27T11:20:00.000Z', JSON.stringify(p1.concluido_em));
  // A marca é só de memória: a coluna tem que sair com a mesma forma de sempre.
  check('a marca interna de "não visto" não vai pro banco',
    !/_naoVisto/.test(JSON.stringify([p1.abertura, p1.fechamento, p1.checklist])),
    JSON.stringify(p1.abertura[AB0] && p1.abertura[AB0][0]));

  // ══ 2. O outro lado: DESMARCAR tem que continuar subindo ══════════════════════════
  // Depois que o dia chega do servidor, o item deixa de ser vaga em branco. Se o conserto
  // fosse "servidor sempre vence", a loja não conseguiria mais corrigir um item marcado
  // por engano — e isso é pior que o defeito original.
  await bootSemCarregarODia();
  const p2 = await page.evaluate(async ({ servidor, S }) => {
    mergeState(servidor);                                     // o dia chega do servidor
    const el = { checked: false };
    state.abertura[S][0].checked = true;                      // estava marcado
    toggleCheck('abertura', S, 0, el);                        // a loja DESMARCA
    let pl = null; const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async p => { pl = p; return { error:null }; },
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: servidor }) }) }
      : orig(t);
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    return { gravado: pl.abertura[S][0].checked, vizinho: pl.abertura[S][1].checked };
  }, { servidor: SERV_CHEIO, S: AB0 });
  check('desmarcar um item continua sendo salvo (o false da loja vence)',
    p2.gravado === false, JSON.stringify(p2));
  check('e desmarcar um item não leva o vizinho junto',
    p2.vizinho === true, JSON.stringify(p2));

  // ══ 3. Marcar num aparelho não apaga o que o outro marcou ════════════════════════
  await bootSemCarregarODia();
  const p3 = await page.evaluate(async ({ S, F }) => {
    // Este aparelho marca item 0 da abertura; o servidor tem o item 1 e o fechamento.
    const el = { checked: true };
    toggleCheck('abertura', S, 0, el);
    const servidor = { dinheiro_caixa: 0,
      abertura: { [S]: { 1: { checked:true, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' } } },
      fechamento: { [F]: { 0: { checked:true, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' } } },
      iniciado_em: {}, concluido_em: {} };
    let pl = null; const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async p => { pl = p; return { error:null }; },
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: servidor }) }) }
      : orig(t);
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    return { meu: pl.abertura[S][0].checked, dele: pl.abertura[S][1].checked, fech: pl.fechamento[F][0].checked };
  }, { S: AB0, F: FE0 });
  check('o item marcado NESTE aparelho vai pro servidor', p3.meu === true, JSON.stringify(p3));
  check('e o que o outro aparelho marcou continua marcado', p3.dele === true, JSON.stringify(p3));
  check('inclusive em outro grupo (Fechamento)', p3.fech === true, JSON.stringify(p3));

  // ══ 4. "Não tem reservas hoje": desligar o atalho tem que subir ══════════════════
  // O _semReservas é um booleano dentro do grupo, não um item. No merge antigo o lado
  // local sempre perdia nessa chave, então desligar nunca pegava: o true do servidor
  // voltava no save seguinte e o grupo seguia liberado sem ninguém ter conferido nada.
  const RES = await page.evaluate(() =>
    Object.keys(SETORES_ABERTURA).find(s => SETORES_ABERTURA[s].semReservas) || null);
  if (RES) {
    await bootSemCarregarODia();
    const p4 = await page.evaluate(async ({ R }) => {
      const servidor = { dinheiro_caixa: 0, iniciado_em:{}, concluido_em:{},
        abertura: { [R]: { _semReservas: true,
          0: { checked:true, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' } } } };
      mergeState(servidor);
      toggleSemReservas(false);                    // a loja DESLIGA o atalho
      let pl = null; const orig = sb.from;
      sb.from = t => t === 'checklist_diario'
        ? { upsert: async p => { pl = p; return { error:null }; },
            select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: servidor }) }) }
        : orig(t);
      try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
      return { gravado: pl.abertura[R]._semReservas };
    }, { R: RES });
    check('desligar "não tem reservas hoje" é salvo, não volta a true',
      p4.gravado === false, JSON.stringify(p4));

    await bootSemCarregarODia();
    const p4b = await page.evaluate(async ({ R }) => {
      const servidor = { dinheiro_caixa: 0, iniciado_em:{}, concluido_em:{},
        abertura: { [R]: { _semReservas: true } } };
      let pl = null; const orig = sb.from;   // aparelho SEM o dia: não pode desligar nada
      sb.from = t => t === 'checklist_diario'
        ? { upsert: async p => { pl = p; return { error:null }; },
            select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: servidor }) }) }
        : orig(t);
      try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
      return { gravado: pl.abertura[R]._semReservas };
    }, { R: RES });
    check('e o aparelho que não tem o dia não desliga o atalho por conta própria',
      p4b.gravado === true, JSON.stringify(p4b));
  } else {
    check('grupo com atalho de reservas existe pra ser testado', false, 'nenhum setor com semReservas');
  }

  // ══ 5. Servidor sem nada: a vaga em branco pode ir, é o padrão ═══════════════════
  await bootSemCarregarODia();
  const p5 = await salvarContra({ dinheiro_caixa: 0, iniciado_em:{}, concluido_em:{} });
  check('dia novo no servidor continua sendo criado, com as vagas em branco',
    p5 && p5.abertura && p5.abertura[AB0] && p5.abertura[AB0][0]
      && p5.abertura[AB0][0].checked === false, JSON.stringify(p5 && p5.abertura && p5.abertura[AB0] && p5.abertura[AB0][0]));
  check('e sem a marca interna nele também',
    !/_naoVisto/.test(JSON.stringify(p5.abertura)), JSON.stringify(p5.abertura[AB0][0]));

  // ══ 6. A hora mais antiga continua ganhando, como antes ═════════════════════════
  await bootSemCarregarODia();
  const p6 = await page.evaluate(async () => {
    state.iniciadoEm = { abertura: '2026-10-27T08:10:00.000Z' };   // este aparelho começou antes
    const servidor = { dinheiro_caixa: 0, iniciado_em: { abertura: '2026-10-27T09:00:00.000Z' }, concluido_em: {} };
    let pl = null; const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async p => { pl = p; return { error:null }; },
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: servidor }) }) }
      : orig(t);
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    return pl.iniciado_em;
  });
  check('entre duas horas de início, fica a mais antiga (a daqui)',
    p6.abertura === '2026-10-27T08:10:00.000Z', JSON.stringify(p6));

  // O outro lado da mesma regra: se quem começou antes foi o OUTRO aparelho, é a hora dele
  // que fica. Sem esta, "o local sempre vence" passava — mutação confirmou.
  await bootSemCarregarODia();
  const p6b = await page.evaluate(async () => {
    state.iniciadoEm = { abertura: '2026-10-27T09:00:00.000Z' };   // este aparelho é o atrasado
    const servidor = { dinheiro_caixa: 0, iniciado_em: { abertura: '2026-10-27T08:10:00.000Z' }, concluido_em: {} };
    let pl = null; const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async p => { pl = p; return { error:null }; },
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: servidor }) }) }
      : orig(t);
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    return pl.iniciado_em;
  });
  check('e se quem começou antes foi o outro aparelho, fica a hora dele',
    p6b.abertura === '2026-10-27T08:10:00.000Z', JSON.stringify(p6b));

  // ══ 7. Marcar um item que o servidor tem como desmarcado ════════════════════════
  // O caso que prova que o primeiro toque TIRA a marca de "não visto". Sem isso a vaga
  // continuaria marcada como não vista e o merge devolveria o `false` do servidor —
  // marcar o item na tela não subiria nunca. Mutação confirmou que passava à toa antes.
  await bootSemCarregarODia();
  const p7 = await page.evaluate(async ({ S }) => {
    const servidor = { dinheiro_caixa: 0, iniciado_em:{}, concluido_em:{},
      abertura: { [S]: { 0: { checked:false, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' } } } };
    toggleCheck('abertura', S, 0, { checked: true });     // a loja marca, sem ter o dia carregado
    let pl = null; const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async p => { pl = p; return { error:null }; },
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: servidor }) }) }
      : orig(t);
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    return { gravado: pl.abertura[S][0].checked };
  }, { S: AB0 });
  check('marcar conforme vence o item que o servidor tinha como desmarcado',
    p7.gravado === true, JSON.stringify(p7));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
