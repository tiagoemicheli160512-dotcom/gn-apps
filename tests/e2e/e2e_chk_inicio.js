// "Colocar pra registrar o início de cada seção."
//
// O app já carimbava a hora em que cada seção do check-list FICAVA PRONTA (concluido_em).
// Faltava a hora em que ela COMEÇOU — sem ela não dá pra dizer quanto o check-list leva, e
// foi por isso que a mensagem pra gerência não pôde trazer o número.
//
// O que pode dar errado aqui, e nada disso aparece na tela:
//   1. carimbar o início no RENDER: o resumo roda ao abrir o app com o dia já preenchido, e
//      gravaria a hora em que a pessoa ABRIU o app como se fosse a hora em que começou —
//      todo dia reaberto passaria a "durar" segundos;
//   2. reescrever o carimbo: desmarcar tudo e recomeçar apagaria a hora real de início;
//   3. carimbar em grupo que não é do check-list (supervisão, cozinha), gerando duração
//      de uma coisa que não existe;
//   4. gravar no estado e não mandar pro banco — o número morre no celular.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
// Sem servir a lib do disco, o <script> do CDN falha e todo `let` de topo fica em TDZ:
// o app não termina de carregar e o teste morre esperando uma função que existe.
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof LOJA === 'string' && typeof _marcarInicio === 'function'
        && typeof _marcarConclusao === 'function' && typeof toggleCheck === 'function';
  } catch (e) { return false; } }, { timeout: 25000 });

  const zerar = () => page.evaluate(() => {
    state.iniciadoEm = {}; state.concluidoEm = {};
    state.abertura = {}; state.checklist = {}; state.fechamento = {};
  });

  // ── 1. O toque no primeiro item carimba ────────────────────────────────────────────
  await zerar();
  const um = await page.evaluate(() => {
    const setor = Object.keys(SETORES_ABERTURA)[0];
    const antes = JSON.stringify(state.iniciadoEm);
    toggleCheck('abertura', setor, 0, { checked: true });
    return { antes, depois: state.iniciadoEm.abertura || null, setor };
  });
  check('o primeiro item avaliado carimba o início da seção', um.antes === '{}' && !!um.depois, JSON.stringify(um));
  check('e o carimbo é uma hora ISO de agora',
    !!um.depois && Math.abs(Date.now() - Date.parse(um.depois)) < 60000, um.depois);

  // ── 2. Nunca reescreve ─────────────────────────────────────────────────────────────
  const naoReescreve = await page.evaluate(async () => {
    const setor = Object.keys(SETORES_ABERTURA)[0];
    const primeiro = state.iniciadoEm.abertura;
    await new Promise(r => setTimeout(r, 30));
    toggleCheck('abertura', setor, 0, { checked: false });   // desmarcou
    toggleCheck('abertura', setor, 1, { checked: true });    // marcou outro
    toggleNaoConforme('abertura', setor, 2);                 // e um não conforme
    return { primeiro, agora: state.iniciadoEm.abertura };
  });
  check('desmarcar e recomeçar NÃO apaga a hora em que se começou',
    naoReescreve.primeiro === naoReescreve.agora, JSON.stringify(naoReescreve));

  // ── 3. "Não conforme" também é começar ─────────────────────────────────────────────
  await zerar();
  const porNC = await page.evaluate(() => {
    const setor = Object.keys(SETORES_FECHAMENTO)[0];
    toggleNaoConforme('fechamento', setor, 0);
    return { fechamento: state.iniciadoEm.fechamento || null, abertura: state.iniciadoEm.abertura || null };
  });
  check('marcar um item como não conforme também começa a seção', !!porNC.fechamento, JSON.stringify(porNC));
  check('e carimba SÓ a seção tocada, não as outras', porNC.abertura === null, JSON.stringify(porNC));

  // ── 4. Cada seção tem o seu ────────────────────────────────────────────────────────
  await zerar();
  const tres = await page.evaluate(async () => {
    toggleCheck('abertura', Object.keys(SETORES_ABERTURA)[0], 0, { checked: true });
    await new Promise(r => setTimeout(r, 20));
    toggleCheck('checklist', Object.keys(SETORES_CHECKLIST)[0], 0, { checked: true });
    await new Promise(r => setTimeout(r, 20));
    toggleCheck('fechamento', Object.keys(SETORES_FECHAMENTO)[0], 0, { checked: true });
    return state.iniciadoEm;
  });
  check('as três seções carimbam separado', !!(tres.abertura && tres.checklist && tres.fechamento), JSON.stringify(tres));
  check('e na ordem em que foram tocadas',
    tres.abertura < tres.checklist && tres.checklist < tres.fechamento, JSON.stringify(tres));

  // ── 5. Grupo que não é do check-list não carimba ───────────────────────────────────
  const foraDoEscopo = await page.evaluate(() => {
    const antes = JSON.stringify(state.iniciadoEm);
    const r = _marcarInicio('supervisao') || _marcarInicio('supervisaoCozinha') || _marcarInicio('');
    return { antes, depois: JSON.stringify(state.iniciadoEm), carimbou: r };
  });
  check('supervisão e cozinha não geram carimbo de início',
    foraDoEscopo.carimbou === false && foraDoEscopo.antes === foraDoEscopo.depois, JSON.stringify(foraDoEscopo));

  // ── 6. O QUE MAIS IMPORTA: abrir o app com o dia pronto não carimba ────────────────
  // Se o carimbo morasse no render do resumo, todo dia reaberto passaria a "começar"
  // na hora em que alguém abriu o app — e toda duração viraria segundos.
  const aoAbrir = await page.evaluate(() => {
    state.iniciadoEm = {}; state.concluidoEm = {};
    // O dia chega do servidor inteiro preenchido, como acontece ao reabrir o app.
    Object.keys(SETORES_ABERTURA).forEach(sec => {
      state.abertura[sec] = {};
      SETORES_ABERTURA[sec].items.forEach((_, i) => { state.abertura[sec][i] = { checked: true, naoConforme: false, problema: '', fotoBase64: '', fotoName: '' }; });
    });
    updateSummary();
    updateAberturaCount();
    return { iniciado: state.iniciadoEm.abertura || null, concluido: !!state.concluidoEm.abertura };
  });
  check('abrir o app com a abertura já preenchida NÃO inventa uma hora de início',
    aoAbrir.iniciado === null, JSON.stringify(aoAbrir));
  check('e a hora de CONCLUSÃO continua sendo carimbada pelo resumo, como já era',
    aoAbrir.concluido === true, JSON.stringify(aoAbrir));

  // ── 7. Vai pro banco, e volta ──────────────────────────────────────────────────────
  const gravado = await page.evaluate(async () => {
    state.iniciadoEm = { abertura: '2026-10-25T11:00:00.000Z' };
    state.concluidoEm = { abertura: '2026-10-25T11:18:00.000Z' };
    let payload = null;
    const orig = sb.from;
    sb.from = (t) => t === 'checklist_diario'
      ? { upsert: async (p) => { payload = p; return { error: null }; },
          select: () => ({ eq: function () { return this; }, maybeSingle: async () => ({ data: null }) }) }
      : orig(t);
    try { await saveAll(); } catch (e) {} finally { sb.from = orig; }
    return payload;
  });
  check('o início vai junto no save, ao lado da conclusão',
    !!gravado && gravado.iniciado_em && gravado.iniciado_em.abertura === '2026-10-25T11:00:00.000Z'
      && !!gravado.concluido_em, JSON.stringify(gravado && { i: gravado.iniciado_em, c: gravado.concluido_em }));

  const voltou = await page.evaluate(() => {
    state.iniciadoEm = { abertura: '2026-10-25T11:30:00.000Z' };   // este aparelho começou mais tarde
    mergeState({ iniciado_em: { abertura: '2026-10-25T11:00:00.000Z', checklist: '2026-10-25T14:00:00.000Z' },
                  concluido_em: {} });
    return state.iniciadoEm;
  }).catch(() => null);
  if (voltou) {
    check('quando outro aparelho começou antes, vale a hora mais cedo',
      voltou.abertura === '2026-10-25T11:00:00.000Z', JSON.stringify(voltou));
    check('e uma seção que só o outro aparelho começou entra inteira',
      voltou.checklist === '2026-10-25T14:00:00.000Z', JSON.stringify(voltou));
  } else {
    check('o merge do servidor foi exercitado', false, 'mergeState não respondeu');
  }

  // ── 8. Trocar de dia zera ──────────────────────────────────────────────────────────
  const trocou = await page.evaluate(async () => {
    state.iniciadoEm = { abertura: '2026-10-25T11:00:00.000Z' };
    const sel = document.getElementById('data-select') || { value: '' };
    sel.value = '2026-10-20';
    try { await onDataChange('2026-10-20'); } catch (e) { window.__erroTroca = String(e); }
    return state.iniciadoEm;
  });
  check('trocar o dia zera o carimbo — a hora é de UM dia', JSON.stringify(trocou) === '{}', JSON.stringify(trocou));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log('\n' + CHK);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
