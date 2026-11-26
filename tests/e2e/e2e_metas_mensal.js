// ETAPA 4 (26/11/2026) — Painel › Metas.
// "Na aba Metas, o valor cadastrado deve ser sempre considerado como meta mensal. A partir
//  desse valor, quando selecionarmos semana, dia ou trimestre, o sistema deverá fazer
//  automaticamente o cálculo proporcional ao período selecionado."
// E um cadastro só pra rede (gn_metas_lojas): antes cada gestor tinha o seu, no próprio
// usuário, e o Painel comparava o número mensal com a venda da SEMANA.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T12:00:00');
  const posts = [];
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (/gn_metas_lojas/.test(u) && r.request().method() === 'POST') { posts.push({ u, b: JSON.parse(r.request().postData() || '{}'), p: r.request().headers()['prefer'] }); return r.fulfill({ status: 201, body: '' }); }
    if (/gn_metas_lojas/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ loja: 'BANGU', meta_mensal: 300000, atualizado_por: 'Tiago' }, { loja: 'CAXIAS', meta_mensal: 120000 }]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof renderDashboard === 'function' && typeof _dashMetaDe === 'function'; } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  if (!(await page.evaluate(() => typeof _metaMensalPara === 'function'))) {
    console.log('FALHOU: a meta mensal proporcional não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const r = await page.evaluate(async () => {
    const P = _metaMensalPara;
    const dias = (de, n) => Array.from({ length: n }, (_, i) => { const d = new Date(de + 'T12:00:00'); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
    const conta = {
      mes: P(300000, dias('2026-11-01', 30)), sem: P(300000, dias('2026-11-23', 7)), dia: P(300000, ['2026-11-26']),
      virada: P(300000, dias('2026-11-28', 7)),                   // 3 dias de nov (30) + 4 de dez (31)
      tri: P(300000, dias('2026-10-01', 31).concat(dias('2026-11-01', 30), dias('2026-12-01', 31))),
      zero: P(0, dias('2026-11-01', 30)),
    };
    // Carrega do cadastro único (sem loop de redesenho).
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    let renders = 0; const orig = renderDashboard; renderDashboard = function () { renders++; return orig.apply(this, arguments); };
    _dashMetasCarregadas = false; _dashMetasSyncEm = 0; _dashTab = 'fat';
    renderDashboard();
    await new Promise(r => setTimeout(r, 800));
    const carregadas = JSON.parse(JSON.stringify(_dashMetas));
    const rendersDepois = renders;
    await new Promise(r => setTimeout(r, 800));
    const semLoop = renders === rendersDepois;
    // _dashMetaDe acompanha o período navegado.
    const per = {};
    [['mes', 0], ['sem', 0], ['dia', 0], ['tri3', 0]].forEach(([p, o]) => { _dashPer = p; _dashSetOff(o); per[p] = Math.round(_dashMetaDe('BANGU')); });
    _dashPer = 'mes'; _dashSetOff(0);
    // Aba Metas: mestre edita; supervisor só vê.
    _dashTab = 'metas'; _dashPer = 'sem'; renderDashboard();
    const inp = document.querySelector('.meta-input[data-loja="BANGU"]');
    const telaMestre = { disabled: inp && inp.disabled, periodo: (document.querySelector('.meta-periodo') || {}).textContent || '', explica: (document.querySelector('.metas-explica') || {}).textContent || '' };
    _saveMeta('BANGU', '310000');
    await new Promise(r => setTimeout(r, 1500));
    session = { id: 2, nome: 'Sup', cargo: 'supervisor', loja: 'GERAL', permissoes: {} };
    renderDashboard();
    const inpSup = document.querySelector('.meta-input[data-loja="BANGU"]');
    const antes = _dashMetas.BANGU;
    _saveMeta('BANGU', '1');
    await new Promise(r => setTimeout(r, 1500));
    return { conta, carregadas, semLoop, per, telaMestre, supDisabled: inpSup && inpSup.disabled, supNaoMudou: _dashMetas.BANGU === antes };
  });
  check('mês de novembro (30 dias): a meta inteira, 300 mil', Math.round(r.conta.mes) === 300000, r.conta);
  check('semana: 7 dias × 300 mil ÷ 30 = 70 mil', Math.round(r.conta.sem) === 70000, r.conta);
  check('dia: 300 mil ÷ 30 = 10 mil', Math.round(r.conta.dia) === 10000, r.conta);
  check('semana que vira o mês soma a fração de cada um (3 dias de nov + 4 de dez = 68.710)', Math.round(r.conta.virada) === 68710, r.conta);
  check('trimestre: as 3 metas mensais inteiras (900 mil)', Math.round(r.conta.tri) === 900000, r.conta);
  check('sem meta cadastrada: zero (o Painel mostra "nenhuma meta")', r.conta.zero === 0);
  check('as metas vêm do cadastro único da rede (gn_metas_lojas)', r.carregadas.BANGU === 300000 && r.carregadas.CAXIAS === 120000, r.carregadas);
  check('carregar do banco não deixa o Painel se redesenhando sem parar', r.semLoop);
  check('o Painel compara com a meta do período navegado (mês 300 mil · semana 70 mil · dia 10 mil · trimestre)', r.per.mes === 300000 && r.per.sem === 70000 && r.per.dia === 10000 && r.per.tri3 > 800000, r.per);
  check('aba Metas: diz que é MENSAL e mostra o equivalente do período (≈ semana)', /Meta MENSAL/.test(r.telaMestre.explica) && /na semana/.test(r.telaMestre.periodo) && r.telaMestre.disabled === false, r.telaMestre);
  check('mestre altera: grava no cadastro único (upsert por loja, com quem alterou)', posts.length === 1 && /on_conflict=loja/.test(posts[0].u) && posts[0].b.loja === 'BANGU' && posts[0].b.meta_mensal === 310000 && posts[0].b.atualizado_por === 'Tiago' && /merge-duplicates/.test(posts[0].p), posts);
  check('supervisor só vê: campo travado e nada grava', r.supDisabled === true && r.supNaoMudou && posts.length === 1, { r: r.supDisabled, posts: posts.length });
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
