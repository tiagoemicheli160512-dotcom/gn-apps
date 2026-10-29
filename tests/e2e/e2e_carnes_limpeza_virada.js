// "Fazer uma apuração completa na aba Carne, pois os números não estão batendo. Quando
//  consulto a semana anterior, as informações ficam ainda mais erradas. Também existem
//  entradas duplicadas."
//
// Dois defeitos, os dois medidos no banco antes de mexer em código.
//
// ── 1. ENTRADA DUPLICADA ─────────────────────────────────────────────────────────────
// A entrega muda de dia entre uma passada e outra da automação: data_entrega é a data
// PROGRAMADA e validado_em a da conferência na portaria. A automação escreve no dia novo e
// manda limpar o antigo — mas o `''` da limpeza era descartado por
// _mesclarCarnesAntesDeSalvar, que só grava valor não vazio. O valor velho voltava no save
// seguinte e a mesma carne ficava em dois dias, pra sempre.
//
//   Pedreira, semana 19/10: UMA entrega de 60 kg (NF 1225680, programada qua 21/10,
//     conferida qui 22/10) gravada em ent_qua=60 E ent_qui=60.
//   Pedreira, semana 26/10: UMA de 120 kg (NF 3668018, programada ter 27/10, conferida
//     qua 28/10) em ent_ter=120 E ent_qua=120.
//   Na rede: 18 ocorrências de autoEnt = 2x ent, em 7 lojas, desde 05/10.
//
// O mesmo descarte fazia a correção à MÃO não durar: a loja apagava o dia errado e o
// número voltava.
//
// ── 2. SEMANA ANTERIOR PIOR QUE A VIGENTE ────────────────────────────────────────────
// A contagem de 2ª é o fechamento da semana que passou E a abertura da que começa. O bloco
// da virada escrevia `inicial` da semana CARREGADA NA TELA — com uma semana antiga aberta,
// trocava o estoque de abertura dela pela contagem de agora e propagava o fechamento pra
// semana errada. Sobra `inicial` igual a `contagem_final`, e a saída da semana vira
// exatamente o que entrou: número inventado.
//
//   Bangu 19/10: inicial = contagem_final = 92,3 e "saída" de 179,2 — a entrada inteira.
//   Na rede: 79 ocorrências em 8 lojas, desde 13/07.
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
  // Segunda 26/10/2026: a virada da semana 19/10 acontece hoje.
  await CAMINHOS.fixarRelogio(ctx, '2026-10-26T11:00:00');
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof _mesclarCarnesAntesDeSalvar === 'function' && typeof _marcarCarneLimpo === 'function'
        && typeof updateCarneCampo === 'function' && typeof saveAll === 'function'
        && typeof getSegundaFeira === 'function' && Array.isArray(CARNES_DEF);
  } catch (e) { return false; } }, null, { timeout: 25000 });
  await page.evaluate(() => { hideLogin(); LOJA = 'Pedreira'; state.data = '2026-10-26';
    // Cargo que PODE editar entrada à mão — é o caminho da correção manual.
    usuarioLogado = { id:1, nome:'Tiago', cargo:(CARGOS_EDITA_ENTRADA_CARNE||['mestre'])[0], loja:'PEDREIRA' }; });

  const SEG_HOJE = await page.evaluate(() => toISO(getSegundaFeira(new Date())));
  check('o relógio da suíte põe hoje na segunda 26/10', SEG_HOJE === '2026-10-26', SEG_HOJE);

  // ══ 1. A limpeza chega ao servidor — e só quando é intenção ════════════════════════
  const zerar = (semana) => page.evaluate(({ semana }) => {
    stateWeek.semanaInicio = semana;
    stateWeek.carnes = {}; CARNES_DEF.forEach(c => { stateWeek.carnes[c.key] = {}; });
    _carnesLimpos = new Set();
    try { localStorage.removeItem(_carnesLimposKey()); } catch (e) {}
  }, { semana });

  // O caso da Pedreira: o servidor tem a entrega na quarta, a automação resolveu pra
  // quinta. Sem a marca, o 60 da quarta tem que FICAR — é a proteção que impede um
  // aparelho sem o dado de zerar o do outro, e ela continua valendo.
  await zerar('2026-10-19');
  const semMarca = await page.evaluate(() => {
    stateWeek.carnes.carne_sol = { ent_qua: '', ent_qui: '60' };
    const m = _mesclarCarnesAntesDeSalvar({ carne_sol: { ent_qua: '60', ent_qui: '' } });
    return m.carne_sol;
  });
  check('vazio sem marca NÃO apaga o valor do servidor (a proteção continua)',
    semMarca.ent_qua === '60', JSON.stringify(semMarca));
  check('e o valor novo deste aparelho sobe junto',
    semMarca.ent_qui === '60', JSON.stringify(semMarca));

  await zerar('2026-10-19');
  const comMarca = await page.evaluate(() => {
    stateWeek.carnes.carne_sol = { ent_qua: '', ent_qui: '60' };
    _marcarCarneLimpo('carne_sol', 'ent_qua');
    const m = _mesclarCarnesAntesDeSalvar({ carne_sol: { ent_qua: '60', ent_qui: '' } });
    return m.carne_sol;
  });
  check('com a marca, a limpeza da quarta CHEGA ao servidor',
    comMarca.ent_qua === '', JSON.stringify(comMarca));
  check('e a quinta fica com os 60 — a entrega conta uma vez só',
    comMarca.ent_qui === '60', JSON.stringify(comMarca));
  check('a soma da semana passa a ser 60, não 120',
    ['seg','ter','qua','qui','sex','sab','dom']
      .reduce((a, d) => a + (parseFloat(comMarca['ent_' + d]) || 0), 0) === 60,
    JSON.stringify(comMarca));

  // O espelho da automação não pode ficar órfão: sem fonte por trás, ele faria o número
  // digitado passar por valor da automação na passada seguinte.
  await zerar('2026-10-19');
  const espelho = await page.evaluate(() => {
    stateWeek.carnes.carne_sol = { ent_ter: '' };
    _marcarCarneLimpo('carne_sol', 'ent_ter');
    _marcarCarneLimpo('carne_sol', 'autoEnt_ter');
    const m = _mesclarCarnesAntesDeSalvar({ carne_sol: { ent_ter: '120', autoEnt_ter: '120' } });
    return { tem: Object.prototype.hasOwnProperty.call(m.carne_sol, 'autoEnt_ter'), obj: m.carne_sol };
  });
  check('o espelho autoEnt do dia limpo é removido, não zerado',
    espelho.tem === false, JSON.stringify(espelho.obj));

  // ══ 2. Apagar à mão também dura ════════════════════════════════════════════════════
  await zerar('2026-10-19');
  const mao = await page.evaluate(() => {
    stateWeek.carnes.carne_sol = { ent_qua: '60' };
    updateCarneCampo('carne_sol', 'ent_qua', '');          // a loja apaga o dia errado
    const marcado = _carnesLimpos.has('carne_sol|ent_qua');
    const m = _mesclarCarnesAntesDeSalvar({ carne_sol: { ent_qua: '60' } });
    return { marcado, gravado: m.carne_sol.ent_qua };
  });
  check('apagar o dia à mão é registrado como intenção', mao.marcado === true, JSON.stringify(mao));
  check('e a correção da loja não é desfeita pelo servidor', mao.gravado === '', JSON.stringify(mao));

  await zerar('2026-10-19');
  const redigitou = await page.evaluate(() => {
    updateCarneCampo('carne_sol', 'ent_qua', '');
    updateCarneCampo('carne_sol', 'ent_qua', '45');        // mudou de ideia
    const m = _mesclarCarnesAntesDeSalvar({ carne_sol: { ent_qua: '60' } });
    return { marcado: _carnesLimpos.has('carne_sol|ent_qua'), gravado: m.carne_sol.ent_qua };
  });
  check('digitar de novo tira a marca e o valor novo vale',
    redigitou.marcado === false && redigitou.gravado === '45', JSON.stringify(redigitou));

  // O registro é por semana: marca de uma semana não pode apagar campo de outra.
  await zerar('2026-10-19');
  const outraSemana = await page.evaluate(() => {
    _marcarCarneLimpo('carne_sol', 'ent_qua');
    applySemana('2026-10-26', '2026-11-01');               // troca de semana
    return { marcas: [..._carnesLimpos] };
  });
  check('trocar de semana não leva a marca de limpeza da outra',
    outraSemana.marcas.length === 0, JSON.stringify(outraSemana));

  // ══ 2b. A AUTOMAÇÃO marcando a limpeza — o caminho que produz as duplicatas ════════
  // O caso exato da Pedreira: ent_ter=120 gravado quando a entrega estava só programada
  // (terça), e a conferência na portaria caindo na quarta. A automação tem que escrever a
  // quarta E registrar a limpeza da terça — sem o registro, o 120 da terça volta no save e
  // a mesma carne fica nos dois dias. Mutação confirmou que o resto da suíte não cobria
  // este ramo: tirar o _marcarCarneLimpo da automação passava sem falhar nada.
  const auto = await page.evaluate(async () => {
    state.semanaInicio = '2026-10-26'; state.semanaFim = '2026-11-01';
    stateWeek.semanaInicio = '2026-10-26';
    stateWeek.carnes = {}; CARNES_DEF.forEach(c => { stateWeek.carnes[c.key] = {}; });
    // O estado de ANTES: a automação já tinha posto a entrega na terça.
    stateWeek.carnes.carne_sol = { ent_ter: '120', autoEnt_ter: '120' };
    _carnesLimpos = new Set();
    const CAT = '00000000-0000-0000-0000-000000000207';
    // O gancho é o cache do módulo, não a função: `window._resolverCarnesCatalogoIds = ...`
    // não substitui uma `function` de topo (a mesma armadilha do window.masterLoja).
    _carnesCatalogoIds = { 207: CAT, 209: 'x209', 392: 'x392', 237: 'x237' };
    // Thenable que responde a qualquer encadeamento (.eq/.in/.gte/.lte/.order/.limit) e
    // resolve com o payload no await — as consultas da automação variam de forma.
    const resp = (data) => { const o = { data, error: null };
      const p = { then: (f, r) => Promise.resolve(o).then(f, r) };
      ['eq','in','gte','lte','order','limit','select','maybeSingle','single'].forEach(m => { p[m] = () => p; });
      p.maybeSingle = async () => o; p.single = async () => o;
      return p; };
    const orig = sb.from;
    sb.from = t => {
      if (t === 'gn_provisoes') return { select: () => resp([ { catalogo_id: CAT, data_entrega: '2026-10-27',
        // conferida na QUARTA: é validado_em que decide o dia real
        gn_recebimentos: [ { qtd_recebida: 120, nota_numero: '3668018', validado_em: '2026-10-28T18:17:09Z' } ] } ]) };
      if (t === 'checklist_carnes') return { upsert: async () => ({ error:null }), select: () => resp(null) };
      if (t === 'checklist_diario') return { upsert: async () => ({ error:null }),
        select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data:{ dinheiro_caixa:0 } }) }) };
      if (t === 'gn_lojas') return { select: () => resp([{ all_data: {} }]) };
      return { select: () => resp([]), upsert: async () => ({ error:null }) };   // contagens, notas
    };
    try { await _carregarCarnesAutoLojas(false); } finally { sb.from = orig; }
    const cd = stateWeek.carnes.carne_sol;
    const merged = _mesclarCarnesAntesDeSalvar({ carne_sol: { ent_ter: '120', autoEnt_ter: '120' } });
    return { ent_ter: cd.ent_ter, ent_qua: cd.ent_qua, marcas: [..._carnesLimpos],
             gravado_ter: merged.carne_sol.ent_ter, gravado_qua: merged.carne_sol.ent_qua,
             soma: ['seg','ter','qua','qui','sex','sab','dom']
               .reduce((a, d) => a + (parseFloat(merged.carne_sol['ent_' + d]) || 0), 0) };
  });
  check('a automação põe a entrega no dia da conferência (quarta)',
    Number(auto.ent_qua) === 120, JSON.stringify(auto));
  check('e registra a limpeza do dia antigo (terça)',
    auto.marcas.includes('carne_sol|ent_ter'), JSON.stringify(auto.marcas));
  check('então o que vai pro servidor NÃO tem a terça',
    auto.gravado_ter === '', JSON.stringify(auto));
  check('e a semana soma 120, não 240 — a entrega conta uma vez',
    auto.soma === 120, JSON.stringify(auto));

  // ══ 3. A virada da semana só roda na semana corrente ═══════════════════════════════
  // Isto é o que produziu as 79 linhas com inicial = contagem_final.
  const virar = (semanaCarregada) => page.evaluate(async ({ semanaCarregada }) => {
    stateWeek.semanaInicio = semanaCarregada;
    stateWeek.carnes = {}; CARNES_DEF.forEach(c => { stateWeek.carnes[c.key] = {}; });
    // Semana com abertura e entradas próprias, e a contagem de 2ª recém-lançada.
    stateWeek.carnes.carne_sol = { inicial: '204.6', ent_qua: '53.06', contagem_final: '140.85' };
    _carnesLimpos = new Set();
    const upserts = []; const orig = sb.from;
    sb.from = t => {
      if (t === 'checklist_carnes') return {
        upsert: async p => { upserts.push(JSON.parse(JSON.stringify(p))); return { error:null }; },
        select: () => ({ eq: function(){ return this; },
          single: async () => ({ data: { carnes: { carne_sol: { inicial:'300', contagem_final:'' } }, semana_fim:'2026-10-18' } }) }),
      };
      if (t === 'checklist_diario') return {
        upsert: async () => ({ error:null }),
        select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: { dinheiro_caixa: 0 } }) }),
      };
      return orig(t);
    };
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    return { upserts, estado: stateWeek.carnes.carne_sol };
  }, { semanaCarregada });

  const corrente = await virar('2026-10-26');
  const ultimoDaSemana = (ups, semana) => {
    const meus = ups.filter(u => u.semana_inicio === semana);
    return meus.length ? meus[meus.length - 1] : null;
  };
  const uC = ultimoDaSemana(corrente.upserts, '2026-10-26');
  check('na semana corrente, a contagem de 2ª vira o estoque inicial',
    uC && uC.carnes.carne_sol.inicial === '140.85', JSON.stringify(uC && uC.carnes.carne_sol));
  check('e a contagem_final da semana corrente é limpa (ela vem na 2ª seguinte)',
    uC && uC.carnes.carne_sol.contagem_final === '', JSON.stringify(uC && uC.carnes.carne_sol));
  const uAnt = ultimoDaSemana(corrente.upserts, '2026-10-19');
  check('e a semana anterior recebe a contagem como fechamento dela',
    uAnt && uAnt.carnes.carne_sol.contagem_final === '140.85', JSON.stringify(uAnt && uAnt.carnes.carne_sol));
  check('sem mexer no estoque inicial da semana anterior',
    uAnt && uAnt.carnes.carne_sol.inicial === '300', JSON.stringify(uAnt && uAnt.carnes.carne_sol));

  // O caso do defeito: a tela está numa semana ANTIGA.
  const antiga = await virar('2026-10-19');
  const uA = ultimoDaSemana(antiga.upserts, '2026-10-19');
  check('com uma semana ANTIGA na tela, o estoque inicial dela não é trocado',
    uA && uA.carnes.carne_sol.inicial === '204.6', JSON.stringify(uA && uA.carnes.carne_sol));
  check('a contagem lançada continua gravada, não se perde',
    uA && uA.carnes.carne_sol.contagem_final === '140.85', JSON.stringify(uA && uA.carnes.carne_sol));
  check('e nada é propagado pra semana de antes dela',
    !antiga.upserts.some(u => u.semana_inicio === '2026-10-12'),
    JSON.stringify(antiga.upserts.map(u => u.semana_inicio)));
  // O que o defeito produzia: inicial igual a contagem_final.
  check('não sobra inicial igual a contagem_final (a assinatura do defeito)',
    !(uA && uA.carnes.carne_sol.inicial === uA.carnes.carne_sol.contagem_final),
    JSON.stringify(uA && uA.carnes.carne_sol));

  // ══ 4. O registro se encerra quando o servidor confirma ═══════════════════════════
  const encerra = await page.evaluate(async () => {
    stateWeek.semanaInicio = '2026-10-26';
    stateWeek.carnes = {}; CARNES_DEF.forEach(c => { stateWeek.carnes[c.key] = {}; });
    stateWeek.carnes.carne_sol = { inicial: '10', ent_qua: '' };
    _carnesLimpos = new Set(); _marcarCarneLimpo('carne_sol', 'ent_qua');
    const antes = _carnesLimpos.size;
    const orig = sb.from;
    sb.from = t => {
      if (t === 'checklist_carnes') return { upsert: async () => ({ error:null }),
        select: () => ({ eq: function(){ return this; }, single: async () => ({ data:null }) }) };
      if (t === 'checklist_diario') return { upsert: async () => ({ error:null }),
        select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data:{ dinheiro_caixa:0 } }) }) };
      return orig(t);
    };
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    return { antes, depois: _carnesLimpos.size };
  });
  check('a marca existe antes de salvar', encerra.antes === 1, JSON.stringify(encerra));
  check('e é encerrada quando o servidor confirma', encerra.depois === 0, JSON.stringify(encerra));

  const falhaDeRede = await page.evaluate(async () => {
    stateWeek.semanaInicio = '2026-10-26';
    stateWeek.carnes = {}; CARNES_DEF.forEach(c => { stateWeek.carnes[c.key] = {}; });
    stateWeek.carnes.carne_sol = { inicial: '10', ent_qua: '' };
    _carnesLimpos = new Set(); _marcarCarneLimpo('carne_sol', 'ent_qua');
    const orig = sb.from;
    sb.from = t => {
      if (t === 'checklist_carnes') return { upsert: async () => ({ error: new Error('rede') }),
        select: () => ({ eq: function(){ return this; }, single: async () => ({ data:null }) }) };
      if (t === 'checklist_diario') return { upsert: async () => ({ error:null }),
        select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data:{ dinheiro_caixa:0 } }) }) };
      return orig(t);
    };
    try { await saveAll({ silencioso:true }); } catch (e) {} finally { sb.from = orig; }
    return _carnesLimpos.size;
  });
  check('numa falha de rede a marca CONTINUA, senão o valor apagado ressuscita',
    falhaDeRede === 1, String(falhaDeRede));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
