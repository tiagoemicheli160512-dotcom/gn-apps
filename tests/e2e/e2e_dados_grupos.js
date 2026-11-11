// Aba Dados, fase 2 (12/11/2026): o que vinha depois do topo — fotos, banda, funcionários,
// documentos, faturamento da semana, histórico, datas — passou a ficar em três grupos
// recolhidos, com resumo no título (☀️ Dia, 👥 Equipe, 🗂 Loja). A receita da Home.
//
// É a tela mais usada pelas lojas. Esta suíte cobra, antes do resto, o que NÃO pode mudar:
//   1. todos os cartões de antes continuam lá, uma vez só, com o mesmo id, cada um no grupo
//      certo;
//   2. recolhido não quer dizer sumido: o resumo diz o que tem dentro e acende o alerta
//      (foto da gorjeta pendente, cadastro incompleto, documento vencendo);
//   3. quem rola até um cartão de dentro (completar cadastro, cobrança da Escala) abre o
//      grupo sozinho — senão a tela rolaria até uma coisa escondida;
//   4. aberto/fechado é lembrado no aparelho;
//   5. 320 px sem rolagem de lado, com tudo aberto; e a aba ficou curta.
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
  const abrir = async () => {
    await page.goto('file://' + CHK);
    await page.waitForFunction(() => { try { return typeof restoreUI === 'function' && typeof _dadosResumo === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
    await page.evaluate(() => { hideLogin(); LOJA = 'Campo Grande'; state.data = '2026-11-11';
      usuarioLogado = { id: 1, nome: 'Thalyta', cargo: 'sub_gerente', loja: 'CAMPO GRANDE' };
      document.querySelectorAll('body > div').forEach(d => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && parseInt(cs.zIndex) >= 900) d.style.display = 'none'; });
      initAllStates(); restoreUI(); });
  };
  await abrir();

  // ══ 1. Nada sumiu, cada um no seu grupo ═════════════════════════════════════════════
  const ONDE = { dia: ['card-fotos-dia', 'dados-banda-card', 'banda-hoje-card-dados-slot', 'foto-comissao-alert'],
    equipe: ['cadastro-incompleto-card', 'func-count', 'func-lista', 'func-empty', 'func-semana-aviso', 'funcDocInput'],
    loja: ['docs-lista', 'docs-alerta-badge', 'fat-semanal-container', 'meta-semanal-input', 'historico-comercial-container', 'datas-especiais-dados-card'] };
  const r1 = await page.evaluate(ONDE => Object.fromEntries(Object.entries(ONDE).map(([g, ids]) => [g, ids.map(id => {
    const els = document.querySelectorAll('#' + id); const d = els[0] && els[0].closest('details.dados-grupo');
    return els.length === 1 && d && d.dataset.grupo === g ? 'ok' : id + ':' + els.length + ':' + (d ? d.dataset.grupo : '-'); })])), ONDE);
  check('todos os cartões continuam, uma vez só, cada um no grupo certo', Object.values(r1).flat().every(x => x === 'ok'), JSON.stringify(r1));
  check('o topo (data, falta hoje, progresso, faturamento) continua fora dos grupos',
    await page.evaluate(() => ['data-dia-atual', 'falta-hoje-card', 'checklist-summary', 'venda-salao'].every(id => !document.getElementById(id).closest('details.dados-grupo'))));
  const ordem = await page.evaluate(() => [...document.querySelectorAll('#tab-dados > details.dados-grupo')].map(d => d.dataset.grupo).join(','));
  check('três grupos, na ordem Dia → Equipe → Loja', ordem === 'dia,equipe,loja', ordem);
  check('abrem fechados', await page.evaluate(() => [...document.querySelectorAll('details.dados-grupo')].every(d => !d.open)));

  // ══ 2. Resumo ══════════════════════════════════════════════════════════════════════
  const res = () => page.evaluate(async () => { _dadosResumo(); return Object.fromEntries(['dia', 'equipe', 'loja'].map(g => [g, document.getElementById('dados-res-' + g).textContent.trim()])); });
  let r = await page.evaluate(async () => {
    document.getElementById('func-count').textContent = '16 funcionário(s) · semana de 09/11 — 15/11';
    state.banda = { nome: 'TRIO FORRÓ', valor: 0, consumo: 0, qtd_couvert: 0 };
    stateWeek.fat = Object.assign(stateWeek.fat || {}, { seg: 2750.69, ter: 1775.39 });
    return null; });
  r = await res();
  check('Equipe diz quantas pessoas (só o primeiro número do contador)', r.equipe === '16 pessoas', r.equipe);
  check('Dia diz a banda do dia', /TRIO FORRÓ/.test(r.dia), r.dia);
  check('Loja diz o faturamento da semana', /4\.526,08/.test(r.loja), r.loja);
  r = await page.evaluate(() => { _triosHojeRecords = [{ artista: 'Banda Agenda' }]; document.getElementById('foto-comissao-alert').style.display = 'block';
    document.getElementById('cadastro-incompleto-card').innerHTML = '<div>falta sobrenome</div>';
    const b = document.getElementById('docs-alerta-badge'); b.style.display = 'block'; b.textContent = '🔴 1 vencido'; return null; });
  r = await res();
  check('a banda da agenda tem prioridade sobre o campo', /Banda Agenda/.test(r.dia), r.dia);
  check('foto da gorjeta pendente acende no resumo do Dia', /foto da gorjeta pendente/.test(r.dia), r.dia);
  check('cadastro incompleto acende no resumo da Equipe', /cadastro incompleto/.test(r.equipe), r.equipe);
  check('documento vencido acende no resumo da Loja', /1 vencido/.test(r.loja), r.loja);
  check('o alerta vem em destaque (classe alerta)', await page.evaluate(() => document.querySelectorAll('.dados-grupo-res .alerta').length === 3));
  // O resumo se atualiza sozinho quando o cartão de dentro muda.
  await page.evaluate(() => { document.getElementById('cadastro-incompleto-card').innerHTML = ''; });
  await page.waitForTimeout(200);
  check('o resumo acompanha sozinho quando o cartão de dentro muda', !/cadastro incompleto/.test(await page.evaluate(() => document.getElementById('dados-res-equipe').textContent)));

  // ══ 3. Rolar até um cartão de dentro abre o grupo ═══════════════════════════════════
  const rola = await page.evaluate(() => {
    const d = document.getElementById('dados-grupo-equipe'); d.open = false;
    const alvo = document.createElement('div'); alvo.id = 'cf-teste'; document.getElementById('func-lista').appendChild(alvo);
    alvo.scrollIntoView({ block: 'center' });
    return { aberto: d.open, outrosFechados: !document.getElementById('dados-grupo-dia').open && !document.getElementById('dados-grupo-loja').open };
  });
  check('scrollIntoView num funcionário (ex.: completar cadastro) abre o grupo Equipe', rola.aberto, JSON.stringify(rola));
  check('…e não abre os outros grupos', rola.outrosFechados);
  check('scrollIntoView fora dos grupos continua funcionando', await page.evaluate(() => { document.getElementById('checklist-summary').scrollIntoView(); return true; }));

  // ══ 4. Lembra aberto/fechado ═══════════════════════════════════════════════════════
  await page.evaluate(() => { const l = document.getElementById('dados-grupo-loja'); l.open = true; });
  await page.waitForTimeout(100);
  await abrir();
  const lembra = await page.evaluate(() => ({ equipe: document.getElementById('dados-grupo-equipe').open, loja: document.getElementById('dados-grupo-loja').open, dia: document.getElementById('dados-grupo-dia').open }));
  check('aberto/fechado volta igual depois de recarregar', lembra.equipe && lembra.loja && !lembra.dia, JSON.stringify(lembra));

  // ══ 5. Usar de dentro do grupo e tamanho ═══════════════════════════════════════════
  const doc = await page.evaluate(() => { saveDocs = async () => {}; const antes = _docs.length; const btn = document.querySelector('#dados-grupo-loja button[onclick="adicionarDoc()"]');
    btn.click(); const novo = _docs[_docs.length - 1]; const el = document.getElementById('doc-nome-' + novo.id);
    return { cresceu: _docs.length === antes + 1, visivel: !!el && el.offsetParent !== null }; });
  check('"+ Adicionar documento" de dentro do grupo funciona e o campo aparece', doc.cresceu && doc.visivel, JSON.stringify(doc));
  await page.evaluate(() => document.querySelectorAll('details.dados-grupo').forEach(d => { d.open = true; }));
  check('com os três grupos abertos, sem rolagem de lado em 320 px', await page.evaluate(() => document.documentElement.scrollWidth <= 320), await page.evaluate(() => document.documentElement.scrollWidth));
  await page.evaluate(() => document.querySelectorAll('details.dados-grupo').forEach(d => { d.open = false; }));
  const alt = await page.evaluate(() => Math.round(document.getElementById('tab-dados').getBoundingClientRect().height));
  check('com os grupos fechados, a aba cabe em menos de 1.100 px (era 4.606)', alt < 1100, alt);

  check('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
