// "Temos pelo menos que ter 20 itens cadastrados nessa aba de utensílios no app Check-list;
//  loja que não tiver, bloquear o gerente e o sub, a partir de amanhã, e abrir somente essa
//  aba pra ser preenchida." (22/11/2026)
//
// Medido em 22/11 (gn_lojas.all_data.utensilios_saldo): Bangu 10, Guarulhos 14, São Gonçalo
// 17, Campo Grande 0, Itaquera 0 — essas travam; as outras seis passam de 20.
//
// Dois lados:
//  1. OS OUTROS APPS (gn-utensilios-acesso.js): gerente/sub de loja com < 20 peças vê a tela
//     de bloqueio, com o botão pro Check-list › Utensílios. Supervisão, mestre, Maglia, dia
//     anterior a 23/11, sem rede: passa.
//  2. O CHECK-LIST: pendência que só deixa abrir a aba Utensílios; ao contar a 20ª peça,
//     libera sozinho.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const CAIXA = CAMINHOS.pub('gn-caixa.html');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const GUARD = process.env.ARQ_GUARD || CAMINHOS.pub('gn-utensilios-acesso.js');
const SB_LIB = fs.readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); c ? ok++ : falhou++; };
const saldo = n => Object.fromEntries(Array.from({ length: n }, (_, i) => ['peca ' + i, { nome: 'Peça ' + i, saldo: 10 }]));

(async () => {
  if (!fs.existsSync(GUARD)) { console.log('FALHOU: gn-utensilios-acesso.js não existe (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); }
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todosErros = [];

  // ══ 1. Os outros apps ═══════════════════════════════════════════════════════════════
  const abrirApp = async ({ relogio, cargo, loja, n, semRede, url }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, relogio || '2026-11-23T10:00:00');
    await ctx.addInitScript(({ cargo, loja }) => { try { localStorage.setItem('gn_session_v1', JSON.stringify({ id: 5, nome: 'Fernando', loja, cargo, permissoes: {}, ts: Date.now() })); } catch (e) {} }, { cargo: cargo || 'gerente', loja: loja || 'BANGU' });
    const pedidos = [];
    await ctx.route('**/rest/v1/**', r => {
      const u = decodeURIComponent(r.request().url());
      if (/gn_lojas\?loja=eq\./.test(u) && /select=all_data/.test(u)) {
        pedidos.push(u);
        if (semRede) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ all_data: { utensilios_saldo: saldo(n) } }]) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => todosErros.push(String(e.message || e)));
    await page.goto('file://' + (url || CAIXA));
    await page.waitForFunction(() => !!window.gnUtensiliosMinimo, null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    const tela = await page.evaluate(() => { const o = document.getElementById('gn-utens-minimo-bloqueio'); return o ? o.textContent.replace(/\s+/g, ' ') : null; });
    const link = await page.evaluate(() => { const o = document.getElementById('gn-utens-minimo-bloqueio'); return !!o; });
    await ctx.close();
    return { tela, pedidos };
  };

  let r = await abrirApp({ n: 10 });
  check('Caixa, gerente de Bangu com 10 peças em 23/11: bloqueado', !!r.tela, r);
  check('a tela diz quantas tem, quantas faltam e o que fazer (📋 Contar)', /Hoje tem 10 — faltam 10/.test(r.tela || '') && /📋 Contar/.test(r.tela || '') && /Abrir Utensílios no Check-list/.test(r.tela || ''), r.tela);
  check('busca a linha da loja pela chave do controle (BANGU)', r.pedidos.some(u => /gn_lojas\?loja=eq\.BANGU&select=all_data/.test(u)), r.pedidos);
  r = await abrirApp({ n: 10, cargo: 'sub_gerente' });
  check('sub-gerente também é bloqueado', !!r.tela);
  r = await abrirApp({ n: 20 });
  check('com 20 peças: liberado', r.tela === null, r.tela);
  r = await abrirApp({ n: 10, cargo: 'garcom' });
  check('garçom não é bloqueado (pedido: gerente e sub)', r.tela === null);
  r = await abrirApp({ n: 10, cargo: 'supervisor', loja: 'GERAL' });
  check('supervisão não é bloqueada', r.tela === null);
  r = await abrirApp({ n: 0, loja: 'MAGLIA' });
  check('Maglia fora', r.tela === null);
  r = await abrirApp({ n: 0, relogio: '2026-11-22T20:00:00' });
  check('hoje (22/11) ainda não trava — começa amanhã', r.tela === null);
  r = await abrirApp({ n: 0, semRede: true });
  check('sem rede: não trava (falha aberto)', r.tela === null);
  r = await abrirApp({ n: 0, url: CHK });
  check('no Check-list esta tela NÃO cobre (lá a trava é a da aba)', r.tela === null);
  r = await abrirApp({ n: 0, loja: 'NORTE SHOPPING' });
  check('Norte Shopping usa a chave NORTE do controle', r.pedidos.some(u => /loja=eq\.NORTE&/.test(u)), r.pedidos);

  // ══ 2. O Check-list ═════════════════════════════════════════════════════════════════
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-23T10:00:00');
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  let N = 19;
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = decodeURIComponent(req.url());
    if (/\/gn_lojas\?/.test(u) && /loja=eq\.BANGU/.test(u) && req.method() === 'GET')
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ all_data: { utensilios_saldo: saldo(N) } }]) });
    if (/\/gn_lojas\?/.test(u) && req.method() === 'PATCH') { N = Object.keys((JSON.parse(req.postData() || '{}').all_data || {}).utensilios_saldo || {}).length; return r.fulfill({ status: 204, body: '' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => todosErros.push(String(e.message || e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try { return typeof _atualizarPendenciasEssenciais === 'function' && typeof switchTab === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  const temRegra = await page.evaluate(() => typeof _checarUtensiliosMinimo === 'function');
  check('o Check-list tem a pendência de utensílios', temRegra);
  if (temRegra) {
    const c = await page.evaluate(async () => {
      hideLogin(); LOJA = 'Bangu'; state.data = '2026-11-23';
      usuarioLogado = { id: 5, nome: 'Fernando', cargo: 'gerente', loja: 'BANGU' };
      document.querySelectorAll('body > div').forEach(d => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && parseInt(cs.zIndex) >= 900 && d.id !== 'pendencias-essenciais-lock') d.style.display = 'none'; });
      const p = await _checarUtensiliosMinimo();
      _pendenciasEssenciaisAtivas = p ? [p] : []; _renderPendenciasEssenciaisLock();
      const inicial = _activeTab;
      switchTab('utensilios'); const foiUtens = _activeTab === 'utensilios';
      switchTab('abertura'); const foiAbertura = _activeTab === 'abertura';
      switchTab('dados'); const foiDados = _activeTab === 'dados';
      return { p: p && { chave: p.chave, tabAlvo: p.tabAlvo, mensagem: p.mensagem }, inicial, foiDados, foiAbertura, foiUtens };
    });
    check('gerente de Bangu com 19 peças: pendência "utensilios" apontando pra aba Utensílios', c.p && c.p.chave === 'utensilios' && c.p.tabAlvo === 'utensilios' && /tem 19 — faltam 1/.test(c.p.mensagem), c.p);
    check('com a pendência, não sai da aba Utensílios pra outra (Abertura, Dados)', c.foiAbertura === false && c.foiDados === false, c);
    check('mas abre a aba Utensílios', c.foiUtens === true, c);
    const lib = await page.evaluate(async () => {
      await _utensiliosGravar(s => { s['peca nova'] = { nome: 'Peça nova', saldo: 30 }; return s; });
      await new Promise(r => setTimeout(r, 1500));
      return { ativas: _pendenciasEssenciaisAtivas.map(p => p.chave) };
    });
    check('contou a 20ª peça: a pendência some sozinha, sem recarregar', !lib.ativas.includes('utensilios'), lib);
    const outros = await page.evaluate(async () => {
      const r = [];
      for (const cargo of ['garcom', 'supervisor']) { usuarioLogado = { id: 6, nome: 'X', cargo, loja: 'BANGU' }; r.push(await _checarUtensiliosMinimo()); }
      return r.map(x => x ? x.chave : null);
    });
    check('no Check-list, garçom e supervisão não recebem a trava', outros.every(x => x === null), outros);
  }
  await ctx.close();

  check('nenhum erro de JavaScript', todosErros.length === 0, todosErros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
