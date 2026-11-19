// Desperdício do rodízio e do buffet de feijoada (19/11/2026, pedido do dono):
//  feijoada sex/sáb (11h–16h) → a partir das 18h pedir se teve desperdício; rodízio todo dia
//  nas lojas de rodízio → a partir das 22h; prazo até 02h (conta o dia anterior). Se não teve,
//  gerente/sub informa que não teve. Passou do prazo: trava a gerência. Vai pra aba Avarias
//  do app Pedido, separado em Rodízio e Buffet. Só controle (sem valor).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
// Login de loja no Home redireciona pro app da loja — a cobrança é testada no Check-list (mesmo script).
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

const SESS = (cargo, loja) => ({ id: 7, nome: 'Rayanne', loja: loja || 'NORTE SHOPPING', cargo, permissoes: {}, ts: Date.now() });

async function abrir(browser, arq, quando, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await CAMINHOS.fixarRelogio(ctx, quando);
  const banco = { linhas: (opts.linhas || []).slice(), posts: [] };
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = decodeURIComponent(req.url().replace(/\+/g, '%20'));
    const json = (b, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_desperdicio_buffet/.test(u) && req.method() === 'GET') {
      const lj = (u.match(/loja=eq\.([^&]+)/) || [])[1];
      return json(banco.linhas.filter(x => !lj || x.loja === lj));
    }
    if (/gn_desperdicio_buffet/.test(u) && req.method() === 'POST') { const b = JSON.parse(req.postData()); banco.posts.push(b); banco.linhas.push(b); return json([], 201); }
    if (/rpc\/verificar_login/.test(u)) return json(opts.login || [{ nome: 'Rayanne', cargo: 'sub_gerente', loja: 'NORTE SHOPPING' }]);
    return json([]);
  });
  await ctx.route('https://cdn.jsdelivr.net/**', r => opts.semCdn ? r.abort() : r.continue());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  page.on('dialog', d => d.accept());
  if (opts.sessao) await page.addInitScript(s => { localStorage.clear(); localStorage.setItem('gn_session_v1', JSON.stringify(Object.assign({}, s, { ts: Date.now() }))); }, opts.sessao);
  await page.goto('file://' + arq);
  await page.waitForFunction(() => !!window.gnDesperdicio && !!window.gnBuffetTemRodizio, null, { timeout: 30000 });
  return { ctx, page, erros, banco };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todosErros = [];

  // ── 1. A regra (cálculo puro) ──────────────────────────────────────────────
  const a = await abrir(browser, HOME, '2026-11-20T10:00:00');
  const R = await a.page.evaluate(() => {
    const G = gnDesperdicio, P = (loja, quando, decl) => G.calcularPendencias(loja, new Date(quando), decl || []).map(p => p.data.slice(5) + ':' + p.tipo + (p.atrasado ? ':ATRASO' : ''));
    return {
      norte1759: P('NORTE SHOPPING', '2026-11-20T17:59:00'), norte1800: P('NORTE SHOPPING', '2026-11-20T18:00:00'),
      bangu2159: P('BANGU', '2026-11-20T21:59:00'), bangu2200: P('BANGU', '2026-11-20T22:00:00'),
      bangu0130: P('BANGU', '2026-11-21T01:30:00'), bangu0200: P('BANGU', '2026-11-21T02:00:00'),
      bangu0200decl: P('BANGU', '2026-11-21T02:00:00', [{ data: '2026-11-20', tipo: 'feijoada' }, { data: '2026-11-20', tipo: 'rodizio' }]),
      norteSeg: P('NORTE SHOPPING', '2026-11-23T23:00:00', [{ data: '2026-11-20', tipo: 'feijoada' }, { data: '2026-11-21', tipo: 'feijoada' }]),
      antes: P('BANGU', '2026-11-19T23:30:00'), maglia: P('MAGLIA', '2026-11-20T23:00:00'),
      dia0130: G.diaOperacional(new Date('2026-11-21T01:30:00')), dia0200: G.diaOperacional(new Date('2026-11-21T02:00:00')),
    };
  });
  check('feijoada (sexta): nada às 17:59; às 18:00 pede (loja sem rodízio, Norte)', R.norte1759.length === 0 && R.norte1800.join() === '11-20:feijoada', R);
  check('rodízio (Bangu): às 21:59 só a feijoada; às 22:00 pede também o rodízio', R.bangu2159.join() === '11-20:feijoada' && R.bangu2200.join() === '11-20:feijoada,11-20:rodizio', R);
  check('até 02h conta o dia anterior (01:30 de sábado = sexta, ainda no prazo); às 02:00 vira atraso', R.dia0130 === '2026-11-20' && R.bangu0130.join() === '11-20:feijoada,11-20:rodizio' && R.bangu0200.every(x => /ATRASO/.test(x)) && R.bangu0200.length === 2, R);
  check('informado, não pede mais', R.bangu0200decl.length === 0, R);
  check('segunda: loja sem rodízio não tem nada (feijoada só sex/sáb)', R.norteSeg.length === 0, R);
  check('antes do início (19/11) não cobra; Maglia nunca', R.antes.length === 0 && R.maglia.length === 0, R);
  todosErros.push(...a.erros); await a.ctx.close();

  // ── 2. Na tela: gerente às 18:05 de sexta, "Não teve" assinado ─────────────
  const b = await abrir(browser, CHK, '2026-11-20T18:05:00', { sessao: SESS('sub_gerente') });
  await b.page.waitForSelector('#gn-desp-overlay', { timeout: 8000 }).catch(() => {});
  const t1 = await b.page.evaluate(() => { const o = document.getElementById('gn-desp-overlay'); return o ? o.innerText.replace(/\s+/g, ' ') : null; });
  check('às 18:05 de sexta a gerência vê "Teve desperdício hoje?" com o buffet de feijoada', t1 && /Teve desperdício hoje\?/.test(t1) && /Buffet de feijoada — sexta 20\/11/.test(t1) && /Lembrar daqui a 30 min/.test(t1), t1);
  await b.page.click('.gn-desp-nao');
  await b.page.fill('#gd-nome', 'Rayanne'); await b.page.fill('#gd-senha', '1');
  await b.page.click('#gd-ok'); await b.page.waitForTimeout(400);
  const p1 = b.banco.posts[0] || {};
  check('"Não teve" assinado grava teve=false com quem assinou e o aparelho, e fecha a tela',
    p1.loja === 'NORTE SHOPPING' && p1.data === '2026-11-20' && p1.tipo === 'feijoada' && p1.teve === false && p1.assinado_por === 'Rayanne' && !(await b.page.$('#gn-desp-overlay')), p1);
  todosErros.push(...b.erros); await b.ctx.close();

  // ── 3. "Teve", com itens; assinatura de cargo errado é recusada ─────────────
  const c = await abrir(browser, CHK, '2026-11-20T22:10:00', { sessao: SESS('gerente', 'BANGU'),
    login: [{ nome: 'Neto', cargo: 'estoquista', loja: 'BANGU' }] });
  await c.page.waitForSelector('#gn-desp-overlay', { timeout: 8000 }).catch(() => {});
  const nPend = await c.page.$$eval('.gn-desp-pend', x => x.length).catch(() => 0);
  check('Bangu às 22:10: pede feijoada e rodízio', nPend === 2, nPend);
  await c.page.click('.gn-desp-sim[data-i="1"]');
  await c.page.click('#gd-seguir');
  const errVazio = await c.page.$eval('#gd-err', e => e.textContent);
  check('"Teve" sem item não segue', /pelo menos 1 item/.test(errVazio), errVazio);
  await c.page.fill('.gd-ins', 'picanha'); await c.page.fill('.gd-qtd', '1,5');
  await c.page.click('#gd-add');
  const ins = await c.page.$$('.gd-ins'); await ins[1].fill('arroz'); const qs = await c.page.$$('.gd-qtd'); await qs[1].fill('2');
  await c.page.click('#gd-seguir');
  await c.page.fill('#gd-nome', 'Neto'); await c.page.fill('#gd-senha', '1'); await c.page.click('#gd-ok'); await c.page.waitForTimeout(300);
  const errCargo = await c.page.$eval('#gd-err', e => e.textContent).catch(() => '');
  check('estoquista não assina (é gerente ou sub)', /gerente ou sub-gerente/.test(errCargo) && c.banco.posts.length === 0, errCargo);
  await c.page.route('**/rest/v1/rpc/verificar_login', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ nome: 'Fernando', cargo: 'gerente', loja: 'BANGU' }]) }));
  await c.page.fill('#gd-nome', 'Fernando'); await c.page.click('#gd-ok'); await c.page.waitForTimeout(400);
  const p2 = c.banco.posts[0] || {};
  check('"Teve" grava os itens (PICANHA 1,5 KG; ARROZ 2 KG), tipo rodízio, assinado pelo gerente',
    p2.tipo === 'rodizio' && p2.teve === true && JSON.stringify(p2.itens) === JSON.stringify([{ insumo: 'PICANHA', qtd: 1.5, unidade: 'KG' }, { insumo: 'ARROZ', qtd: 2, unidade: 'KG' }]) && p2.assinado_por === 'Fernando', p2);
  const restou = await c.page.$$eval('.gn-desp-pend', x => x.length).catch(() => 0);
  check('…e a tela continua com o que falta (a feijoada)', restou === 1, restou);
  todosErros.push(...c.erros); await c.ctx.close();

  // ── 4. Atraso: sábado 10h sem nada de sexta → trava, sem "lembrar depois" ──
  const d = await abrir(browser, CHK, '2026-11-21T10:00:00', { sessao: SESS('gerente') });
  await d.page.waitForSelector('#gn-desp-overlay', { timeout: 8000 }).catch(() => {});
  const t4 = await d.page.evaluate(() => { const o = document.getElementById('gn-desp-overlay'); return o ? o.innerText.replace(/\s+/g, ' ') : null; });
  check('passou das 02h sem informar: trava com "Desperdício não informado", em atraso, sem adiar e com liberação de supervisor',
    t4 && /Desperdício não informado/.test(t4) && /em atraso/.test(t4) && !/Lembrar daqui/.test(t4) && /senha de supervisão/.test(t4), t4);
  todosErros.push(...d.erros); await d.ctx.close();

  // ── 5. Quem não é cobrado ──────────────────────────────────────────────────
  for (const [nome, s] of [['estoquista', SESS('estoquista')], ['caixa', SESS('caixa')], ['GERAL (supervisão)', SESS('supervisor', 'GERAL')], ['Maglia', SESS('gerente', 'MAGLIA')]]) {
    const e = await abrir(browser, CHK, '2026-11-21T10:00:00', { sessao: s });
    await e.page.waitForTimeout(2500);
    check(`${nome} não é cobrado`, !(await e.page.$('#gn-desp-overlay')));
    todosErros.push(...e.erros); await e.ctx.close();
  }

  // ── 6. App Pedidos › Avarias: Rodízio e Buffet separados ──────────────────
  const linhas = [
    { loja: 'BANGU', data: '2026-11-20', tipo: 'rodizio', teve: true, itens: [{ insumo: 'PICANHA', qtd: 1.5, unidade: 'KG' }], assinado_por: 'Fernando' },
    { loja: 'BANGU', data: '2026-11-20', tipo: 'feijoada', teve: false, itens: [], assinado_por: 'Fernando' },
    { loja: 'NORTE SHOPPING', data: '2026-11-20', tipo: 'feijoada', teve: false, itens: [], assinado_por: 'Rayanne' },
  ];
  const f = await abrir(browser, PEDIDOS, '2026-11-21T19:00:00', { linhas });
  await f.page.waitForFunction(() => { try { return typeof renderTerceiros === 'function' && typeof S === 'object' && S; } catch (e) { return false; } }, null, { timeout: 30000 });
  const v = await f.page.evaluate(async () => {
    _fetchSaidasTerceiros = async () => [];
    await renderTerceiros('avarias');
    const secao = t => { const el = document.querySelector(`.desp-secao[data-tipo="${t}"]`); const dias = [...document.querySelectorAll(`.desp-dia[data-tipo="${t}"]`)];
      return { titulo: el && el.innerText.replace(/\s+/g, ' '), dias: dias.map(d => ({ data: d.dataset.data, txt: d.innerText.replace(/\s+/g, ' ') })) }; };
    return { rod: secao('rodizio'), fei: secao('feijoada'), rel: _terceirosRelatorioTexto().msg };
  });
  const rod20 = (v.rod.dias.find(x => x.data === '2026-11-20') || {}).txt || '';
  const fei20 = (v.fei.dias.find(x => x.data === '2026-11-20') || {}).txt || '';
  const fei21 = (v.fei.dias.find(x => x.data === '2026-11-21') || {}).txt || '';
  check('Pedidos › Avarias tem a seção do Rodízio e a do Buffet', /Rodízio — desperdício/.test(v.rod.titulo || '') && /Buffet de feijoada — desperdício/.test(v.fei.titulo || ''), v);
  check('Rodízio 20/11: Bangu com os itens e quem assinou; Boulevard etc. "Não informado"', /Bangu\s?⚠️ PICANHA 1,5 KG/.test(rod20) && /Fernando/.test(rod20) && /Boulevard\s?❌ Não informado/.test(rod20) && !/Norte Shopping/.test(rod20), rod20);
  check('Buffet 20/11: Bangu e Norte "Não teve"; quem não informou aparece em vermelho', /Bangu\s?✅ Não teve/.test(fei20) && /Norte Shopping\s?✅ Não teve/.test(fei20) && /Caxias\s?❌ Não informado/.test(fei20) && !/Maglia/.test(fei20), fei20);
  check('Buffet 21/11 (hoje, antes das 02h): "Aguardando (prazo 02h)"', /Aguardando \(prazo 02h\)/.test(fei21) && !/Não informado/.test(fei21), fei21);
  check('o contador mostra os dias sem informação', /sem informação/.test(v.fei.titulo), v.fei.titulo);
  check('relatório da aba Avarias leva Rodízio e Buffet', /RODÍZIO — DESPERDÍCIO/.test(v.rel) && /BUFFET DE FEIJOADA — DESPERDÍCIO/.test(v.rel) && /Bangu: PICANHA 1,5 KG \(Fernando\)/.test(v.rel) && /NÃO INFORMADO/.test(v.rel), v.rel);
  todosErros.push(...f.erros); await f.ctx.close();

  // ── 7. App Lojas › Avarias: atalho pra informar ───────────────────────────
  const g = await abrir(browser, LOJAS, '2026-11-20T15:00:00', { semCdn: true });
  await g.page.waitForFunction(() => { try { return typeof _despBuffetCardHtml === 'function'; } catch (e) { return false; } }, null, { timeout: 30000 });
  const card = await g.page.evaluate(() => { loja = 'BANGU'; const h1 = _despBuffetCardHtml(); loja = 'NORTE SHOPPING'; const h2 = _despBuffetCardHtml(); loja = 'MAGLIA'; const h3 = _despBuffetCardHtml(); return { h1, h2, h3 }; });
  check('app Lojas › Avarias: card "Desperdício de hoje" com rodízio+feijoada (Bangu), só feijoada (Norte), nada na Maglia',
    /Buffet de feijoada e 🍖 Rodízio/.test(card.h1) && /Informar desperdício de hoje/.test(card.h1) && /Buffet de feijoada/.test(card.h2) && !/Rodízio/.test(card.h2) && card.h3 === '', card);
  todosErros.push(...g.erros); await g.ctx.close();

  check('nenhum erro de JavaScript', todosErros.length === 0, todosErros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
