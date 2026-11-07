// Painel de Gestão (07/11/2026): KPIs numa faixa só, sem repetir.
//  - o quadro "Variação" repetia o −8% e o R$ 617,1k que já estavam no Faturamento → vai
//    junto do Faturamento, em destaque (▲/▼ colorido);
//  - "% Média Meta" sem meta cadastrada era um quadro inteiro de "— configure em Metas" →
//    vira uma linha com atalho; com meta, volta a ser quadro;
//  - no topo, "⚠️ N atenção" era o mesmo número do "lojas ok" (sai sempre), e "N/12 chk"
//    repetia o KPI "CHK Hoje" (sai quando o Painel está na tela).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-07T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard', '_buildKPIRow', '_renderHealthChips']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  const kpis = metas => page.evaluate(metas => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    const fat = {}, prev = {}; _lojasFatConsolidado().forEach(k => { fat[k] = 46000; prev[k] = 50000; });   // −8%
    _dashFat = fat; _dashFatPrev = prev; _dashTab = 'fat';
    const m = {}; if (metas) _lojasFatConsolidado().forEach(k => { m[k] = 40000; }); localStorage.setItem('gn_home_metas', JSON.stringify(m));   // renderDashboard relê daqui
    renderDashboard();
    const tiles = [...document.querySelectorAll('#dash-section .kpi-tile')].map(e => e.innerText.replace(/\s+/g, ' ').trim());
    const aviso = document.querySelector('.kpi-meta-aviso');
    return { tiles, aviso: aviso ? aviso.innerText.replace(/\s+/g, ' ') : null };
  }, metas);
  let k = await kpis(false);
  check('sem meta: dois quadros (Faturamento e CHK Hoje), sem o "Variação" repetido', k.tiles.length === 2 && /^FATURAMENTO/i.test(k.tiles[0]) && /CHK HOJE/i.test(k.tiles[1]) && !k.tiles.some(t => /VARIAÇÃO/i.test(t)), JSON.stringify(k.tiles));
  check('a variação vai dentro do Faturamento, com seta (▼ 8%)', /▼ 8%/.test(k.tiles[0]), k.tiles[0]);
  check('sem meta: uma linha "Nenhuma meta cadastrada — configurar ›" no lugar do quadro vazio', k.aviso && /Nenhuma meta cadastrada/.test(k.aviso) && !k.tiles.some(t => /META/i.test(t)), JSON.stringify(k));
  await page.click('.kpi-meta-aviso');
  check('tocar no aviso abre a aba Metas', await page.evaluate(() => _dashTab === 'metas'));
  k = await kpis(true);
  check('com meta: volta o quadro "% Média Meta" (115%) e some o aviso', k.tiles.some(t => /MÉDIA META/i.test(t) && /100%|115%/.test(t)) && !k.aviso, JSON.stringify(k));

  const chips = cargo => page.evaluate(async cargo => {
    session = { id: 1, nome: 'Tiago', cargo, loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    _fetchFat = async () => ({});
    window.gnFetchJson = async (u, h, c, fb) => fb;   // nenhuma loja com caixa nem checklist
    _manutRedeCache = null;
    await _renderHealthChips();
    return [...document.querySelectorAll('#health-chips > span')].map(e => e.textContent.trim());
  }, cargo);
  let c = await chips('mestre');
  check('topo: "lojas ok" continua', c.some(x => /lojas ok/.test(x)), JSON.stringify(c));
  check('topo: o "N atenção" (mesmo número do "lojas ok") saiu', !c.some(x => /atenção/.test(x)), JSON.stringify(c));
  check('topo com o Painel na tela: o "N/12 chk" saiu (o KPI CHK Hoje diz o mesmo)', !c.some(x => /chk/.test(x)), JSON.stringify(c));
  c = await chips('administrador');
  check('quem não vê o Painel continua com o "N/12 chk"', c.some(x => /chk/.test(x)), JSON.stringify(c));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
