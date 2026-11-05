// "Mostrar a duração do check-list na tela."
//
// O app já tinha as duas pontas (iniciado_em desde ontem, concluido_em desde antes), mas a
// tela só mostrava a hora em que a seção FICOU PRONTA. O que pode dar errado, e nada disso
// aparece sozinho na tela:
//
//   1. INVENTAR duração pros 321 dias já gravados. Nenhum deles tem hora de início — a
//      coluna nasceu depois. Qualquer número ali é chute apresentado como medida.
//   2. Início DEPOIS do fim. Acontece de verdade: dia que já estava concluído antes da
//      coluna existir e hoje recebeu um toque → carimba início agora, fim é de antes.
//      Sem trava, a tela mostra duração negativa.
//   3. Congelar o "há 18min" da seção em andamento na hora do último toque — passa a mentir
//      justamente pra quem está olhando pra saber se está demorando.
//   4. Fazer o relógio chamar updateSummary(): ele carimba conclusão e dispara save. Um
//      timer de 30s viraria um save a cada 30s, e pior, carimbaria conclusão sem toque.
//   5. Estourar a largura de 390px e empurrar o x/y do contador pra fora.
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
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof LOJA === 'string' && typeof _selo === 'function'
        && typeof _duracaoTexto === 'function' && typeof _tickDuracoes === 'function'
        && typeof updateSummary === 'function';
  } catch (e) { return false; } }, { timeout: 25000 });

  // ── 1. O formatador, nos degraus que aparecem na operação ──────────────────────────
  const fmt = await page.evaluate(() => {
    const d = (minutos) => _duracaoTexto('2026-10-25T10:00:00.000Z',
      new Date(Date.parse('2026-10-25T10:00:00.000Z') + minutos * 60000).toISOString());
    return { m0: d(0.4), m1: d(1), m18: d(18), m59: d(59), m60: d(60), m80: d(80), m125: d(125), m180: d(180) };
  });
  check('18 minutos lê "18min"', fmt.m18 === '18min', JSON.stringify(fmt));
  check('59 minutos continua em minutos', fmt.m59 === '59min', fmt.m59);
  check('1 hora exata lê "1h", não "1h00"', fmt.m60 === '1h', fmt.m60);
  check('1h20 lê "1h20"', fmt.m80 === '1h20', fmt.m80);
  check('2h05 mantém o zero (não "2h5")', fmt.m125 === '2h05', fmt.m125);
  check('3h exatas lê "3h"', fmt.m180 === '3h', fmt.m180);
  check('menos de um minuto não vira "0min"', fmt.m0 === '<1min', fmt.m0);

  // ── 2. O QUE MAIS IMPORTA: os 321 dias sem hora de início ──────────────────────────
  const semIni = await page.evaluate(() => {
    state.iniciadoEm = {};                                        // como vêm os 321 dias
    state.concluidoEm = { checklist: '2026-10-20T11:18:00.000Z' };
    // Operacional de propósito: é a única seção SEM janela de horário, então o selo é ✅
    // em qualquer fuso. Com 'abertura' o teste passaria a medir o fuso da máquina.
    return { selo: _selo('checklist'), dur: _duracaoTexto(undefined, '2026-10-20T11:18:00.000Z') };
  });
  check('dia sem hora de início NÃO ganha duração inventada', semIni.dur === '', JSON.stringify(semIni));
  check('e o selo dele continua mostrando a hora de conclusão, como antes',
    /\u2705/.test(semIni.selo) && /\d\d:\d\d/.test(semIni.selo) && !/min|\dh/.test(semIni.selo), semIni.selo);

  // ── 3. Com as duas pontas, a duração é medida e aparece no selo ────────────────────
  const duas = await page.evaluate(() => {
    state.iniciadoEm  = { checklist: '2026-10-25T11:00:00.000Z' };
    state.concluidoEm = { checklist: '2026-10-25T11:18:00.000Z' };
    const el = document.createElement('div'); el.innerHTML = _selo('checklist'); document.body.appendChild(el);
    const t = el.textContent; const titulo = el.firstElementChild.getAttribute('title');
    el.remove();
    return { t, titulo };
  });
  check('fechou com as duas pontas: o selo traz a duração ao lado da hora',
    /18min/.test(duas.t) && /\u2705/.test(duas.t), JSON.stringify(duas));
  check('e o título explica que foi quanto levou', /levou 18min/.test(duas.titulo || ''), duas.titulo);

  // ── 4. A conta fecha: o que está na tela é fim menos início ────────────────────────
  const confere = await page.evaluate(() => {
    const casos = [['2026-10-25T09:00:00.000Z','2026-10-25T09:42:00.000Z'],
                   ['2026-10-25T22:30:00.000Z','2026-10-26T01:05:00.000Z'],   // atravessa a meia-noite
                   ['2026-10-25T14:00:00.000Z','2026-10-25T14:00:30.000Z']];
    return casos.map(([i, f]) => {
      state.iniciadoEm = { fechamento: i }; state.concluidoEm = { fechamento: f };
      const el = document.createElement('div'); el.innerHTML = _selo('fechamento');
      const txt = el.textContent;
      const min = Math.round((Date.parse(f) - Date.parse(i)) / 60000);
      return { min, txt };
    });
  });
  check('42 minutos: a tela diz 42min', /42min/.test(confere[0].txt), JSON.stringify(confere[0]));
  check('fechamento que atravessa a meia-noite conta certo (2h35, não negativo)',
    /2h35/.test(confere[1].txt), JSON.stringify(confere[1]));
  check('seção marcada em 30 segundos aparece como "<1min", não como pronta na hora',
    /<1min/.test(confere[2].txt), JSON.stringify(confere[2]));

  // ── 5. Início DEPOIS do fim: cala, não mostra negativo ─────────────────────────────
  const invertido = await page.evaluate(() => {
    // O caso real: dia concluído antes da coluna existir, tocado hoje → início > fim.
    state.iniciadoEm  = { abertura: '2026-10-25T16:00:00.000Z' };
    state.concluidoEm = { abertura: '2026-10-20T11:18:00.000Z' };
    const el = document.createElement('div'); el.innerHTML = _selo('abertura');
    return { txt: el.textContent, dur: _duracaoTexto('2026-10-25T16:00:00.000Z', '2026-10-20T11:18:00.000Z') };
  });
  check('início depois do fim não mostra duração nenhuma', invertido.dur === '', JSON.stringify(invertido));
  check('e nunca aparece um "-" de duração negativa na tela',
    !/-\d/.test(invertido.txt) && !/min|\dh/.test(invertido.txt), invertido.txt);

  // ── 6. Mais de 24h é relógio errado, não check-list de um dia ──────────────────────
  const absurdo = await page.evaluate(() => ({
    h23: _duracaoTexto('2026-10-25T00:00:00.000Z', '2026-10-25T23:00:00.000Z'),
    h25: _duracaoTexto('2026-10-25T00:00:00.000Z', '2026-10-26T01:00:00.000Z'),
    lixo: _duracaoTexto('nao e data', '2026-10-25T11:00:00.000Z'),
  }));
  check('23h ainda é uma duração possível e aparece', absurdo.h23 === '23h', JSON.stringify(absurdo));
  check('mais de 24h numa seção do mesmo dia não é mostrado', absurdo.h25 === '', absurdo.h25);
  check('data corrompida não derruba nem imprime "NaN"', absurdo.lixo === '', absurdo.lixo);

  // ── 7. Em andamento: a duração aparece HOJE, antes de qualquer seção fechar ────────
  const andando = await page.evaluate(() => {
    const ini = new Date(Date.now() - 18 * 60000).toISOString();
    state.iniciadoEm = { checklist: ini }; state.concluidoEm = {};
    const el = document.createElement('div'); el.innerHTML = _selo('checklist'); document.body.appendChild(el);
    const r = { txt: el.textContent, temNo: !!el.querySelector('[data-dur-ini]'),
                titulo: el.firstElementChild.getAttribute('title') };
    el.remove(); return r;
  });
  check('seção começada e ainda aberta JÁ mostra o tempo decorrido',
    /18min/.test(andando.txt), JSON.stringify(andando));
  check('e mostra a hora em que começou junto', /\d\d:\d\d/.test(andando.txt) && /\u23f1/.test(andando.txt), andando.txt);
  check('o título diz que ainda não fechou', /ainda n\u00e3o fechou/.test(andando.titulo || ''), andando.titulo);

  // ── 8. O relógio anda — e NÃO dispara save nem carimba conclusão ───────────────────
  const tick = await page.evaluate(async () => {
    const ini = new Date(Date.now() - 18 * 60000).toISOString();
    state.iniciadoEm = { checklist: ini }; state.concluidoEm = {};
    const el = document.createElement('div'); el.innerHTML = _selo('checklist'); document.body.appendChild(el);
    const antes = el.textContent;
    // Empurra o início 7 minutos pra trás: no próximo tick tem que virar 25min.
    el.querySelector('[data-dur-ini]').setAttribute('data-dur-ini',
      new Date(Date.now() - 25 * 60000).toISOString());
    let salvou = 0; const origSave = window.saveAll; window.saveAll = () => { salvou++; };
    const origDeb = window._debouncedSaveAll; window._debouncedSaveAll = () => { salvou++; };
    _tickDuracoes();
    const depois = el.textContent;
    window.saveAll = origSave; window._debouncedSaveAll = origDeb;
    const r = { antes, depois, salvou, concluiu: Object.keys(state.concluidoEm).length };
    el.remove(); return r;
  });
  check('o tempo decorrido anda sozinho (18min → 25min)',
    /18min/.test(tick.antes) && /25min/.test(tick.depois), JSON.stringify(tick));
  check('o relógio NÃO dispara save', tick.salvou === 0, 'saves: ' + tick.salvou);
  check('e NÃO carimba conclusão sem ninguém ter tocado', tick.concluiu === 0, JSON.stringify(tick));

  // ── 9. Fora da janela também carrega a duração ────────────────────────────────────
  const fora = await page.evaluate(() => {
    state.iniciadoEm  = { abertura: '2026-10-25T21:00:00.000Z' };
    state.concluidoEm = { abertura: '2026-10-25T21:40:00.000Z' };
    const el = document.createElement('div'); el.innerHTML = _selo('abertura');
    return { txt: el.textContent, titulo: el.firstElementChild.getAttribute('title') };
  });
  check('abertura fora do horário mantém o aviso ⏰ e ganha a duração',
    /\u23f0/.test(fora.txt) && /40min/.test(fora.txt), JSON.stringify(fora));
  check('e o título ainda diz que está fora da janela',
    /Fora do hor\u00e1rio/.test(fora.titulo || '') && /levou 40min/.test(fora.titulo || ''), fora.titulo);

  // ── 10. Na tela de verdade, dentro do resumo, sem estourar 390px ──────────────────
  const naTela = await page.evaluate(() => {
    state.iniciadoEm  = { abertura:'2026-10-25T09:00:00.000Z', checklist:'2026-10-25T10:00:00.000Z' };
    state.concluidoEm = { abertura:'2026-10-25T10:25:00.000Z' };
    // Abertura inteira preenchida, pra ela contar como completa no resumo.
    Object.keys(SETORES_ABERTURA).forEach(sec => {
      state.abertura[sec] = {};
      SETORES_ABERTURA[sec].items.forEach((_, i) => { state.abertura[sec][i] = { checked:true, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' }; });
    });
    updateSummary();
    const c = document.getElementById('checklist-summary');
    if(!c) return { erro: 'sem #checklist-summary' };
    const cr = c.getBoundingClientRect();
    let estouro = 0, maxDir = 0;
    c.querySelectorAll('span').forEach(s => {
      const r = s.getBoundingClientRect();
      if(r.width === 0) return;
      maxDir = Math.max(maxDir, r.right);
      if(r.right > cr.right + 0.5) estouro++;
    });
    return { texto: c.textContent.replace(/\s+/g,' ').trim(), estouro,
             sobra: Math.round(cr.right - maxDir), largura: Math.round(cr.width),
             rolaLado: c.scrollWidth > c.clientWidth + 1 };
  });
  check('o resumo na tela traz a duração da abertura concluída',
    /1h25/.test(naTela.texto || ''), JSON.stringify(naTela));
  check('e o tempo decorrido do operacional, que ainda está aberto',
    /\u23f1/.test(naTela.texto || ''), JSON.stringify(naTela));
  check('nada é empurrado pra fora do resumo em 390px', naTela.estouro === 0,
    JSON.stringify(naTela));
  check('e o resumo não passa a rolar de lado', naTela.rolaLado === false, JSON.stringify(naTela));

  // ── 11. O fecho do dia também mostra quanto levou ─────────────────────────────────
  const fecho = await page.evaluate(() => {
    state.iniciadoEm  = { abertura:'2026-10-25T09:00:00.000Z' };
    state.concluidoEm = { abertura:'2026-10-25T10:25:00.000Z' };
    const r = _resumoDoDia();
    const ab = r.linhas.find(l => l.label === 'Abertura');
    let texto = null;
    const origConfirm = window.confirm;
    window.confirm = (m) => { texto = m; return false; };
    try { _fecharDia(); } catch (e) {} finally { window.confirm = origConfirm; }
    return { dur: ab && ab.dur, texto };
  });
  check('_resumoDoDia passa a devolver a duração de cada seção', fecho.dur === '1h25', JSON.stringify(fecho.dur));
  check('e o texto do fecho do dia diz quanto a abertura levou',
    /levou 1h25/.test(fecho.texto || ''), String(fecho.texto || '').slice(0, 200));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log('\n' + CHK);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
