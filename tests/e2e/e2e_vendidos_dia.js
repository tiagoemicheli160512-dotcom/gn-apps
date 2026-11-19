// Vendidos do dia (20/11/2026, pedido do dono): gerente/sub lança a quantidade vendida de cada
// prato com carne ou camarão, de Coca-Cola e de chopp, até 11h do dia seguinte; depois trava e
// a supervisão libera. Pratos × gramatura viram kg por carne; chopp × ml vira litros.
//
// Cobra:
//  · a regra do prazo (cobra a partir das 02h do dia seguinte; às 11h vira atraso);
//  · a conta (pratos × gramas, chopp × ml por tipo, Coca em unidades);
//  · a cobrança na tela: lançar, assinar (só gerente/sub), gravar a foto do cadastro e os totais;
//  · o atraso: sem "lembrar depois"; a supervisão libera o lançamento (marcado) ou só o acesso;
//  · quem não é cobrado (estoquista, GERAL, Maglia);
//  · a aba 🧾 Vendidos do Check-list (status por dia; Maglia sem a aba).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

const SESS = (cargo, loja) => ({ id: 7, nome: 'Rayanne', loja: loja || 'NORTE SHOPPING', cargo, permissoes: {}, ts: Date.now() });
const CADASTRO = [
  { id: 'p_cs2', grupo: 'prato', nome: 'Carne de sol GIG P2', gramas: { carne_sol: 400 }, ativo: true, ordem: 1 },
  { id: 'p_inf', grupo: 'prato', nome: 'Chapa do infarto', gramas: { carne_sol: 250, carne_seca: 200 }, ativo: true, ordem: 2 },
  { id: 'p_cam', grupo: 'prato', nome: 'Camarão na nata', gramas: { camarao: 400 }, ativo: true, ordem: 3 },
  { id: 'coca_lata', grupo: 'coca', nome: 'Coca-Cola lata 350 ml', gramas: {}, ativo: true, ordem: 1 },
  { id: 'chopp_claro_350', grupo: 'chopp', nome: 'Chopp claro 350 ml', gramas: {}, ml: 350, chopp_tipo: 'CLARO', ativo: true, ordem: 1 },
  { id: 'chopp_vinho_350', grupo: 'chopp', nome: 'Chopp de vinho 350 ml', gramas: {}, ml: 350, chopp_tipo: 'VINHO', ativo: true, ordem: 2 },
];

async function abrir(browser, quando, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await CAMINHOS.fixarRelogio(ctx, quando);
  const banco = { linhas: (opts.linhas || []).slice(), posts: [], login: opts.login || [{ nome: 'Rayanne', cargo: 'sub_gerente', loja: 'NORTE SHOPPING' }] };
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = decodeURIComponent(req.url().replace(/\+/g, '%20'));
    const json = (b, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_vendidos_itens/.test(u)) return json(CADASTRO);
    if (/gn_vendidos_diario/.test(u) && req.method() === 'GET') {
      const lj = (u.match(/loja=eq\.([^&]+)/) || [])[1], de = (u.match(/data=gte\.([\d-]+)/) || [])[1], ate = (u.match(/data=lte\.([\d-]+)/) || [])[1];
      return json(banco.linhas.filter(x => (!lj || x.loja === lj) && (!de || x.data >= de) && (!ate || x.data <= ate)));
    }
    if (/gn_vendidos_diario/.test(u) && req.method() === 'POST') {
      const b = JSON.parse(req.postData()); banco.posts.push({ url: u, b });
      banco.linhas = banco.linhas.filter(x => !(x.loja === b.loja && x.data === b.data)); banco.linhas.push(b); return json([], 201);
    }
    if (/rpc\/verificar_login/.test(u)) return json(banco.login);
    return json([]);
  });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.continue());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  page.on('dialog', d => d.accept());
  // A trava do desperdício (outro script, mesmo público) fica liberada aqui pra não cobrir esta.
  if (opts.sessao) await page.addInitScript(([s, dia]) => { localStorage.clear(); localStorage.setItem('gn_session_v1', JSON.stringify(Object.assign({}, s, { ts: Date.now() })));
    localStorage.setItem('gn_desp_liberacao', JSON.stringify({ uid: s.id, dia })); }, [opts.sessao, quando.slice(0, 10)]);
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => !!window.gnVendidos, null, { timeout: 30000 });
  return { ctx, page, erros, banco };
}
const txtOverlay = p => p.evaluate(() => { const o = document.getElementById('gn-vend-overlay'); return o ? o.innerText.replace(/\s+/g, ' ') : null; });

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todosErros = [];

  // ── 1. A regra e a conta (cálculo puro) ────────────────────────────────────
  const a = await abrir(browser, '2026-11-24T10:00:00');
  const R = await a.page.evaluate(() => {
    const G = gnVendidos, P = (loja, quando, l) => G.calcularPendencias(loja, new Date(quando), l || []).map(p => p.data.slice(5) + (p.atrasado ? ':ATRASO' : ''));
    const itens = { a: { q: 3, grupo: 'prato', gramas: { carne_sol: 400 } }, b: { q: 2, grupo: 'prato', gramas: { carne_sol: 250, carne_seca: 200 } },
      c: { q: 5, grupo: 'coca' }, d: { q: 10, grupo: 'chopp', ml: 350, chopp_tipo: 'CLARO' }, e: { q: 4, grupo: 'chopp', ml: 350, chopp_tipo: 'VINHO' } };
    return {
      seg23: P('NORTE SHOPPING', '2026-11-23T23:00:00'), ter0130: P('NORTE SHOPPING', '2026-11-24T01:30:00'),
      ter0200: P('NORTE SHOPPING', '2026-11-24T02:00:00'), ter1059: P('NORTE SHOPPING', '2026-11-24T10:59:00'),
      ter1100: P('NORTE SHOPPING', '2026-11-24T11:00:00'), lancado: P('NORTE SHOPPING', '2026-11-24T11:00:00', [{ data: '2026-11-23' }]),
      qui: P('NORTE SHOPPING', '2026-11-26T09:00:00', [{ data: '2026-11-24' }]), maglia: P('MAGLIA', '2026-11-24T12:00:00'),
      antes: P('BANGU', '2026-11-23T12:00:00'),
      t: G.calcTotais(itens),
    };
  });
  check('o dia de venda só é cobrado depois da virada: 23/11 às 23h nada; 24/11 01:30 nada; 02:00 pede o 23', R.seg23.length === 0 && R.ter0130.length === 0 && R.ter0200.join() === '11-23', R);
  check('prazo 11h do dia seguinte: 10:59 ainda no prazo; 11:00 vira atraso', R.ter1059.join() === '11-23' && R.ter1100.join() === '11-23:ATRASO', R);
  check('lançado não pede mais; dois dias sem lançar aparecem os dois (o de ontem ainda no prazo)', R.lancado.length === 0 && R.qui.join() === '11-23:ATRASO,11-25', R);
  check('antes do início (23/11) nada; Maglia nunca', R.antes.length === 0 && R.maglia.length === 0, R);
  check('a conta: carne de sol 3×400 + 2×250 = 1,7 kg; carne seca 0,4 kg; Coca 5 un; chopp 3,5 L claro e 1,4 L vinho',
    R.t.carne_sol === 1.7 && R.t.carne_seca === 0.4 && R.t.picanha === 0 && R.t.coca_un === 5 && R.t.chopp_l_claro === 3.5 && R.t.chopp_l_vinho === 1.4, R.t);
  todosErros.push(...a.erros); await a.ctx.close();

  // ── 2. Cobrança no prazo: lançar, conta ao vivo, assinatura ────────────────
  const b = await abrir(browser, '2026-11-24T09:00:00', { sessao: SESS('sub_gerente'), login: [{ nome: 'Neto', cargo: 'estoquista', loja: 'NORTE SHOPPING' }] });
  await b.page.waitForSelector('#gn-vend-overlay', { timeout: 10000 }).catch(() => {});
  const t1 = await txtOverlay(b.page);
  check('às 9h a gerência vê "Lance os vendidos de ontem" (segunda 23/11, prazo hoje até 11h), com "lembrar depois"',
    t1 && /Lance os vendidos de ontem/.test(t1) && /segunda 23\/11/.test(t1) && /prazo: hoje até 11h/.test(t1) && /Lembrar daqui a 30 min/.test(t1), t1);
  await b.page.click('.gn-vend-lancar');
  await b.page.waitForSelector('.gv-q', { timeout: 8000 });
  const campos = await b.page.$$eval('.gv-q', x => x.map(i => i.dataset.id));
  check('o formulário traz os itens do cadastro: pratos, Coca e chopp', campos.join() === 'p_cs2,p_inf,p_cam,coca_lata,chopp_claro_350,chopp_vinho_350', campos);
  const q = (id, v) => b.page.fill(`.gv-q[data-id="${id}"]`, v);
  await q('p_cs2', '3'); await q('p_inf', '2'); await q('coca_lata', '5'); await q('chopp_claro_350', '10');
  await b.page.waitForTimeout(100);
  const tot = await b.page.$eval('#gv-tot', e => e.innerText.replace(/\s+/g, ' '));
  check('o total aparece enquanto digita: carne de sol 1,7 kg, carne seca 0,4 kg, Coca 5 un, chopp claro 3,5 L',
    /Carne de Sol: 1,7 kg/.test(tot) && /Carne Seca: 0,4 kg/.test(tot) && /Coca-Cola: 5 un/.test(tot) && /Chopp claro: 3,5 L/.test(tot) && !/Camarão/.test(tot), tot);
  await q('p_cam', '2,5'); await b.page.click('#gv-seguir');
  const errNum = await b.page.$eval('#gv-err', e => e.textContent);
  check('quantidade quebrada não passa (só inteiros)', /números inteiros/.test(errNum), errNum);
  await q('p_cam', ''); await b.page.click('#gv-seguir');
  await b.page.fill('#gv-nome', 'Neto'); await b.page.fill('#gv-senha', '1'); await b.page.click('#gv-ok'); await b.page.waitForTimeout(400);
  const errCargo = await b.page.$eval('#gv-err', e => e.textContent).catch(() => '');
  check('estoquista não assina (gerente ou sub)', /gerente ou sub-gerente/.test(errCargo) && b.banco.posts.length === 0, errCargo);
  b.banco.login = [{ nome: 'Rayanne', cargo: 'sub_gerente', loja: 'NORTE SHOPPING' }];
  await b.page.fill('#gv-nome', 'Rayanne'); await b.page.click('#gv-ok'); await b.page.waitForTimeout(500);
  const p1 = (b.banco.posts[0] || {}).b || {};
  check('grava loja, dia (23/11), quem lançou, a foto do cadastro e os totais; no prazo, sem atraso',
    p1.loja === 'NORTE SHOPPING' && p1.data === '2026-11-23' && p1.lancado_por === 'Rayanne' && p1.lancado_cargo === 'sub_gerente' && p1.atrasado === false &&
    p1.itens.p_cs2.q === 3 && p1.itens.p_cs2.gramas.carne_sol === 400 && p1.itens.p_cam.q === 0 && p1.itens.chopp_claro_350.ml === 350 &&
    p1.totais.carne_sol === 1.7 && p1.totais.coca_un === 5 && p1.totais.chopp_l_claro === 3.5, p1);
  check('…é upsert (corrigir no prazo substitui o mesmo dia) e a tela fecha', /on_conflict=loja,data/.test((b.banco.posts[0] || {}).url || '') && !(await b.page.$('#gn-vend-overlay')));
  todosErros.push(...b.erros); await b.ctx.close();

  // ── 3. Atraso: 11h30 sem lançar → trava; supervisão libera o lançamento ────
  const c = await abrir(browser, '2026-11-24T11:30:00', { sessao: SESS('gerente'), login: [{ nome: 'Rayanne', cargo: 'sub_gerente', loja: 'NORTE SHOPPING' }] });
  await c.page.waitForSelector('#gn-vend-overlay', { timeout: 10000 }).catch(() => {});
  const t3 = await txtOverlay(c.page);
  check('passou das 11h: "Vendidos não lançados", em atraso, sem "lançar" nem "lembrar depois", só a supervisão',
    t3 && /Vendidos não lançados/.test(t3) && /em atraso — o prazo era 24\/11 às 11h/.test(t3) && !/Lembrar daqui/.test(t3) && !(await c.page.$('.gn-vend-lancar')) && /Supervisão/.test(t3), t3);
  await c.page.click('#gn-vend-sup');
  await c.page.fill('#gv-nome', 'Rayanne'); await c.page.fill('#gv-senha', '1'); await c.page.click('#gv-lancar'); await c.page.waitForTimeout(300);
  const errSup = await c.page.$eval('#gv-err', e => e.textContent);
  check('sub-gerente não libera o próprio atraso', /Só supervisor ou mestre/.test(errSup), errSup);
  c.banco.login = [{ nome: 'Tiago', cargo: 'mestre', loja: 'GERAL' }];
  await c.page.click('#gv-lancar'); await c.page.waitForSelector('.gv-q', { timeout: 8000 });
  const t3b = await txtOverlay(c.page);
  check('supervisão libera: o formulário abre avisando que fica marcado como atrasado', /Lançamento atrasado, liberado por Tiago/.test(t3b), t3b);
  await c.page.fill('.gv-q[data-id="p_cam"]', '4'); await c.page.click('#gv-seguir');
  c.banco.login = [{ nome: 'Rayanne', cargo: 'sub_gerente', loja: 'NORTE SHOPPING' }];
  await c.page.fill('#gv-nome', 'Rayanne'); await c.page.fill('#gv-senha', '1'); await c.page.click('#gv-ok'); await c.page.waitForTimeout(500);
  const p3 = (c.banco.posts[0] || {}).b || {};
  check('o lançamento atrasado grava atrasado=true e quem liberou; camarão 4×400 = 1,6 kg', p3.atrasado === true && p3.liberado_por === 'Tiago' && p3.totais.camarao === 1.6 && !(await c.page.$('#gn-vend-overlay')), p3);
  todosErros.push(...c.erros); await c.ctx.close();

  // ── 4. "Só liberar o acesso hoje": some, e não volta ao recarregar ────────
  const d = await abrir(browser, '2026-11-24T12:00:00', { sessao: SESS('gerente'), login: [{ nome: 'Tiago', cargo: 'supervisor', loja: 'GERAL' }] });
  await d.page.waitForSelector('#gn-vend-overlay', { timeout: 10000 }).catch(() => {});
  await d.page.click('#gn-vend-sup'); await d.page.fill('#gv-nome', 'Tiago'); await d.page.fill('#gv-senha', '1');
  await d.page.click('#gv-acesso'); await d.page.waitForTimeout(400);
  const fechou = !(await d.page.$('#gn-vend-overlay'));
  await d.page.evaluate(() => gnVendidos.verificarAgora()); await d.page.waitForTimeout(400);
  check('"Só liberar o acesso hoje" fecha a trava e ela não volta na próxima checagem (dia continua pendente)', fechou && !(await d.page.$('#gn-vend-overlay')) && d.banco.posts.length === 0);
  todosErros.push(...d.erros); await d.ctx.close();

  // ── 5. Quem não é cobrado ──────────────────────────────────────────────────
  for (const [nome, s] of [['estoquista', SESS('estoquista')], ['GERAL (supervisão)', SESS('supervisor', 'GERAL')], ['Maglia', SESS('gerente', 'MAGLIA')]]) {
    const e = await abrir(browser, '2026-11-24T12:00:00', { sessao: s });
    await e.page.waitForTimeout(2600);
    check(`${nome} não é cobrado`, !(await e.page.$('#gn-vend-overlay')));
    todosErros.push(...e.erros); await e.ctx.close();
  }

  // ── 6. Aba 🧾 Vendidos do Check-list ───────────────────────────────────────
  const linhas = [{ loja: 'NORTE SHOPPING', data: '2026-11-24', lancado_por: 'Rayanne', atrasado: false, itens: {}, totais: { carne_sol: 12.5, coca_un: 80, chopp_l_claro: 35 } },
                  { loja: 'NORTE SHOPPING', data: '2026-11-23', lancado_por: 'Fernando', atrasado: true, liberado_por: 'Tiago', itens: {}, totais: { picanha: 4 } }];
  const f = await abrir(browser, '2026-11-25T09:00:00', { linhas });
  const aba = await f.page.evaluate(async () => {
    LOJA = 'Norte Shopping';
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-vendas').classList.add('active');
    await new Promise(r => { _renderVendidosAba(); setTimeout(r, 600); });
    const el = document.getElementById('vendidos-aba');
    const btn = document.getElementById('tab-btn-vendas'), carnes = document.getElementById('tab-btn-carnes');
    return { txt: el.innerText.replace(/\s+/g, ' '), botoes: [...el.querySelectorAll('.gv-aba-btn')].map(x => x.dataset.d + ':' + x.textContent.trim()),
      rotulo: btn && btn.textContent.trim(), aoLado: !!(carnes && carnes.nextElementSibling === btn), grupo: btn && btn.classList.contains('grp-op') };
  });
  check('a aba se chama "🧾 Vendidos" e fica logo depois de Carnes, em Operações', aba.rotulo === '🧾 Vendidos' && aba.aoLado && aba.grupo, aba);
  check('24/11 lançado por Rayanne, ainda corrigível (prazo 25/11 11h); 23/11 lançado com atraso, já fechado', /Rayanne/.test(aba.txt) && aba.botoes.includes('2026-11-24:Corrigir') &&
    /Fernando · atrasado/.test(aba.txt) && !aba.botoes.some(x => x.startsWith('2026-11-23')) && /Carne de Sol 12,5 kg · Coca 80 un · Chopp 35,0 L/.test(aba.txt), aba);
  check('hoje (25/11) aparece como dia em andamento, com Lançar', /dia em andamento/.test(aba.txt) && aba.botoes.includes('2026-11-25:Lançar'), aba.botoes);
  const mag = await f.page.evaluate(() => { LOJA = 'Maglia'; aplicarRestricaoAbasMaglia(); return getComputedStyle(document.getElementById('tab-btn-vendas')).display; });
  check('Maglia não vê a aba Vendidos', mag === 'none', mag);
  todosErros.push(...f.erros); await f.ctx.close();

  check('nenhum erro de JavaScript', todosErros.length === 0, todosErros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
