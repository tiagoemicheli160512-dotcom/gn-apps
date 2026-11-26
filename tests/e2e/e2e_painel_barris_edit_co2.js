// Painel › Barris › editar (supervisão), 23/11/2026: "o CO2 não aparece se precisar corrigir,
// só os chopps — o Boulevard lançou 2 vazios a mais". No banco: João (09:51) e Leandro (10:00)
// lançaram a contagem cada um e o CO2 ficou em dobro — 2 cheios e 4 vazios.
// Cobra: a edição mostra o CO2 da contagem que o card mostra (segunda, ou quinta se houve);
// diminuir apaga só as linhas que sobram (CO2 do status certo, as mais novas); aumentar cria
// linhas na mesma rodada/data; sem mudar o CO2 nada de CO2 é enviado; o chopp segue igual.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

const BOULEVARD = (quinta) => [
  { id: 'c1', loja_slug: 'boulevard', semana_inicio: '2026-11-23', tipo: 'CLARO', status: 'CHEIO', validade: '2026-12-10', criado_em: '2026-11-23T12:51:00Z' },
  { id: 'c2', loja_slug: 'boulevard', semana_inicio: '2026-11-23', tipo: 'CLARO', status: 'VAZIO', criado_em: '2026-11-23T12:51:00Z' },
  { id: 'o1', loja_slug: 'boulevard', semana_inicio: '2026-11-23', tipo: 'CO2', status: 'CHEIO', criado_em: '2026-11-23T12:51:37Z' },
  { id: 'o2', loja_slug: 'boulevard', semana_inicio: '2026-11-23', tipo: 'CO2', status: 'VAZIO', criado_em: '2026-11-23T12:51:37Z' },
  { id: 'o3', loja_slug: 'boulevard', semana_inicio: '2026-11-23', tipo: 'CO2', status: 'VAZIO', criado_em: '2026-11-23T12:51:37Z' },
  { id: 'o4', loja_slug: 'boulevard', semana_inicio: '2026-11-23', tipo: 'CO2', status: 'CHEIO', criado_em: '2026-11-23T13:00:07Z' },
  { id: 'o5', loja_slug: 'boulevard', semana_inicio: '2026-11-23', tipo: 'CO2', status: 'VAZIO', criado_em: '2026-11-23T13:00:07Z' },
  { id: 'o6', loja_slug: 'boulevard', semana_inicio: '2026-11-23', tipo: 'CO2', status: 'VAZIO', criado_em: '2026-11-23T13:00:07Z' },
  ...(quinta ? [{ id: 'q1', loja_slug: 'boulevard', semana_inicio: '2026-11-26', tipo: 'CO2', status: 'VAZIO', criado_em: '2026-11-26T13:00:00Z' }] : []),
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todos = [];
  const rodar = async (quando, quinta, fazer) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, quando);
    const reqs = [];
    await ctx.route('**/rest/v1/**', r => {
      const q = r.request();
      if (q.method() !== 'GET') { reqs.push({ m: q.method(), url: decodeURIComponent(q.url()), body: q.postData() ? JSON.parse(q.postData()) : null }); return r.fulfill({ status: q.method() === 'POST' ? 201 : 204, body: '' }); }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => todos.push(String(e)));
    await page.goto('file://' + HOME);
    await page.waitForFunction(() => { try { return typeof _loadBarrisSemanalGerencia === 'function'; } catch (e) { return false; } }, null, { timeout: 30000 });
    const out = await page.evaluate(async ({ linhas, fazer }) => {
      window.gnFetchJson = async (url, h, c, fb) => c === 'barrisSem:contagens' ? linhas : (fb === undefined ? [] : fb);
      renderDashboard = () => {}; window.alert = m => { window.__alert = m; };
      // Desde 26/11/2026 só o MESTRE edita barris ("isso só mestra") — o teste edita como
      // mestre; o bloco do fim confere que supervisão não abre nem grava.
      session = { nome: 'Nathalia', cargo: 'mestre', loja: 'GERAL', permissoes: {} };
      LOJAS_LISTA = ['BOULEVARD'];
      await _loadBarrisSemanalGerencia();
      _abrirEditarBarrisLoja('BOULEVARD');
      const h = document.createElement('div'); h.innerHTML = _buildEditPanelBarris('BOULEVARD');
      const co2 = h.querySelector('.barris-edit-co2');
      const antes = { txt: co2 ? co2.textContent.replace(/\s+/g, ' ') : null, cheio: co2 && co2.querySelector('[data-co2=cheio]').value, vazio: co2 && co2.querySelector('[data-co2=vazio]').value };
      if (fazer) { const set = (k, v) => { const el = document.createElement('input'); el.value = v; _editCo2Change(k, el); }; set('cheio', fazer[0]); set('vazio', fazer[1]); }
      await _salvarEdicaoBarrisLoja();
      return { antes, alerta: window.__alert || null };
    }, { linhas: BOULEVARD(quinta), fazer });
    await ctx.close();
    return { ...out, reqs };
  };

  // 1. Corrigir a duplicata: 2 cheios/4 vazios → 1/2
  const a = await rodar('2026-11-23T20:00:00', false, [1, 2]);
  check('a edição mostra o CO2 (contagem de segunda) com 2 cheios e 4 vazios', /Cilindros de CO2/.test(a.antes.txt || '') && /segunda/.test(a.antes.txt) && a.antes.cheio === '2' && a.antes.vazio === '4', a.antes);
  const dels = a.reqs.filter(r => r.m === 'DELETE').map(r => (r.url.match(/id=eq\.(\w+)/) || [])[1]);
  check('baixar pra 1 cheio e 2 vazios apaga 3 linhas de CO2: o cheio e os 2 vazios mais novos (o4, o5, o6)', JSON.stringify(dels.sort()) === JSON.stringify(['o4', 'o5', 'o6']), a.reqs);
  check('nenhuma linha de chopp é mexida e nada é criado', a.reqs.every(r => r.m === 'DELETE') && !a.alerta, a.reqs);

  // 2. Aumentar cria na mesma rodada/data
  const b = await rodar('2026-11-23T20:00:00', false, [3, 4]);
  const posts = b.reqs.filter(r => r.m === 'POST').map(r => r.body);
  check('subir pra 3 cheios cria 1 linha CO2 CHEIO na contagem de segunda (23/11, rodada SEG)', posts.length === 1 && posts[0].tipo === 'CO2' && posts[0].status === 'CHEIO' && posts[0].semana_inicio === '2026-11-23' && posts[0].rodada === 'SEG' && /edição supervisão/.test(posts[0].criado_por), posts);

  // 3. Sem mexer no CO2: nada de CO2 sai
  const c = await rodar('2026-11-23T20:00:00', false, null);
  check('salvar sem mudar o CO2 não envia nada de CO2', !c.reqs.some(r => /CO2/.test(JSON.stringify(r.body || '')) || /id=eq\.o\d/.test(r.url)), c.reqs);

  // 4. Com contagem de quinta, edita a de quinta (é a que o card mostra)
  const d = await rodar('2026-11-26T20:00:00', true, [1, 1]);
  const p4 = d.reqs.filter(r => r.m === 'POST').map(r => r.body);
  check('na quinta, a edição é da contagem de quinta (0 cheios · 1 vazio)', /quinta/.test(d.antes.txt || '') && d.antes.cheio === '0' && d.antes.vazio === '1', d.antes);
  check('e o cheio novo entra na quinta (26/11, rodada QUI), sem tocar na de segunda', p4.length === 1 && p4[0].semana_inicio === '2026-11-26' && p4[0].rodada === 'QUI' && !d.reqs.some(r => r.m === 'DELETE'), d.reqs);

  check('nenhum erro de JavaScript', todos.length === 0, todos);
  // 6. Só o mestre: supervisão não vê o botão, não abre a edição e não grava.
  {
    const ctx = await browser.newContext();
    const reqsSup = [];
    await ctx.route('**/rest/v1/**', r => { const m = r.request().method(); if (m !== 'GET') reqsSup.push(m + ' ' + r.request().url()); return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
    const page = await ctx.newPage();
    await page.goto('file://' + HOME);
    await page.waitForFunction(() => { try { return typeof _loadBarrisSemanalGerencia === 'function'; } catch (e) { return false; } }, null, { timeout: 30000 });
    const sup = await page.evaluate(async (linhas) => {
      window.gnFetchJson = async (url, h, c, fb) => c === 'barrisSem:contagens' ? linhas : (fb === undefined ? [] : fb);
      renderDashboard = () => {}; window.alert = m => { window.__alert = m; };
      session = { nome: 'Sup', cargo: 'supervisor', loja: 'GERAL', permissoes: {} };
      LOJAS_LISTA = ['BOULEVARD'];
      await _loadBarrisSemanalGerencia();
      const temBotao = /_abrirEditarBarrisLoja/.test(_buildBarrisSemanalPanel());
      session = { nome: 'M', cargo: 'mestre', loja: 'GERAL', permissoes: {} };
      const mestreTem = /_abrirEditarBarrisLoja/.test(_buildBarrisSemanalPanel());
      session = { nome: 'Sup', cargo: 'supervisor', loja: 'GERAL', permissoes: {} };
      _abrirEditarBarrisLoja('BOULEVARD');
      const abriu = _barrisSemEditLoja !== null;
      _barrisSemEditLoja = 'BOULEVARD'; _barrisSemEditItens = { CLARO: [], VINHO: [] };
      await _salvarEdicaoBarrisLoja();
      return { temBotao, mestreTem, abriu, alerta: window.__alert || null };
    }, BOULEVARD('2026-11-23T20:00:00'));
    await ctx.close();
    check('supervisão não vê o ✏️ Editar, não abre a edição e não grava nada (só mestre)', sup.mestreTem && !sup.temBotao && !sup.abriu && /mestre/.test(sup.alerta || '') && !reqsSup.length, { sup, reqsSup });
  }

  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
