// "Fui fazer uma correção no app pelo celular, na loja de Campo Grande, e não tava salvando,
//  e a loja estava fazendo pelo computador; a informação no app já estava feita e salva,
//  mas ela ainda estava com a informação diferente." — e, perguntado: "Salvei, mas voltou
//  ao antigo." (Check-list, 11/11/2026)
//
// O dia é uma linha só em checklist_diario e saveAll grava a linha inteira. Na mesclagem, o
// que existia dos dois lados ficava com a versão DESTE aparelho. Certo pra quem acabou de
// editar; errado pro computador da loja, que só estava com a tela aberta: a cada tick de
// 30 s ele regravava o valor antigo por cima da correção feita no celular, com "Salvo ✓".
//
// A correção: cada aparelho guarda um retrato do dia da última vez em que esteve igual ao
// servidor, e só regrava o que ELE mudou desde então. Esta suíte faz o papel dos dois
// aparelhos contra um servidor de mentira e cobra:
//   1. o aparelho parado NÃO desfaz a correção do outro (item, despesa, observação, banda);
//   2. o que o aparelho parado editou de verdade continua subindo;
//   3. duas pessoas em itens diferentes do mesmo setor não se atropelam;
//   4. os dois no MESMO campo: vale o deste aparelho, como sempre (regra conhecida);
//   5. despesa apagada no outro aparelho não ressuscita; a nova de cada lado fica;
//   6. a tela do aparelho parado passa a mostrar a correção;
//   7. as vagas em branco do estado local não somem (a tela dependia delas);
//   8. sem retrato (dia nunca carregado), nada muda em relação a antes.
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
  await CAMINHOS.fixarRelogio(ctx, '2026-11-11T15:00:00');
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof saveAll === 'function' && typeof loadSupabaseDay === 'function' && typeof initAllStates === 'function'
        && typeof toggleCheck === 'function' && typeof SETORES_ABERTURA === 'object';
  } catch (e) { return false; } }, null, { timeout: 25000 });

  // Servidor de mentira: UMA linha, a de Campo Grande em 11/11. `window.__srv` é o banco.
  const S0 = await page.evaluate(() => {
    hideLogin(); LOJA = 'Campo Grande'; state.data = '2026-11-11';
    usuarioLogado = { id: 1, nome: 'Thalyta', cargo: 'sub_gerente', loja: 'CAMPO GRANDE' };
    window.__toasts = []; showToast = (m) => window.__toasts.push(String(m));
    const orig = sb.from.bind(sb);
    window.__gravacoes = 0;
    // As colunas de verdade de checklist_diario (information_schema, 12/11/2026).
    window.__COLUNAS_REAIS = 'id,data_operacao,loja,venda_salao,venda_delivery,checklist,faltas,manutencao,updated_at,created_at,faltas_funcionarios,abertura,fechamento,carnes,semana_inicio,semana_fim,supervisao,repique,dinheiro_caixa,despesas,banda,vendas,checklist_pct,retiradas,supervisao_cozinha,entradas_manuais,auditorias_padrao,concluido_em,dia_fechado_em,dia_fechado_por,iniciado_em'.split(',');
    sb.from = t => {
      if (t !== 'checklist_diario') return orig(t);
      const leitura = { eq() { return this; },
        single: async () => ({ data: window.__srv ? JSON.parse(JSON.stringify(window.__srv)) : null, error: window.__srv ? null : { message: 'sem linha' } }),
        maybeSingle: async () => ({ data: window.__srv ? JSON.parse(JSON.stringify(window.__srv)) : null, error: null }) };
      // Igual ao PostgREST: pedir coluna que não existe é erro 42703 na leitura INTEIRA. O
      // servidor de mentira aceitava qualquer coisa, e foi por isso que esta suíte passou com
      // o SELECT pedindo obs_abertura/obs_checklist/obs_fechamento — que não existem. Em
      // produção, saveAll não salvou nada em loja nenhuma de 11 a 12/11/2026.
      return {
        select: (cols) => {
          const ruins = String(cols || '*').split(',').map(c => c.trim()).filter(c => c && c !== '*' && !window.__COLUNAS_REAIS.includes(c));
          if (!ruins.length) return leitura;
          window.__colunaInexistente = ruins;
          const erro = { data: null, error: { code: '42703', message: 'column checklist_diario.' + ruins[0] + ' does not exist' } };
          return { eq() { return this; }, single: async () => erro, maybeSingle: async () => erro };
        },
        upsert: async p => { window.__gravacoes++; window.__srv = Object.assign({}, window.__srv || {}, JSON.parse(JSON.stringify(p))); return { error: null }; },
        update: p => ({ eq() { return this; }, then(res) { window.__srv = Object.assign({}, window.__srv || {}, p); res({ error: null }); } }),
      };
    };
    return Object.keys(SETORES_ABERTURA)[0];
  });

  const item = (checked, problema) => ({ checked, naoConforme: !!problema, problema: problema || '', fotoBase64: '', fotoName: '' });
  // O dia como a loja deixou: item 0 e 1 da Abertura desmarcados, duas despesas, banda errada.
  const semear = () => page.evaluate(({ S0, item0, item1 }) => {
    const n = SETORES_ABERTURA[S0].items.length;
    const sec = {}; for (let i = 0; i < n; i++) sec[i] = { checked: false, naoConforme: false, problema: '', fotoBase64: '', fotoName: '' };
    sec[0] = item0; sec[1] = item1;
    window.__srv = { data_operacao: '2026-11-11', loja: 'Campo Grande', dinheiro_caixa: 0,
      abertura: { [S0]: sec }, checklist: {}, fechamento: {},
      despesas: [{ id: 'd1', categoria: 'gas', nome: 'Gás', valor: 100 }, { id: 'd2', categoria: 'gelo', nome: 'Gelo', valor: 50 }],
      retiradas: [], entradas_manuais: [], faltas: [], faltas_funcionarios: [],
      supervisao: { nota_salao: 7 }, supervisao_cozinha: {}, auditorias_padrao: {},
      banda: { nome: 'TRIO ERRADO', valor: 800, consumo: 0, qtd_couvert: 0 }, vendas: {},
      venda_salao: 0, venda_delivery: 0, repique: 0, iniciado_em: {}, concluido_em: {}, manutencao: [] };
  }, { S0, item0: item(false), item1: item(false) });

  // O COMPUTADOR DA LOJA abre o dia (é o aparelho desta página).
  const lojaAbre = () => page.evaluate(async () => {
    state.checklist = {}; state.abertura = {}; state.fechamento = {}; state.despesas = []; state.iniciadoEm = {}; state.concluidoEm = {};
    initAllStates();
    return await loadSupabaseDay('2026-11-11');
  });
  // O CELULAR corrige direto no banco (outro aparelho: aqui não passa pela memória deste).
  const celular = (fn) => page.evaluate(new Function('S0', 'const r = window.__srv; (' + fn + ')(r, S0);'), S0);
  const lojaSalva = () => page.evaluate(async () => { window.__toasts = []; const ok = await saveAll({ silencioso: true }); return { ok, toasts: window.__toasts }; });
  const banco = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__srv)));

  // ══ 1. O caso do pedido ═════════════════════════════════════════════════════════════
  await semear();
  check('(controle) o computador da loja carrega o dia', await lojaAbre());
  await celular(`(r, S0) => {
    r.abertura[S0][0] = { checked: true, naoConforme: false, problema: '', fotoBase64: '', fotoName: '' };
    r.despesas[0].valor = 180;
    r.banda.nome = 'TRIO CERTO';
    r.supervisao.nota_salao = 9;
  }`);
  // A loja não mexe em nada; o tick de 30 s dispara.
  let r = await lojaSalva();
  let b = await banco();
  check('o salvamento do computador da loja funciona', r.ok === true, JSON.stringify(r));
  check('saveAll só pede ao banco colunas que existem (12/11: obs_* derrubava todo salvamento)',
    !(await page.evaluate(() => window.__colunaInexistente)), JSON.stringify(await page.evaluate(() => window.__colunaInexistente)));
  check('item marcado pelo celular NÃO volta a desmarcado', b.abertura[S0][0].checked === true, JSON.stringify(b.abertura[S0][0]));
  check('valor de despesa corrigido pelo celular NÃO volta ao antigo', b.despesas.find(d => d.id === 'd1').valor === 180, JSON.stringify(b.despesas));
  check('nome da banda corrigido pelo celular fica', b.banda.nome === 'TRIO CERTO', JSON.stringify(b.banda));
  check('nota da supervisão corrigida pelo celular fica', b.supervisao.nota_salao === 9, JSON.stringify(b.supervisao));
  // E a tela da loja acompanha.
  const tela = await page.evaluate((S0) => ({ item: state.abertura[S0][0].checked, desp: state.despesas.find(d => d.id === 'd1').valor,
    banda: state.banda.nome, bandaCampo: (document.getElementById('banda-nome') || {}).value }), S0);
  check('o computador da loja passa a ter a correção em memória', tela.item === true && tela.desp === 180 && tela.banda === 'TRIO CERTO', JSON.stringify(tela));
  check('e a tela mostra a correção (o salvamento redesenha os campos)', tela.bandaCampo === undefined || tela.bandaCampo === 'TRIO CERTO', tela.bandaCampo);
  check('a loja é avisada de que a tela foi atualizada por outro aparelho', r.toasts.some(t => /outro aparelho/.test(t)), r.toasts.join(' | '));
  const vagas = await page.evaluate((S0) => ({ n: Object.keys(state.abertura[S0]).filter(k => /^\d+$/.test(k)).length, esperado: SETORES_ABERTURA[S0].items.length,
    outros: Object.keys(SETORES_ABERTURA).every(s => state.abertura[s] && Object.keys(state.abertura[s]).length >= SETORES_ABERTURA[s].items.length) }), S0);
  check('as vagas em branco do estado local continuam todas lá', vagas.n === vagas.esperado && vagas.outros, JSON.stringify(vagas));
  // Um segundo tick, sem ninguém mexer, não pode mudar nada.
  r = await lojaSalva(); const b2 = await banco();
  check('um segundo salvamento sem edição não muda o banco', JSON.stringify(b2.abertura) === JSON.stringify(b.abertura) && JSON.stringify(b2.despesas) === JSON.stringify(b.despesas) && !r.toasts.some(t => /outro aparelho/.test(t)));

  // ══ 2. O que a loja EDITOU continua subindo ═════════════════════════════════════════
  await semear(); await lojaAbre();
  await page.evaluate((S0) => { toggleCheck('abertura', S0, 1, { checked: true }); state.supervisao = { ...state.supervisao, nota_salao: 4 }; }, S0);
  await celular(`(r, S0) => { r.abertura[S0][0] = { checked: true, naoConforme: true, problema: 'vazando', fotoBase64: '', fotoName: '' }; }`);
  await lojaSalva(); b = await banco();
  check('a loja marca o item 1 e o celular o item 0 do mesmo setor: os dois ficam',
    b.abertura[S0][0].checked === true && b.abertura[S0][0].problema === 'vazando' && b.abertura[S0][1].checked === true, JSON.stringify([b.abertura[S0][0], b.abertura[S0][1]]));
  check('a nota que a loja deu sobe', b.supervisao.nota_salao === 4, JSON.stringify(b.supervisao));

  // ══ 3. DESMARCAR na loja continua funcionando ═══════════════════════════════════════
  await semear();
  await page.evaluate((S0) => { window.__srv.abertura[S0][0].checked = true; }, S0);
  await lojaAbre();
  await page.evaluate((S0) => { toggleCheck('abertura', S0, 0, { checked: false }); }, S0);
  await lojaSalva(); b = await banco();
  check('a loja desmarca um item que estava marcado: sobe desmarcado', b.abertura[S0][0].checked === false, JSON.stringify(b.abertura[S0][0]));

  // ══ 4. Os dois no MESMO campo: vale o deste aparelho (regra de sempre) ═══════════════
  await semear(); await lojaAbre();
  await page.evaluate(() => { state.despesas.find(d => d.id === 'd1').valor = 111; });
  await celular(`(r) => { r.despesas[0].valor = 222; r.despesas[0].nome = 'Gás P45'; }`);
  await lojaSalva(); b = await banco();
  const d1 = b.despesas.find(d => d.id === 'd1');
  check('mesmo campo editado nos dois: fica o deste aparelho', d1.valor === 111, JSON.stringify(d1));
  check('…mas o OUTRO campo da mesma despesa, que só o celular mudou, fica o do celular', d1.nome === 'Gás P45', JSON.stringify(d1));

  // ══ 5. Listas: apagar e incluir dos dois lados ══════════════════════════════════════
  await semear(); await lojaAbre();
  await page.evaluate(() => { state.despesas.push({ id: 'dLoja', categoria: 'outros', nome: 'Da loja', valor: 10 }); });
  await celular(`(r) => { r.despesas = r.despesas.filter(d => d.id !== 'd2'); r.despesas.push({ id: 'dCel', categoria: 'outros', nome: 'Do celular', valor: 20 }); }`);
  await lojaSalva(); b = await banco();
  const ids = b.despesas.map(d => d.id).sort().join(',');
  check('despesa apagada no celular não ressuscita; a nova de cada lado fica', ids === 'd1,dCel,dLoja', ids);
  // A loja apaga uma: não pode voltar do servidor.
  await semear(); await lojaAbre();
  await page.evaluate(() => { state.despesas = state.despesas.filter(d => d.id !== 'd1'); _pendingDelChk.despesas.add('d1'); });
  await lojaSalva(); b = await banco();
  check('despesa apagada na loja continua apagada', !b.despesas.some(d => d.id === 'd1'), JSON.stringify(b.despesas));

  // ══ 6. Sem retrato: comportamento de antes ══════════════════════════════════════════
  await semear();
  await page.evaluate((S0) => { _chkBase = null; state.abertura = {}; initAllStates(); toggleCheck('abertura', S0, 1, { checked: true }); }, S0);
  await celular(`(r, S0) => { r.abertura[S0][0].checked = true; }`);
  r = await lojaSalva(); b = await banco();
  check('sem retrato do dia, o salvamento segue funcionando (vaga em branco não apaga, edição sobe)',
    r.ok === true && b.abertura[S0][0].checked === true && b.abertura[S0][1].checked === true, JSON.stringify([b.abertura[S0][0], b.abertura[S0][1]]));
  // Retrato de OUTRO dia não vale pra este.
  await semear(); await lojaAbre();
  const outroDia = await page.evaluate(() => { state.data = '2026-11-10'; const v = _chkRebasearDia(window.__srv); state.data = '2026-11-11'; return v; });
  check('retrato de um dia não é usado em outro dia', outroDia === false);

  const errosReais = erros.filter(e => !/Failed to fetch|NetworkError|ERR_/i.test(e));
  check('sem erro de JavaScript', errosReais.length === 0, errosReais.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
