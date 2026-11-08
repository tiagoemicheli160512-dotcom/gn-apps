// "Nova América, passou que um funcionário Ismael foi excluído, não tá na aba dados do
//  check-list em funcionários, pode verificar o que pode ter ocorrido."
//
// O que aconteceu (medido no banco): em 05/10/2026 18:15 o garçom ESMAEL DA SILVA ATAIDE
// foi excluído da escala da S40 pelo app Gorjetas. Ele continuou trabalhando — as notas de
// 10% dele seguiram entrando no Caixa quase todo dia até 02/11 — e ficou quatro semanas
// fora do rateio. A confirmação era só "toque de novo": nada na tela dizia que aquela
// pessoa tinha trabalhado ontem, nem perguntava por que ela estava saindo.
//
// O pedido do dono: "Confirmar exclusão com motivo". Esta suíte cobra, nos dois apps que
// excluem (Gorjetas e Check-list):
//   1. excluir abre um diálogo e NÃO exclui sozinho;
//   2. o botão Excluir só libera depois de escolher o motivo;
//   3. o diálogo mostra os últimos dias com presença na escala e as últimas notas de 10%;
//   4. nota de 10% depois do último dia de escala acende o alerta (o caso do Esmael);
//   5. Cancelar não mexe em nada;
//   6. confirmar grava o motivo na vaga e na auditoria.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const COM = process.env.ARQ_COM || CAMINHOS.pub('gn-comissoes.html');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const NOME = 'ESMAEL DA SILVA ATAIDE';
const mk = (nome, i, dias) => ({ id: i, nome, tipo: 'CLT / MENSALISTA', setor: 'Salão',
  turno: 'NOITE', horario: '16:00-00:00', dias: dias || Array(7).fill('PRESENTE'), turnos: Array(7).fill(null) });
// Quinta 29/10/2026 = índice 42 (S44). Na S43 (índice 41, 19–25/10) ele trabalhou com folga
// na terça; na S44 a escala o deixou de folga a semana toda — e o Caixa tem nota dele na
// quarta 28/10. É a escala dizendo uma coisa e o Caixa outra.
const ALL = {
  '41': { funcs: [mk('ANA PAULA', 0), mk(NOME, 1, ['PRESENTE','FOLGA','PRESENTE','PRESENTE','PRESENTE','PRESENTE','PRESENTE'])],
          brutos: [500, 500, 500, 500, 900, 1500, 1500], dist: 'SIM', saidas: [], _lastEdit: 1793213249950 },
  '42': { funcs: [mk('ANA PAULA', 0), mk(NOME, 1, Array(7).fill('FOLGA'))],
          brutos: [400, 400, 400, 0, 0, 0, 0], dist: 'SIM', saidas: [], _lastEdit: 1793213249951 },
};
const CAIXA = [
  { data: '2026-10-28', gn_caixa_gorjeta: [{ garcom: 'ESMAEL' }, { garcom: 'ANA' }] },
  { data: '2026-10-27', gn_caixa_gorjeta: [{ garcom: 'ANA' }] },
  { data: '2026-10-24', gn_caixa_gorjeta: [{ garcom: 'Esmael' }] },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 360, height: 780 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-29T12:00:00');
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  const auditoria = [], caixaLojas = [];
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (/gn_caixa_fechamento/.test(u)) {
      caixaLojas.push(decodeURIComponent((u.match(/loja=eq\.([^&]+)/) || [])[1] || ''));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAIXA) });
    }
    if (/gn_comissoes_auditoria/.test(u) && r.request().method() === 'POST') auditoria.push(r.request().postDataJSON());
    if (/gn_comissoes\?/.test(u) && r.request().method() === 'GET')
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ all_data: ALL }]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const erros = [];

  // ══ A. App Gorjetas ═══════════════════════════════════════════════════════════════
  const page = await ctx.newPage();
  page.on('pageerror', e => erros.push('COM: ' + String(e.message || e)));
  await page.addInitScript(({ allData }) => {
    try {
      localStorage.setItem('gn_session_v1', JSON.stringify({ id: 1, nome: 'Renata', cargo: 'gerente',
        loja: 'RANCHO', permissoes: { master: true, comissoes: true }, ts: Date.now() }));
      localStorage.setItem('gn_RANCHO_usuario', JSON.stringify('Renata'));
      localStorage.setItem('gn_RANCHO_allData', JSON.stringify(allData));
      localStorage.setItem('gn_aviso_guia_v1', '1');
    } catch (e) {}
  }, { allData: ALL });
  await page.goto('file://' + COM);
  await page.waitForFunction(() => { try {
    return typeof removerFuncionario === 'function' && LOJA === 'RANCHO' && state.semIdx === 42
      && Object.keys(state.allData || {}).length > 0; } catch (e) { return false; } }, null, { timeout: 25000 });

  const slot = () => page.evaluate(() => { const f = getWD(42).funcs[1]; return { nome: f.nome, motivo: f._removidoMotivo, rem: f._removidoNome }; });
  await page.evaluate(() => removerFuncionario(1, null));
  await page.waitForSelector('#gn-exclusao-func');
  check('Gorjetas: excluir abre o diálogo em vez de excluir direto', (await slot()).nome === NOME, JSON.stringify(await slot()));
  check('o botão Excluir começa travado (sem motivo, não exclui)',
    await page.$eval('[data-exc="confirmar"]', b => b.disabled));
  check('oferece os três motivos combinados',
    (await page.$$eval('input[name="gn-exc-motivo"]', rs => rs.map(r => r.value).join(','))) === 'DEMISSAO,TRANSFERENCIA,ERRO_CADASTRO');
  await page.waitForFunction(() => !/consultando/.test(document.querySelector('#gn-exclusao-func').textContent));
  const esc = await page.$eval('[data-exc="escala"]', e => e.textContent.trim());
  check('mostra os últimos dias de escala (domingo 25/10 pra trás, pulando a folga)',
    /^dom 25\/10 · sáb 24\/10 · sex 23\/10 · qui 22\/10 · qua 21\/10$/.test(esc), esc);
  const cx = await page.$eval('[data-exc="caixa"]', e => e.textContent.trim());
  check('mostra as notas de 10% do Caixa pelo primeiro nome (sem pegar a da ANA)',
    cx === 'qua 28/10 · sáb 24/10', cx);
  check('consulta o Caixa com a chave de loja do Caixa (userKey)', caixaLojas.includes('RANCHO'), caixaLojas.join(','));
  const al = await page.$eval('[data-exc="alerta"]', e => e.offsetParent ? e.textContent : '');
  check('nota de 10% depois do último dia de escala acende o alerta', /28\/10/.test(al), al);
  const larg = await page.evaluate(() => document.documentElement.scrollWidth);
  check('o diálogo cabe em 360 px sem rolagem de lado', larg <= 360, larg);

  await page.click('[data-exc="cancelar"]');
  check('Cancelar fecha e não exclui ninguém',
    !(await page.$('#gn-exclusao-func')) && (await slot()).nome === NOME && auditoria.length === 0);

  await page.evaluate(() => removerFuncionario(1, null));
  await page.waitForSelector('#gn-exclusao-func');
  await page.check('input[value="DEMISSAO"]');
  check('escolher o motivo libera o botão', !(await page.$eval('[data-exc="confirmar"]', b => b.disabled)));
  await page.click('[data-exc="confirmar"]');
  await page.waitForFunction(() => !getWD(42).funcs[1].nome);
  const s = await slot();
  check('confirmar exclui e grava o motivo na vaga', s.nome === '' && s.rem === NOME && s.motivo === 'DEMISSAO', JSON.stringify(s));
  await page.waitForFunction(() => true);
  for (let t = 0; t < 30 && !auditoria.length; t++) await page.waitForTimeout(100);
  const a = auditoria.find(x => x.acao === 'EXCLUIR_FUNCIONARIO');
  check('a auditoria registra o motivo junto do nome e da semana',
    a && a.detalhes && a.detalhes.nome === NOME && a.detalhes.motivo === 'DEMISSAO' && a.detalhes.semana === 'S44', JSON.stringify(a));
  const txtAud = await page.evaluate(() => _fmtDetalhesAuditoriaCom('EXCLUIR_FUNCIONARIO', { nome: 'X', semana: 'S44', motivo: 'TRANSFERENCIA' }));
  check('a aba Auditoria mostra o motivo por extenso', txtAud === 'X — S44 — Transferência de loja', txtAud);
  check('a semana passada não é tocada', await page.evaluate(n => getWD(41).funcs[1].nome === n, NOME));

  // ══ B. App Check-list ═════════════════════════════════════════════════════════════
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => erros.push('CHK: ' + String(e.message || e)));
  await p2.goto('file://' + CHK);
  await p2.waitForFunction(() => { try { return typeof removeComissoesFunc === 'function'
    && typeof comissoesLojaKey === 'function' && typeof hideLogin === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  const r = await p2.evaluate(({ ALL }) => {
    hideLogin(); LOJA = 'Rancho';
    usuarioLogado = { id: 1, nome: 'Renata', cargo: 'gerente', loja: 'RANCHO' };
    comissoesWeekIdx = 42;
    comissoesWD = JSON.parse(JSON.stringify(ALL['42']));
    window._audChk = [];
    _logAuditoriaChk = async (acao, d) => { window._audChk.push({ acao, d }); };
    flushComissoesOps = async () => {};
    renderComissoesFuncs = () => {};
    return comissoesLojaKey();
  }, { ALL });
  check('Check-list: a loja de teste resolve pra RANCHO', r === 'RANCHO', r);
  await p2.evaluate(() => removeComissoesFunc(1, null));
  await p2.waitForSelector('#gn-exclusao-func');
  check('Check-list: excluir abre o mesmo diálogo e não exclui direto',
    await p2.evaluate(n => comissoesWD.funcs[1].nome === n, NOME));
  await p2.waitForFunction(() => !/consultando/.test(document.querySelector('#gn-exclusao-func').textContent));
  const esc2 = await p2.$eval('[data-exc="escala"]', e => e.textContent.trim());
  check('Check-list: busca as semanas anteriores pra mostrar os últimos dias de escala',
    /^dom 25\/10/.test(esc2), esc2);
  check('Check-list: também acende o alerta da nota de 10%',
    /28\/10/.test(await p2.$eval('[data-exc="alerta"]', e => e.textContent)));
  await p2.check('input[value="ERRO_CADASTRO"]');
  await p2.click('[data-exc="confirmar"]');
  await p2.waitForFunction(() => !comissoesWD.funcs[1].nome);
  const s2 = await p2.evaluate(() => ({ f: comissoesWD.funcs[1], aud: window._audChk }));
  check('Check-list: confirmar grava o motivo na vaga',
    s2.f._removidoMotivo === 'ERRO_CADASTRO' && s2.f._removidoNome === NOME, JSON.stringify(s2.f));
  check('Check-list: a exclusão agora entra na auditoria do Check-list, com o motivo',
    s2.aud.some(x => x.acao === 'EXCLUIR_FUNCIONARIO' && x.d.nome === NOME && x.d.motivo === 'ERRO_CADASTRO' && x.d.semana === 'S44'),
    JSON.stringify(s2.aud));
  const txt2 = await p2.evaluate(() => _formatarDetalhesAuditoriaChk('EXCLUIR_FUNCIONARIO', { nome: 'X', semana: 'S44', motivo: 'DEMISSAO' }));
  check('Check-list: o histórico de auditoria mostra o motivo', txt2 === 'X — S44 — Demissão', txt2);

  const errosReais = erros.filter(e => !/Failed to fetch|NetworkError|ERR_|supabase/i.test(e));
  check('sem erro de JavaScript nas duas telas', errosReais.length === 0, errosReais.join(' | '));

  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
