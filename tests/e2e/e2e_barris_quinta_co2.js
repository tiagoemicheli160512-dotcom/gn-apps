// "No chopp, além de segunda, quero a mesma informação na quinta, pois nos preparamos pro fim
//  de semana; e também a quantidade de cilindros de gás (CO2), quantos vazios e quantos cheios,
//  aparecendo na contagem identificado." (19/11/2026)
//
// Cobra:
//  · rodada: seg–qua = contagem de SEGUNDA (chave a segunda); qui–dom = de QUINTA (chave a quinta);
//  · na quinta, sem a contagem de quinta, o app Lojas trava com "Contagem de barris de quinta",
//    comparando com a de segunda da mesma semana;
//  · CO2 obrigatório (cheios e vazios, 0 vale, em branco não) — o botão diz o que falta;
//  · grava rodada 'QUI', semana_inicio = a quinta, uma linha por cilindro (tipo CO2);
//  · Painel › Barris: mostra a contagem de quinta e o CO2 identificado (de quinta ou de segunda),
//    e "quinta pendente" pra quem não contou; o relatório leva os dois.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todos = [];

  // ── App Lojas ─────────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-19T10:00:00');   // quinta
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  page.on('dialog', d => d.accept());
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof _checarBarrisSemanalPendencia === 'function' && typeof getMonday === 'function'; } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: o app Lojas não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _barrisRodadaDe === 'function'))) {
    console.log('FALHOU: a contagem de quinta não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const antesInicio = await page.evaluate(() => { const r = _barrisRodadaDe(new Date('2026-11-19T12:00:00')); return r.rodada + ':' + r.key; });
  check('antes da primeira quinta cobrada (BARRIS_QUINTA_INICIO = 26/11), a quinta 19/11 segue só com a de segunda', antesInicio === 'SEG:2026-11-16', antesInicio);
  await page.evaluate(() => { BARRIS_QUINTA_INICIO = '2026-11-19'; });   // o resto do teste roda como se já tivesse começado
  const rod = await page.evaluate(() => ['2026-11-16', '2026-11-18', '2026-11-19', '2026-11-21', '2026-11-22'].map(d => { const r = _barrisRodadaDe(new Date(d + 'T12:00:00')); return d.slice(8) + ':' + r.rodada + ':' + r.key.slice(8); }));
  check('segunda e quarta = contagem de segunda (16); quinta, sábado e domingo = de quinta (19)', rod.join() === '16:SEG:16,18:SEG:16,19:QUI:19,21:QUI:19,22:QUI:19', rod);

  const r = await page.evaluate(async () => {
    usuarioAtual = { nome: 'Neto', cargo: 'estoquista', loja: 'BANGU' }; loja = 'Bangu';
    try { localStorage.removeItem('gn_barris_semanal_ok'); } catch (e) {}
    window.__req = []; window.__post = [];
    sbRequest = async (url, opt) => {
      const m = (opt && opt.method) || 'GET'; window.__req.push(m + ' ' + decodeURIComponent(url));
      if (m === 'POST') { window.__post.push({ url, body: JSON.parse(opt.body) }); return null; }
      if (/gn_barris_semanal_confirmacao/.test(url)) return [];   // quinta ainda não contada
      if (/gn_barris_semanal_contagem/.test(url)) return [   // contagem de segunda (16/11)
        { tipo: 'CLARO', status: 'CHEIO', semana_inicio: '2026-11-16' }, { tipo: 'CLARO', status: 'VAZIO', semana_inicio: '2026-11-16' },
        { tipo: 'VINHO', status: 'CHEIO', semana_inicio: '2026-11-16' }, { tipo: 'CO2', status: 'CHEIO', semana_inicio: '2026-11-16' }, { tipo: 'CO2', status: 'VAZIO', semana_inicio: '2026-11-16' }];
      return [];
    };
    await _checarBarrisSemanalPendencia(); await new Promise(r => setTimeout(r, 100));
    const el = document.getElementById('barris-semanal-trava-overlay');
    return { pend: _barrisSemPendente, key: _barrisSemSemanaIni, rodada: _barrisSemRodada, txt: el ? el.innerText.replace(/\s+/g, ' ') : '', reqs: window.__req.slice() };
  });
  check('quinta sem contagem de quinta: trava, com a chave 19/11', r.pend === true && r.key === '2026-11-19' && r.rodada === 'QUI' && r.reqs.some(u => /confirmacao.*semana_inicio=eq\.2026-11-19/.test(u)), r);
  check('…a tela diz "Contagem de barris de quinta · preparação do fim de semana"', /Contagem de barris de quinta/.test(r.txt) && /preparação do fim de semana/.test(r.txt), r.txt.slice(0, 300));
  check('…e compara com a de segunda (16/11), com o CO2 dela', /Contagem anterior \(16\/11(\/2026)?\): 🍺 Claro: 2 · 🍷 Vinho: 1 · 🧯 CO2: 1 cheio\(s\), 1 vazio\(s\)/.test(r.txt), r.txt);

  // Lança barris, sem CO2 → bloqueia; com CO2 → libera.
  const b = await page.evaluate(() => {
    _barrisSemItens = { CLARO: [{ status: 'CHEIO', validade: '2026-11-30' }, { status: 'VAZIO', validade: null }], VINHO: [] };
    _renderTravaBarrisSemanal();
    const btn = () => [...document.querySelectorAll('#barris-semanal-trava-overlay button')].find(x => /Confirmar contagem|Falta|Adicione/.test(x.textContent));
    const antes = { txt: btn().textContent.trim(), off: btn().disabled, co2: !!document.querySelector('.bsem-co2') };
    return antes;
  });
  check('a contagem tem a seção "🧯 Cilindros de CO2" e, sem ela, o botão diz "Falta informar os cilindros de CO2"', b.co2 && b.off === true && /Falta informar os cilindros de CO2/.test(b.txt), b);
  await page.fill('#bsem-co2-cheio', '3'); await page.fill('#bsem-co2-vazio', '0');
  const b2 = await page.evaluate(() => { const x = [...document.querySelectorAll('#barris-semanal-trava-overlay button')].find(x => /Confirmar contagem|Falta|Adicione/.test(x.textContent)); return { txt: x.textContent.trim(), off: x.disabled }; });
  check('…com 3 cheios e 0 vazios (0 vale), libera', b2.off === false && /Confirmar contagem \(2\)/.test(b2.txt), b2);
  const g = await page.evaluate(async () => {
    window.__post = []; window.showToast = () => {};
    await _confirmarContagemBarrisSemanal();
    // Desde 23/11: uma chamada só (rpc/gn_barris_semanal_registrar) com a confirmação e as linhas.
    const rpc = (window.__post.find(p => /gn_barris_semanal_registrar/.test(p.url)) || {}).body || {};
    const linhas = rpc.p_linhas || [];
    const conf = { rodada: rpc.p_rodada, semana_inicio: rpc.p_semana };
    return { linhas, conf };
  });
  const co2 = g.linhas.filter(x => x.tipo === 'CO2');
  check('grava rodada QUI na quinta (19/11): 2 barris + 3 cilindros CO2 CHEIO', g.linhas.length === 5 && g.linhas.every(x => x.rodada === 'QUI' && x.semana_inicio === '2026-11-19') && co2.length === 3 && co2.every(x => x.status === 'CHEIO'), g.linhas);
  check('…e a confirmação com rodada QUI', g.conf.rodada === 'QUI' && g.conf.semana_inicio === '2026-11-19', g.conf);
  todos.push(...erros); await ctx.close();

  // ── Painel › Barris ───────────────────────────────────────────────────────
  const c2 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(c2, '2026-11-19T15:00:00');
  await c2.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const p2 = await c2.newPage();
  const erros2 = []; p2.on('pageerror', e => erros2.push(String(e.message || e)));
  await p2.goto('file://' + HOME);
  await p2.waitForFunction(() => { try { return typeof _loadBarrisSemanalGerencia === 'function'; } catch (e) { return false; } }, null, { timeout: 30000 });
  const painel = await p2.evaluate(async () => {
    window.gnFetchJson = async (url, h, c, fb) => {
      if (c === 'barrisSem:contagens') return [
        { id: 1, loja_slug: 'bangu', semana_inicio: '2026-11-16', tipo: 'CLARO', status: 'CHEIO', validade: '2026-11-30', criado_em: '2026-11-16T11:00:00Z' },
        { id: 2, loja_slug: 'bangu', semana_inicio: '2026-11-16', tipo: 'CO2', status: 'CHEIO', criado_em: '2026-11-16T11:00:00Z' },
        { id: 3, loja_slug: 'bangu', semana_inicio: '2026-11-19', tipo: 'CLARO', status: 'CHEIO', validade: '2026-11-30', criado_em: '2026-11-19T13:00:00Z' },
        { id: 4, loja_slug: 'bangu', semana_inicio: '2026-11-19', tipo: 'CLARO', status: 'VAZIO', criado_em: '2026-11-19T13:00:00Z' },
        { id: 5, loja_slug: 'bangu', semana_inicio: '2026-11-19', tipo: 'CO2', status: 'CHEIO', criado_em: '2026-11-19T13:00:00Z' },
        { id: 6, loja_slug: 'bangu', semana_inicio: '2026-11-19', tipo: 'CO2', status: 'CHEIO', criado_em: '2026-11-19T13:00:00Z' },
        { id: 7, loja_slug: 'bangu', semana_inicio: '2026-11-19', tipo: 'CO2', status: 'VAZIO', criado_em: '2026-11-19T13:00:00Z' },
        { id: 8, loja_slug: 'caxias', semana_inicio: '2026-11-16', tipo: 'VINHO', status: 'CHEIO', validade: '2026-12-10', criado_em: '2026-11-16T11:00:00Z' },
        { id: 9, loja_slug: 'caxias', semana_inicio: '2026-11-16', tipo: 'CO2', status: 'VAZIO', criado_em: '2026-11-16T11:00:00Z' },
      ];
      if (c === 'barrisSem:confirmacoes') return [{ loja_slug: 'bangu', semana_inicio: '2026-11-16', confirmado_por: 'Neto' }, { loja_slug: 'bangu', semana_inicio: '2026-11-19', confirmado_por: 'Neto' }, { loja_slug: 'caxias', semana_inicio: '2026-11-16', confirmado_por: 'Jandy' }];
      return fb === undefined ? [] : fb;
    };
    renderDashboard = () => {};
    await _loadBarrisSemanalGerencia();
    const d = _barrisSemGerenciaData.porLoja;
    const h = document.createElement('div'); h.innerHTML = _buildBarrisSemanalPanel(); document.body.appendChild(h);
    const card = nome => { const c = [...h.querySelectorAll('div')].find(x => x.firstElementChild && new RegExp('^' + nome).test((x.firstElementChild.innerText || '').trim()) && x.querySelector('.barris-co2')); return c ? c.innerText.replace(/\s+/g, ' ') : null; };
    const out = { bangu: card('Bangu'), caxias: card('Caxias'), segBangu: d.BANGU.atual, rel: _barrisSemRelatorioTexto().msg };
    h.remove(); return out;
  });
  check('Painel › Bangu: "Contagem de quinta (19/11): 🍺 1 · 🍷 0 com chopp ✅ Neto" e CO2 de quinta "2 cheios · 1 vazio"',
    /Contagem de quinta \(19\/11\): 🍺 1 · 🍷 0 com chopp/.test(painel.bangu || '') && /✅ Neto/.test(painel.bangu) && /CO2: 2 cheios · 1 vazio \(contagem de quinta\)/.test(painel.bangu), painel.bangu);
  check('…a contagem de segunda continua a de sempre (Claro 1, sem misturar a de quinta nem o CO2)', painel.segBangu.CLARO === 1 && painel.segBangu.VINHO === 0, painel.segBangu);
  check('Caxias: "Contagem de quinta (19/11) pendente" e CO2 da segunda "0 cheios · 1 vazio"', /Contagem de quinta \(19\/11\) pendente/.test(painel.caxias || '') && /CO2: 0 cheios · 1 vazio \(contagem de segunda\)/.test(painel.caxias), painel.caxias);
  check('relatório leva a quinta e o CO2', /Contagem de quinta: Claro 1 · Vinho 0 com chopp \(Neto\)/.test(painel.rel) && /CO2: 2 cheios · 1 vazio/.test(painel.rel) && /Contagem de quinta: PENDENTE/.test(painel.rel), painel.rel);
  todos.push(...erros2); await c2.close();

  check('nenhum erro de JavaScript', todos.length === 0, todos);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
