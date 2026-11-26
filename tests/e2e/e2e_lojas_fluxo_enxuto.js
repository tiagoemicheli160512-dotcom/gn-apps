// ETAPA 5 (26/11/2026) — revisão do fluxo de estoque do app Lojas.
// Medido no banco: nas 11 lojas a última venda por prato é de junho e a última contagem
// física de agosto; o Relatório não calcula nada. Decisão do dono: "Enxugar" — Vendas,
// Contagem e Relatório saem da Home e do menu da loja (abas e dados continuam pro mestre);
// a Home mostra só o que a loja alimenta (Estoque inicial e Entradas).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T10:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof goTab === 'function' && typeof render === 'function'; } catch (e) { return false; } }, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  if (!(await page.evaluate(() => typeof _fluxoAntigoVisivel === 'function'))) {
    console.log('FALHOU: a Home enxuta não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const ver = (cfg) => page.evaluate((cfg) => {
    _notaFiscalPendenciasAtivas = []; _entregasVencidasAtivas = []; _barrisSemPendente = false;
    loja = 'PEDREIRA'; usuarioAtual = { nome: 'Ana', cargo: cfg.cargo, loja: 'PEDREIRA' };
    abasPermitidas = cfg.abas || null;
    const k = lojaKey();
    entradasAll[k] = [{ id: 'e1', insumo: 'TOMATE', qtd: 10, nf: '1' }, { id: 'e2', insumo: 'ALHO', qtd: 2, nf: '' }];
    estIniAll[k] = Object.assign({}, estIniAll[k] || {}, { TOMATE: 12 });
    minAll[loja] = { TOMATE: 50 };
    tab = cfg.tabInicial || 'home'; render();
    const vis = id => { const e = document.getElementById(id); return !!e && e.style.display !== 'none'; };
    const fluxo = [...document.querySelectorAll('.flow-btn .flow-title')].map(x => x.textContent.trim());
    const stats = [...document.querySelectorAll('.stats-grid .stat-lbl')].map(x => x.textContent.trim());
    const statEnt = [...document.querySelectorAll('.stats-grid .stat-box')].find(b => /Entradas/.test(b.textContent));
    const r = { tabInicial: tab, fluxo, stats, entradas: statEnt ? statEnt.querySelector('.stat-num').textContent : null,
      nav: { vendas: vis('nav-vendas'), contagem: vis('nav-contagem'), relatorio: vis('nav-relatorio'), estoque: vis('nav-estoque'), entradas: vis('nav-entradas') },
      linkMestre: !!document.querySelector('.fluxo-antigo-mestre'),
      critico: (document.querySelector('.estoque-critico-base') || {}).textContent || '' };
    goTab('contagem'); r.depoisContagem = tab;
    goTab('home');
    return r;
  }, cfg);

  const g = await ver({ cargo: 'gerente' });
  check('Home da loja: o fluxo mostra só o que a loja alimenta (Estoque inicial, Entradas)',
    g.fluxo.some(t => /Estoque Inicial/.test(t)) && g.fluxo.some(t => /Entradas de Mercadoria/.test(t)) && !g.fluxo.some(t => /Vendas do Período|Contagem Física|Relatório/.test(t)), g.fluxo);
  check('topo: Insumos · Entradas · Alertas (sem "Vendas" e "Contados" sempre zerados), Entradas = 2', g.stats.join('|') === 'Insumos|Entradas|Alertas' && g.entradas === '2', g);
  check('menu da loja: Vendas, Contagem e Relatório escondidos; Estoque e Entradas ficam', !g.nav.vendas && !g.nav.contagem && !g.nav.relatorio && g.nav.estoque && g.nav.entradas, g.nav);
  check('…e não dá pra entrar por atalho (goTab não abre a Contagem)', g.depoisContagem === 'home', g.depoisContagem);
  check('Estoque Crítico avisa que é saldo de segunda + entradas (não desconta consumo)', /não desconta/.test(g.critico), g.critico);
  check('loja não vê o atalho do mestre', !g.linkMestre);
  const gAbas = await ver({ cargo: 'gerente', abas: ['home', 'estoque', 'entradas', 'vendas', 'relatorio'] });
  check('mesmo com a aba liberada no cadastro do usuário, a loja não vê Vendas/Relatório', !gAbas.nav.vendas && !gAbas.nav.relatorio && gAbas.nav.estoque, gAbas.nav);
  const gTab = await ver({ cargo: 'gerente', tabInicial: 'relatorio' });
  check('app aberto numa aba escondida (estado salvo) volta pra Home', gTab.tabInicial === 'home', gTab.tabInicial);

  const m = await ver({ cargo: 'mestre' });
  check('mestre: as três abas continuam no menu e abrem', m.nav.vendas && m.nav.contagem && m.nav.relatorio && m.depoisContagem === 'contagem', m);
  check('mestre: a Home mostra o atalho "Só mestre" pras três', m.linkMestre);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
