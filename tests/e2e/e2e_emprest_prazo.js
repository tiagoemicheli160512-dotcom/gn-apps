// Empréstimo entre lojas — prazo de 3 dias pra confirmar a devolução (27/11/2026).
// "Quando a loja sinalizar que devolveu, a outra loja tem que ter um prazo de até 3 dias pra
//  confirmar que de fato recebeu, pois se não nunca é confirmado." Decisões do dono: passou o
// prazo, o app Lojas da loja que deve a resposta TRAVA (só libera Empréstimos) até ela dizer
// "recebi" ou "não recebi"; os casos que já esperavam (sem data da marcação) contam 3 dias a
// partir de 27/11/2026. Vale nos dois sentidos. Contestação sai da trava e vai pro Painel.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS_APP = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };
const base = o => Object.assign({ fator: 1, unidade: 'KG', quitado: false, dataQuitacao: null, confirmadoOrigem: false, confirmadoDestino: false, pagDinheiroOrigem: false, pagDinheiroDestino: false }, o, { qtdOriginal: o.qtd });
// Norte Shopping é a loja da sessão.
const X1 = base({ id: 'x1', qtd: 20, data: '2026-11-24T12:00:00Z', insumo: 'PICANHA MATURATA', origem: 'NORTE SHOPPING', destino: 'NOVA AMERICA', confirmadoDestino: true }); // antigo, sem data: Norte deve "recebi"
const X2 = base({ id: 'x2', qtd: 5, data: '2026-11-25T12:00:00Z', insumo: 'CARNE DE SOL', origem: 'NOVA AMERICA', destino: 'NORTE SHOPPING', confirmadoOrigem: true, confirmadoOrigemEm: '2026-12-02T15:00:00Z' }); // Norte deve "devolvi" até 05/12
const X3 = base({ id: 'x3', qtd: 3, data: '2026-11-26T12:00:00Z', insumo: 'CARNE SECA', origem: 'NORTE SHOPPING', destino: 'BANGU' }); // ninguém marcou
const X4 = base({ id: 'x4', qtd: 2, data: '2026-10-01T12:00:00Z', insumo: 'QUEIJO COALHO', origem: 'NORTE SHOPPING', destino: 'BOULEVARD', confirmadoDestino: true, pagDinheiroOrigem: true }); // dinheiro: fora
const rowsDe = () => {
  const c = x => JSON.parse(JSON.stringify(x));
  return [
    { loja: 'NORTE SHOPPING', transferAll: { 'NORTE SHOPPING|2026-11-23': [c(X1), c(X2), c(X3), c(X4)], 'NOVA AMERICA|2026-11-23': [c(X1), c(X2)], 'BANGU|2026-11-23': [c(X3)], 'BOULEVARD|2026-09-29': [c(X4)] } },
    { loja: 'NOVA AMERICA', transferAll: { 'NOVA AMERICA|2026-11-23': [c(X1), c(X2)], 'NORTE SHOPPING|2026-11-23': [c(X1), c(X2)] } },
    { loja: 'BANGU', transferAll: { 'BANGU|2026-11-23': [c(X3)], 'NORTE SHOPPING|2026-11-23': [c(X3)] } },
    { loja: 'BOULEVARD', transferAll: { 'BOULEVARD|2026-09-29': [c(X4)], 'NORTE SHOPPING|2026-09-29': [c(X4)] } },
  ];
};

async function abrir(browser, quando, cargo) {
  const rows = rowsDe();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, quando);
  const patches = [], travas = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url(), m = req.method();
    if (/rpc\/gn_travas_sync/.test(url)) { try { travas.push(JSON.parse(req.postData())); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: 'true' }); }
    if (m === 'PATCH' || m === 'POST') { let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch (e) {} patches.push({ url, body: b }); return r.fulfill({ status: 204, body: '' }); }
    if (url.indexOf('gn_lojas') === -1) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const q = /loja=eq\.([^&]+)/.exec(url);
    const sel = rows.filter(x => !q || x.loja === decodeURIComponent(q[1]).replace(/\+/g, ' '))
      .map(x => ({ loja: x.loja, all_data: { transferAll: x.transferAll }, updated_at: '2026-11-27T00:00:00Z' }));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sel) });
  });
  const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  page.on('dialog', d => d.type() === 'prompt' ? d.accept('A carne não chegou') : d.accept());
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('gn_session_v1', JSON.stringify({ ts: Date.now(), id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'NORTE SHOPPING', permissoes: {} })); });
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS_APP + '?tab=transf');
    try { await page.waitForFunction(() => { try { return typeof getTransfPorLoja === 'function' && Object.keys(transferAll).length > 0; } catch (e) { return false; } }, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  await page.evaluate(c => { loja = 'NORTE SHOPPING'; usuarioAtual = { nome: 'Ana', cargo: c }; abasPermitidas = null; tab = 'transf'; render(); }, cargo || 'gerente');
  await page.waitForTimeout(300);
  return { ctx, page, erros, patches, travas };
}
const ver = page => page.evaluate(() => {
  const ov = document.getElementById('emprest-prazo-overlay');
  const reg = x => transfPorId(x) || {};
  return { tab, overlay: !!ov, overlayTxt: ov ? ov.innerText.replace(/\s+/g, ' ') : '', tela: (document.getElementById('content') || document.body).innerText.replace(/\s+/g, ' '),
    vencidos: (typeof _emprestVencidosAtivos !== 'undefined' ? _emprestVencidosAtivos : []).map(v => v.t.id),
    x1: { cont: reg('x1').contestacao || null }, x2: { q: !!reg('x2').quitado }, x3: { co: !!reg('x3').confirmadoOrigem, em: reg('x3').confirmadoOrigemEm || null } };
});
const tentaSair = async page => { await page.evaluate(() => goTab('estoque')); await page.waitForTimeout(200); return ver(page); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  // ── 1. 30/11: dentro do prazo (caso antigo conta de 27/11 → até 30/11) ──
  {
    const { ctx, page, erros } = await abrir(browser, '2026-11-30T12:00:00-03:00');
    let r = await ver(page);
    if (typeof r.vencidos === 'undefined' || !/responda até|prazo venceu/.test(r.tela)) {
      check('a tela mostra o prazo da resposta', false, r.tela.slice(0, 300));
    } else check('30/11: Picanha (marcada antes de 27/11) mostra "responda até 30/11"', /responda até 30\/11/.test(r.tela), r.tela.slice(0, 400));
    r = await tentaSair(page);
    check('30/11: ainda no prazo — o app não trava (vai pra outra aba)', r.tab === 'estoque' && !r.overlay, r);
    check('nenhum erro de JavaScript (1)', erros.length === 0, erros);
    await ctx.close();
  }
  // ── 2. 01/12: venceu → trava; "não recebi" libera e vai pra gestão ──
  {
    const { ctx, page, erros, patches, travas } = await abrir(browser, '2026-12-01T09:00:00-03:00');
    let r = await tentaSair(page);
    check('01/12: prazo vencido — não sai de Empréstimos e mostra a trava', r.tab === 'transf' && r.overlay, r);
    check('a trava lista só a Picanha (Carne de Sol vence 05/12; sem marcação e pagamento em dinheiro ficam fora)', JSON.stringify(r.vencidos) === '["x1"]' && /PICANHA MATURATA/.test(r.overlayTxt) && /Nova América já marcou/.test(r.overlayTxt), r);
    check('o card mostra "prazo venceu em 30/11" e o botão "Não recebi"', /prazo venceu em 30\/11/.test(r.tela) && /Não recebi/.test(r.tela), r.tela.slice(0, 500));
    check('a trava vai pro registro de Bloqueios (tipo emprestimo)', travas.some(t => t.p_app === 'lojas_emprestimo' && t.p_ativas.length === 1 && t.p_ativas[0].tipo === 'emprestimo'), travas);
    await page.evaluate(() => contestarDevolucao('x1')); await page.waitForTimeout(400);
    r = await ver(page);
    check('"Não recebi": grava a contestação com motivo e sai da trava', r.x1.cont && r.x1.cont.loja === 'NORTE SHOPPING' && r.x1.cont.motivo === 'A carne não chegou' && r.vencidos.length === 0, r);
    check('a contestação viaja pra linha da Nova América', patches.some(p => /loja=eq\.NOVA(%20|\+| )AMERICA/.test(p.url) && JSON.stringify(p.body || {}).includes('A carne não chegou')), patches.map(p => p.url));
    r = await tentaSair(page);
    check('depois de responder, o app libera as outras abas', r.tab === 'estoque' && !r.overlay, r);
    check('nenhum erro de JavaScript (2)', erros.length === 0, erros);
    await ctx.close();
  }
  // ── 3. 06/12: o outro sentido (Nova América marcou "recebi de volta" em 02/12) ──
  {
    const { ctx, page, erros } = await abrir(browser, '2026-12-06T09:00:00-03:00');
    await page.evaluate(() => contestarDevolucao('x1')); // tira a Picanha da frente
    let r = await tentaSair(page);
    check('06/12: Carne de Sol venceu em 05/12 — trava pra Norte confirmar a devolução', r.overlay && JSON.stringify(r.vencidos) === '["x2"]' && /confirmar a devolução/.test(r.overlayTxt), r);
    await page.evaluate(() => goTab('transf'));
    await page.evaluate(() => quitarEmprestimo('x2')); await page.waitForTimeout(600);
    r = await tentaSair(page);
    check('"Devolvi": as duas confirmaram → quitado e a trava sai', r.x2.q && r.vencidos.length === 0 && r.tab === 'estoque', r);
    check('nenhum erro de JavaScript (3)', erros.length === 0, erros);
    await ctx.close();
  }
  // ── 4. A data da marcação é gravada (o prazo da outra loja conta dela) ──
  {
    const { ctx, page, erros } = await abrir(browser, '2026-12-03T10:00:00-03:00');
    await page.evaluate(() => quitarEmprestimo('x3')); await page.waitForTimeout(500);
    const r = await ver(page);
    const pz = await page.evaluate(() => _emprestPrazoDe(transfPorId('x3'), 'BANGU'));
    check('"Recebi de volta" grava confirmadoOrigemEm', !!r.x3.em && r.x3.em.startsWith('2026-12-03'), r.x3);
    check('…e o prazo de Bangu confirmar a devolução é 06/12', pz && pz.limite === '2026-12-06', pz);
    check('nenhum erro de JavaScript (4)', erros.length === 0, erros);
    await ctx.close();
  }
  // ── 5. Gestão (mestre) não trava ──
  {
    const { ctx, page, erros } = await abrir(browser, '2026-12-10T10:00:00-03:00', 'mestre');
    const r = await tentaSair(page);
    check('mestre não é travado', r.tab === 'estoque' && !r.overlay, r);
    await ctx.close();
  }
  // ── 6. Painel › Transferências: prazo e contestação ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
    await CAMINHOS.fixarRelogio(ctx, '2026-12-01T10:00:00-03:00');
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    for (let t = 1; ; t++) { await page.goto('file://' + HOME); try { await page.waitForFunction(() => typeof _emprestSituacao === 'function', null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
    const r = await page.evaluate(([X1, X2]) => [ _emprestSituacao(X1).txt, _emprestSituacao(X2).txt,
      _emprestSituacao(Object.assign({}, X1, { contestacao: { loja: 'NORTE SHOPPING', motivo: 'A carne não chegou' } })).txt ], [X1, X2]);
    check('Painel: caso antigo vencido mostra "prazo venceu em 30/11 (app da loja travado)"', /prazo venceu em 30\/11 \(app da loja travado\)/.test(r[0]), r[0]);
    check('Painel: marcado em 02/12 mostra "prazo até 05/12"', /prazo até 05\/12/.test(r[1]), r[1]);
    check('Painel: contestação aparece pra gestão resolver', /Norte Shopping contestou: diz que não recebeu de volta — "A carne não chegou" · a gestão precisa resolver/.test(r[2]), r[2]);
    await ctx.close();
  }
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
