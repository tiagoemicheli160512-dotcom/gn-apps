// "No painel gestão do home, onde tem os cards pra acessar a aba DRE, preciso ir com o botão
//  no teclado até chegar lá. Pode colocar uma seta pra poder correr a barra também." (06/11/2026)
//
// 07/11/2026: as 15 abas viraram 5 GRUPOS numa linha que cabe sem rolar (Vendas, Caixa,
// Equipe, Operação, DRE) e, embaixo, só as abas do grupo. O pedido original segue coberto
// por outro caminho: DRE e Metas ficam a um/dois toques, sem teclado e sem rolar. As setas
// continuam na barra de baixo, pra grupo que não cabe (Equipe, com 5, num celular pequeno):
// aparecem só do lado com aba escondida, clicar rola, e a barra não volta pro começo a
// cada redesenho.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const abrir = async (browser, largura) => {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-07T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', 'DASH_GRUPOS'], ['renderDashboard', '_setDashTab', '_dashTabsRolar', '_dashGrupoIr']); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou (ou falta o código novo)'); }
  }
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    _dashTab = 'fat'; _dashTabsScroll = 0;
    renderDashboard();
  });
  return { ctx, page, erros };
};
const estado = page => page.evaluate(() => {
  const bar = document.getElementById('dash-tabs');
  const vis = id => { const e = document.getElementById(id); return !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; };
  const on = bar.querySelector('.dash-tab.on');
  const br = bar.getBoundingClientRect(), ob = on ? on.getBoundingClientRect() : null;
  const grupos = [...document.querySelectorAll('.dash-grupo')];
  return { scroll: Math.round(bar.scrollLeft), max: bar.scrollWidth - bar.clientWidth,
    esq: vis('dash-tabs-esq'), dir: vis('dash-tabs-dir'),
    onVisivel: !!ob && ob.left >= br.left - 1 && ob.right <= br.right + 1,
    gruposCabem: grupos.length === 5 && grupos.every(b => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().right <= window.innerWidth),
    paginaLarga: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
});

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  // ── O pedido: chegar no DRE e em Metas sem teclado e sem rolar ────────────────────────
  for (const [rotulo, largura] of [['notebook', 1280], ['celular', 390], ['celular pequeno', 320]]) {
    const { ctx, page, erros } = await abrir(browser, largura);
    const e = await estado(page);
    check(`${rotulo}: os 5 grupos cabem inteiros na linha, sem rolar`, e.gruposCabem, JSON.stringify(e));
    // A 320 px a página já passava da tela ANTES dos grupos (botão 📄 do período e a tabela
    // do dia a dia, medido na versão de 07/11 em produção) — problema à parte, fora daqui.
    if (largura >= 360) check(`${rotulo}: sem rolagem de lado na página`, !e.paginaLarga, JSON.stringify(e));
    await page.click('.dash-grupo[data-grupo="dre"]');
    check(`${rotulo}: DRE a um toque`, await page.evaluate(() => _dashTab === 'dre'));
    await page.click('.dash-grupo[data-grupo="vendas"]');
    await page.click('#dash-tabs .dash-tab >> text=Metas');
    check(`${rotulo}: Metas a dois toques`, await page.evaluate(() => _dashTab === 'metas'));
    await page.click('.dash-grupo[data-grupo="caixa"]');
    await page.click('.dash-grupo[data-grupo="vendas"]');
    check(`${rotulo}: voltar ao grupo reabre a última aba usada nele (Metas)`, await page.evaluate(() => _dashTab === 'metas'));
    check(`${rotulo}: nenhum erro de JavaScript`, erros.length === 0, erros.join(' | '));
    await ctx.close();
  }

  // ── Nenhuma das 15 abas ficou de fora (nem em dois grupos) ─────────────────────────────
  {
    const { ctx, page } = await abrir(browser, 390);
    const ids = await page.evaluate(() => DASH_GRUPOS.flatMap(g => g.abas.map(a => a[0])));
    const esperadas = ['fat', 'att', 'cancel', 'sem10', 'presenca', 'ferias', 'xadrez', 'bi', 'barris', 'carnes', 'trios', 'banco', 'extra', 'dre', 'metas'];
    check('as 15 abas de antes estão nos grupos, cada uma uma vez só', ids.length === 15 && esperadas.every(x => ids.filter(y => y === x).length === 1), JSON.stringify(ids));
    // Cada aba abre e marca o grupo certo.
    const r = await page.evaluate(esp => esp.map(t => { _setDashTab(t); const on = document.querySelector('.dash-grupo.on'); const aba = document.querySelector('#dash-tabs .dash-tab.on');
      return { t, grupo: on && on.dataset.grupo, abaOk: _dashGrupoDe(t).abas.length < 2 || !!aba }; }), esperadas);
    check('abrir qualquer aba acende o grupo dela e marca a aba', r.every(x => x.grupo === (({ fat: 'vendas', att: 'vendas', bi: 'vendas', metas: 'vendas', cancel: 'caixa', sem10: 'caixa', dre: 'dre', barris: 'operacao', carnes: 'operacao', trios: 'operacao' })[x.t] || 'equipe') && x.abaOk), JSON.stringify(r));
    await ctx.close();
  }

  // ── As setas, na barra de baixo, quando o grupo não cabe (Equipe a 320 px) ────────────
  {
    const { ctx, page, erros } = await abrir(browser, 320);
    await page.click('.dash-grupo[data-grupo="equipe"]');
    let e = await estado(page);
    check('Equipe a 320 px tem mais abas do que cabe (o caso das setas)', e.max > 0, JSON.stringify(e));
    check('no começo, só a seta da direita aparece', !e.esq && e.dir, JSON.stringify(e));
    const clicar = async lado => { await page.click('#dash-tabs-' + lado); await page.waitForTimeout(500); };
    await clicar('dir');
    const e1 = await estado(page);
    check('clicar › rola a barra pra direita, e a ‹ aparece', e1.scroll > 0 && e1.esq, JSON.stringify(e1));
    for (let i = 0; i < 6 && (await estado(page)).dir; i++) await clicar('dir');
    const fim = await estado(page);
    check('no fim da barra a seta › some', !fim.dir && fim.scroll >= fim.max - 2, JSON.stringify(fim));
    await page.evaluate(() => _setDashTab('extra'));
    await page.waitForTimeout(150);
    const depois = await estado(page);
    check('trocar de aba redesenha o Painel e a barra continua onde estava, com a aba à vista', depois.scroll > 0 && depois.onVisivel, JSON.stringify(depois));
    await clicar('esq');
    const volta = await estado(page);
    check('‹ rola de volta', volta.scroll < depois.scroll && volta.dir, JSON.stringify(volta));
    await page.evaluate(() => { _dashTabsScroll = 0; _dashTab = 'extra'; renderDashboard(); });
    const ultima = await estado(page);
    check('abrindo direto numa aba do fim, ela aparece sem precisar rolar', ultima.onVisivel && ultima.esq, JSON.stringify(ultima));
    check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
    await ctx.close();
  }
  // Grupo de uma aba só (DRE): a barra de baixo não aparece.
  {
    const { ctx, page } = await abrir(browser, 390);
    await page.click('.dash-grupo[data-grupo="dre"]');
    const barra = await page.evaluate(() => getComputedStyle(document.querySelector('.dash-tabs-wrap')).display);
    check('grupo DRE (uma aba só): sem barra de abas embaixo', barra === 'none', barra);
    await ctx.close();
  }
  // Monitor largo: nenhuma seta por cima das abas.
  {
    const { ctx, page } = await abrir(browser, 1920);
    await page.click('.dash-grupo[data-grupo="equipe"]');
    const e = await estado(page);
    check('monitor de 1920 px: tudo cabe e nenhuma seta aparece', e.max <= 0 && !e.esq && !e.dir, JSON.stringify(e));
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
