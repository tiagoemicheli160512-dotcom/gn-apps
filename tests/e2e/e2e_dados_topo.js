// "Ao clicar onde desejo, tipo a aba Dados, eu sinto que fica muita informação num lugar
//  só. Fizemos uma remodelação no Home das lojas e ficou excelente." (11/11/2026)
//
// Medido com os dados reais de Campo Grande, em 390 px: a aba Dados tinha 4.606 px (cinco
// telas e meia) e 12 blocos. Fase 1 — só o topo: a data virou uma linha com setas, os
// quatro valores que vêm do Caixa viraram uma grade de leitura, o total deixou de aparecer
// duas vezes, o Progresso subiu pra junto do "O que falta hoje" e documento em branco não
// é mais desenhado.
//
// É a tela mais usada pelas lojas, então esta suíte cobra mais o que NÃO pode mudar do que
// o que mudou:
//   1. todos os campos de antes continuam existindo, uma vez só, com o mesmo id;
//   2. calcTotal, a carga do dia e a troca de dia continuam escrevendo neles;
//   3. as setas ‹ › e "Hoje" trocam o dia pelo mesmo onDataChange, e não passam de hoje;
//   4. a semana continua editável (dentro de "mudar");
//   5. documento em branco some da tela mas continua salvo; o recém-criado aparece;
//   6. cabe em 320 px sem rolagem de lado, e o topo ficou menor.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-11T15:00:00');
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof saveAll === 'function' && typeof calcTotal === 'function' && typeof restoreUI === 'function' && typeof onDataChange === 'function';
  } catch (e) { return false; } }, null, { timeout: 25000 });
  await page.evaluate(() => { hideLogin(); LOJA = 'Campo Grande'; state.data = '2026-11-11';
    usuarioLogado = { id: 1, nome: 'Thalyta', cargo: 'sub_gerente', loja: 'CAMPO GRANDE' };
    document.querySelectorAll('body > div').forEach(d => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && parseInt(cs.zIndex) >= 900) d.style.display = 'none'; });
    initAllStates(); restoreUI(); });

  // ══ 1. Nada sumiu, nada duplicou ════════════════════════════════════════════════════
  const IDS = ['display-total', 'fat-total', 'falta-hoje-card', 'data-dia-atual', 'semana-inicio', 'semana-fim', 'semana-label',
    'venda-salao', 'venda-delivery', 'repique-valor', 'repique-sync-msg', 'dinheiro-caixa', 'checklist-summary', 'checklist-status-badge',
    'card-fotos-dia', 'docs-lista', 'dados-banda-card', 'fat-semanal-container', 'meta-semanal-input', 'datas-especiais-dados-card'];
  const cont = await page.evaluate(ids => Object.fromEntries(ids.map(id => [id, document.querySelectorAll('#tab-dados #' + id).length])), IDS);
  check('todos os campos de antes continuam na aba Dados, uma vez só cada', IDS.every(id => cont[id] === 1), JSON.stringify(cont));
  check('os quatro valores continuam sendo campos numéricos só de leitura',
    await page.evaluate(() => ['venda-salao', 'venda-delivery', 'repique-valor', 'dinheiro-caixa'].every(id => { const e = document.getElementById(id); return e.tagName === 'INPUT' && e.type === 'number' && e.readOnly; })));

  // ══ 2. As contas de antes continuam escrevendo ali ══════════════════════════════════
  const t = await page.evaluate(() => {
    state.vendaSalao = 1165.14; state.vendaDelivery = 610.25; state.repique = 89.71; state.dinheiroCaixa = 57.91;
    restoreUI();
    return { salao: document.getElementById('venda-salao').value, del: document.getElementById('venda-delivery').value,
      rep: document.getElementById('repique-valor').value, cx: document.getElementById('dinheiro-caixa').value,
      total: document.getElementById('display-total').textContent, total2: document.getElementById('fat-total').textContent,
      total2Visivel: document.getElementById('fat-total').offsetParent !== null, campoData: document.getElementById('data-dia-atual').value };
  });
  check('a carga do dia preenche os quatro valores', t.salao === '1165.14' && t.del === '610.25' && t.rep === '89.71' && t.cx === '57.91', JSON.stringify(t));
  check('o total soma salão + delivery (sem o repique)', /1\.775,39/.test(t.total), t.total);
  check('o total aparece uma vez só na tela (o segundo fica escondido, mas atualizado)', !t.total2Visivel && /1\.775,39/.test(t.total2), JSON.stringify(t));
  check('o campo de data mostra o dia do check-list', t.campoData === '2026-11-11', t.campoData);
  const prog = await page.evaluate(() => { updateSummary(); const c = document.getElementById('checklist-summary'); return { n: c.children.length, txt: c.innerText.replace(/\s+/g, ' ') }; });
  check('o progresso mostra os três grupos', prog.n === 3 && /Abertura/.test(prog.txt) && /Operacional/.test(prog.txt) && /Fechamento/.test(prog.txt), prog.txt);
  const ordem = await page.evaluate(() => { const y = s => document.querySelector(s).getBoundingClientRect().top;
    return y('.dados-data-linha') < y('#falta-hoje-card') && y('#falta-hoje-card') <= y('.dados-prog') && y('.dados-prog') < y('.dados-hoje') && y('.dados-hoje') < y('#card-fotos-dia'); });
  check('ordem do topo: data → o que falta hoje → progresso → faturamento', ordem);

  // ══ 3. Setas de dia ════════════════════════════════════════════════════════════════
  const chamadas = await page.evaluate(async () => {
    const reg = []; const orig = onDataChange;
    onDataChange = async v => { reg.push(v); state.data = v; restoreUI(); };
    const st = () => ({ prox: document.getElementById('dados-dia-prox').disabled, hoje: document.getElementById('dados-dia-hoje').style.display, campo: document.getElementById('data-dia-atual').value });
    const a0 = st();
    document.getElementById('dados-dia-prox').click(); _dadosDiaPasso(1);          // em hoje: não vai pra amanhã
    const n0 = reg.length;
    document.querySelector('.dados-data-linha .dados-data-btn').click();            // ‹
    const a1 = st();
    _dadosDiaPasso(-1); const a2 = st();
    document.getElementById('dados-dia-prox').click(); const a3 = st();             // ›
    document.getElementById('dados-dia-hoje').click(); const a4 = st();             // Hoje
    onDataChange = orig;
    return { reg, n0, a0, a1, a2, a3, a4 };
  });
  check('em hoje, a seta › fica travada e "Hoje" não aparece', chamadas.a0.prox === true && chamadas.a0.hoje === 'none' && chamadas.n0 === 0, JSON.stringify(chamadas.a0) + ' n=' + chamadas.n0);
  check('‹ abre o dia anterior pelo onDataChange', chamadas.reg[0] === '2026-11-10' && chamadas.a1.campo === '2026-11-10' && chamadas.a1.prox === false && chamadas.a1.hoje === '', JSON.stringify(chamadas));
  check('‹ de novo volta mais um dia; › avança; "Hoje" volta pra hoje',
    chamadas.reg.join(',') === '2026-11-10,2026-11-09,2026-11-10,2026-11-11' && chamadas.a4.campo === '2026-11-11' && chamadas.a4.prox === true, chamadas.reg.join(','));
  check('o campo de data continua sem deixar escolher dia futuro (max = hoje)', await page.evaluate(() => document.getElementById('data-dia-atual').max === '2026-11-11'));

  // ══ 4. Semana ══════════════════════════════════════════════════════════════════════
  // checkVisibility, e não offsetParent/altura: o conteúdo de um <details> fechado mantém os dois.
  const sem = await page.evaluate(() => { const d = document.querySelector('.dados-semana'); const alt = () => document.getElementById('semana-inicio').checkVisibility();
    const antes = alt(); d.open = true; const depois = alt();
    const r = { antes, depois, rotulo: document.getElementById('semana-label').getBoundingClientRect().height > 0,
      botao: !!d.querySelector('button[onclick="setSemanaAtual()"]'), largAberta: document.documentElement.scrollWidth };
    d.open = false; return r; });
  check('com "mudar semana" aberto, a tela não estoura os 320 px', sem.largAberta <= 320, sem.largAberta);
  check('a semana aparece numa linha; os campos de mudar ficam recolhidos e abrem no toque', !sem.antes && sem.depois && sem.rotulo && sem.botao, JSON.stringify(sem));

  // ══ 5. Documentos em branco ════════════════════════════════════════════════════════
  const docs = await page.evaluate(() => {
    saveDocs = async () => {}; _persistirDocs = () => {};
    _docs = [{ id: 'a', nome: 'Sistema de Incêndio (AVCB/CLCB)', venc: '' }, { id: 'b', nome: '', venc: '' }, { id: 'c', nome: '', venc: '2027-01-10' }, { id: 'd', nome: '   ', venc: '' }];
    _docNovoId = null; renderDocs();
    const vis = () => _docs.filter(d => { const e = document.getElementById('doc-nome-' + d.id); return e && e.offsetParent !== null; }).map(d => d.id).join(',');
    const v1 = vis(), existem = _docs.every(d => !!document.getElementById('doc-nome-' + d.id));
    salvarDocs(); const mantidos = _docs.length;
    adicionarDoc(); const novo = _docs[_docs.length - 1].id; const v2 = vis();
    return { v1, existem, mantidos, v2, novo };
  });
  check('documento sem nome e sem data não é desenhado; com nome OU com data aparece', docs.v1 === 'a,c', docs.v1);
  check('mas continua existindo e sendo salvo (salvarDocs não perde nenhum)', docs.existem && docs.mantidos === 4, JSON.stringify(docs));
  check('o documento criado por "+ Adicionar" aparece pra ser preenchido', docs.v2 === 'a,c,' + docs.novo, docs.v2);

  // ══ 6. Tamanho ═════════════════════════════════════════════════════════════════════
  const med = await page.evaluate(() => { const tab = document.getElementById('tab-dados').getBoundingClientRect(); const fim = document.querySelector('.dados-hoje').getBoundingClientRect().bottom;
    return { larg: document.documentElement.scrollWidth, topo: Math.round(fim - tab.top) - Math.round(document.getElementById('falta-hoje-card').getBoundingClientRect().height),
      cortado: [...document.querySelectorAll('.dados-hoje-item input')].some(i => i.scrollWidth > i.clientWidth + 1) }; });
  check('sem rolagem de lado em 320 px', med.larg <= 320, med.larg);
  check('os valores cabem inteiros nos quadros em 320 px', !med.cortado);
  // Antes, só data (266) + faturamento (532) + total (55) davam 853 px, fora o progresso (207) lá embaixo.
  check('data + progresso + faturamento ocupam menos de 520 px (eram 1.060)', med.topo < 520, med.topo);
  await page.setViewportSize({ width: 700, height: 800 });
  check('em tela larga os quatro valores ficam numa linha só', await page.evaluate(() => { const it = [...document.querySelectorAll('.dados-hoje-item')].map(e => Math.round(e.getBoundingClientRect().top)); return new Set(it).size === 1; }));

  check('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
