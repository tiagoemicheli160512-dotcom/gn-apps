// 16/11/2026:
//  "No app lojas temos a aba avarias, porém tem loja que não tá fazendo 100%. Precisamos
//   colocar ao final de cada semana, ou seja na segunda-feira, a confirmação de lojas que não
//   colocaram nada, a validação da gerência ou sub."
//  "Pode fazer as 3 [cobrança, trava a partir de terça e lista no Painel] e mergear. No caso
//   dos utensílios, preciso ter a mesma coisa."
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

async function abrir(browser, quando, cen) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, quando);
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), u = decodeURIComponent(req.url());
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/rpc\/verificar_login/.test(u)) {
      const b = JSON.parse(req.postData() || '{}');
      if (b.p_senha !== '1234') return json([]);
      return json([{ nome: b.p_nome, cargo: b.p_nome === 'Julio' ? 'garcom' : 'sub_gerente' }]);
    }
    if (/gn_lojas\?on_conflict=loja/.test(u) && req.method() === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); cen.gravou.push(b); cen.conf[b.loja] = b.all_data;
      return r.fulfill({ status: 201, body: '' });
    }
    if (/gn_lojas\?loja=in\.\(AVARIAS_SEM_SEMANA/.test(u) || /gn_lojas\?loja=eq\.(AVARIAS|UTENSILIOS)_SEM_SEMANA/.test(u)) {
      const linhas = ['AVARIAS_SEM_SEMANA', 'UTENSILIOS_SEM_SEMANA'].filter(l => u.includes(l));
      return json(linhas.map(l => ({ loja: l, all_data: cen.conf[l] || {} })));
    }
    if (/gn_lojas\?loja=in\./.test(u)) return json([{ loja: 'BANGU', av: { BANGU: cen.avarias } }, { loja: 'CAXIAS', av: { CAXIAS: [] } }]);
    if (/gn_lojas\?loja=eq\./.test(u)) { if (cen.falhar) return r.abort('internetdisconnected'); return json([{ all_data: { avariasAll: { BANGU: cen.avarias } } }]); }
    if (/checklist_diario/.test(u)) return json(cen.chk);
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _homeMarcar === 'function' && typeof LOJAS_LISTA !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 25000 });
  return { ctx, page, erros };
}
const render = (page, loja, cargo, master) => page.evaluate(async ([loja, cargo, master]) => {
  LOJAS_LISTA = ['BANGU', 'CAXIAS', 'MAGLIA']; masterLoja = master ? loja : null; _semLanc = {};
  await _renderSemLancHome(true, { nome: 'X', loja: master ? 'GERAL' : loja, cargo, permissoes: {} }, !!master);
  const t = id => { const el = document.getElementById(id); return { txt: el.textContent.replace(/\s+/g, ' ').trim(), estado: el.dataset.homeEstado, info: el.dataset.homeInfo }; };
  const ov = document.getElementById('sem-lanc-trava');
  return { av: t('avarias-semana-home-card'), ut: t('utensilios-semana-home-card'), trava: ov ? ov.textContent.replace(/\s+/g, ' ') : '' };
}, [loja, cargo, !!master]);
const confirmar = (page, tipo, u, p) => page.evaluate(([tipo, u, p]) => {
  _semLanc[tipo].form = true; _semLancPintar();
  document.getElementById(`semlanc-${tipo}-user`).value = u; document.getElementById(`semlanc-${tipo}-senha`).value = p;
  return _semLancConfirmar(tipo);
}, [tipo, u, p]);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const erros = [];
  // ── Segunda 16/11: semana fechada 09–15/11 ──
  const cen = { avarias: [{ ts: '2026-11-12T10:00:00', semana: '2026-11-09', status: 'cancelado' }], chk: [], conf: {}, gravou: [] };
  let a = await abrir(browser, '2026-11-16T09:00:00', cen);
  if (!(await a.page.evaluate(() => typeof _renderSemLancHome === 'function'))) {
    console.log('FALHOU: a validação semanal (avarias e utensílios) não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  let r = await render(a.page, 'BANGU', 'gerente');
  check('segunda, Bangu sem avaria (a cancelada não conta): cobra avarias 09/11 a 15/11', /Avarias da semana 09\/11 a 15\/11: nenhuma lançada/.test(r.av.txt) && /Lançar avaria/.test(r.av.txt) && /Não houve avaria/.test(r.av.txt), r.av.txt);
  check('…e a mesma coisa pros utensílios', /Utensílios da semana 09\/11 a 15\/11: nenhuma quebra lançada/.test(r.ut.txt) && /Lançar quebra/.test(r.ut.txt) && /Não houve quebra/.test(r.ut.txt), r.ut.txt);
  check('os dois em "Precisa de você hoje" (urgente) e avisam que amanhã trava', r.av.estado === 'acao' && /"urgente":true/.test(r.ut.info) && /A partir de amanhã o app trava/.test(r.av.txt), r);
  check('segunda não trava', r.trava === '', r.trava);

  await confirmar(a.page, 'avarias', 'Carol', 'errada');
  r.av = await a.page.evaluate(() => document.getElementById('avarias-semana-home-card').textContent);
  check('senha errada: não registra', /incorretos/.test(r.av) && cen.gravou.length === 0, r.av.slice(0, 160));
  await confirmar(a.page, 'avarias', 'Julio', '1234');
  r.av = await a.page.evaluate(() => document.getElementById('avarias-semana-home-card').textContent);
  check('garçom não pode confirmar', /gerência ou da sub-gerência/.test(r.av) && cen.gravou.length === 0, r.av.slice(0, 160));
  await confirmar(a.page, 'avarias', 'Carol', '1234');
  const pos = await a.page.evaluate(() => ({ av: document.getElementById('avarias-semana-home-card').textContent.trim(), ut: document.getElementById('utensilios-semana-home-card').textContent.trim() }));
  check('sub confirma avarias: grava (AVARIAS_SEM_SEMANA, semana 09/11, Bangu, Carol) e só o card das avarias some', cen.conf.AVARIAS_SEM_SEMANA && cen.conf.AVARIAS_SEM_SEMANA['2026-11-09'].BANGU.nome === 'Carol' && pos.av === '' && /Utensílios/.test(pos.ut), { conf: cen.conf, pos });
  // Utensílio lançado na semana: não cobra.
  cen.chk = [{ data_operacao: '2026-11-13', manutencao: [{ tipo: 'Utensílio / Louça', situacao: 'Quebrou', qtd: 2 }] }];
  r = await render(a.page, 'BANGU', 'gerente');
  check('com quebra de utensílio lançada na semana e avarias confirmadas: nada a cobrar', r.av.txt === '' && r.ut.txt === '', r);
  a.erros.forEach(e => erros.push(e)); await a.ctx.close();

  // ── Terça 17/11: trava pra gerente/sub ──
  const cen2 = { avarias: [], chk: [], conf: {}, gravou: [] };
  a = await abrir(browser, '2026-11-17T10:00:00', cen2);
  r = await render(a.page, 'BANGU', 'gerente');
  check('terça, gerente com as duas pendentes: o app TRAVA, com avarias e utensílios na trava', /Antes de seguir: validação da semana/.test(r.trava) && /Avarias da semana/.test(r.trava) && /Utensílios da semana/.test(r.trava) && /Não sou eu — sair/.test(r.trava), r.trava.slice(0, 300));
  check('…e os cards da Home ficam vazios (o bloco mora na trava)', r.av.txt === '' && r.ut.txt === '', r);
  const rc = await render(a.page, 'BANGU', 'caixa');
  check('caixa não trava (não pode resolver) — vê só os cards', rc.trava === '' && /Avarias da semana/.test(rc.av.txt), rc);
  const rm = await render(a.page, 'BANGU', 'mestre', true);
  check('mestre olhando a loja não trava', rm.trava === '', rm.trava);
  r = await render(a.page, 'BANGU', 'sub_gerente');
  await confirmar(a.page, 'avarias', 'Carol', '1234');
  let t = await a.page.evaluate(() => (document.getElementById('sem-lanc-trava') || {}).textContent || '');
  check('confirma avarias na trava: a trava continua só com os utensílios', /Utensílios da semana/.test(t) && !/Avarias da semana/.test(t), t.slice(0, 200));
  await confirmar(a.page, 'utensilios', 'Carol', '1234');
  t = await a.page.evaluate(() => !!document.getElementById('sem-lanc-trava'));
  check('confirma utensílios: a trava sai e o app libera', t === false && cen2.conf.UTENSILIOS_SEM_SEMANA && cen2.conf.UTENSILIOS_SEM_SEMANA['2026-11-09'].BANGU, cen2.conf);

  // Maglia e falha de rede.
  const mg = await render(a.page, 'MAGLIA', 'gerente');
  check('Maglia fica fora (não citada)', mg.av.txt === '' && mg.ut.txt === '' && mg.trava === '', mg);
  cen2.conf = {}; cen2.falhar = true;
  const fr = await render(a.page, 'BANGU', 'gerente');
  check('sem internet pras avarias: não cobra avarias (falha aberto), só o que deu pra ler', fr.av.txt === '' && /Utensílios/.test(fr.trava + fr.ut.txt), fr);
  cen2.falhar = false;

  // ── Painel › Operação › ✅ Validações ──
  cen2.conf = { AVARIAS_SEM_SEMANA: { '2026-11-09': { BANGU: { nome: 'Carol' } }, '2026-11-02': { BANGU: { nome: 'Carol' } }, '2026-10-26': { BANGU: { nome: 'Carol' } } } };
  cen2.chk = [{ loja: 'Caxias', data_operacao: '2026-11-10', manutencao: [{ tipo: 'Utensílio / Louça' }] }];
  const pn = await a.page.evaluate(async () => {
    LOJAS_LISTA = ['BANGU', 'CAXIAS']; _semLancPainel = null;
    await _loadSemLancPainel();
    const h = document.createElement('div'); h.innerHTML = _buildSemLancPanel();
    return { av: (h.querySelector('[data-tipo="avarias"]') || {}).textContent || '', ut: (h.querySelector('[data-tipo="utensilios"]') || {}).textContent || '', abas: JSON.stringify(DASH_GRUPOS) };
  });
  check('Painel › Operação tem a aba ✅ Validações', /semlanc/.test(pn.abas));
  check('Painel: Bangu aparece como "só confirmando" (0✓ em 3 semanas) e Caxias sem resposta', /só confirmando: Bangu/.test(pn.av) && /Sem resposta da semana 09\/11: Caxias/.test(pn.av), pn.av.replace(/\s+/g, ' ').slice(0, 400));
  check('Painel de utensílios: Caxias lançou (1) na semana 09/11, Bangu sem resposta', /Sem resposta da semana 09\/11: Bangu/.test(pn.ut) && /Caxias/.test(pn.ut), pn.ut.replace(/\s+/g, ' ').slice(0, 300));
  a.erros.forEach(e => erros.push(e)); await a.ctx.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
