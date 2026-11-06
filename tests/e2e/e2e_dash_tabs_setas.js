// "No painel gestão do home, onde tem os cards pra acessar a aba DRE, preciso ir com o botão
//  no teclado até chegar lá. Pode colocar uma seta pra poder correr a barra também." (06/11/2026)
//
// A barra de abas do Painel rola na horizontal sem barra de rolagem visível. No celular se
// arrasta com o dedo; no computador, DRE e Metas ficavam escondidas no fim. Esta suíte cobra:
// as setas aparecem só do lado em que há aba escondida, clicar rola, e a barra não volta pro
// começo a cada redesenho (trocar de aba redesenha o Painel inteiro).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  for (const [rotulo, largura] of [['notebook', 1280], ['celular', 390]]) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + HOME);
      try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard', '_setDashTab']); break; }
      catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
    }
    const temSetas = await page.evaluate(() => typeof _dashTabsRolar === 'function');
    if (!temSetas) { check(`${rotulo}: as setas existem`, false); await ctx.close(); continue; }
    await page.evaluate(() => {
      session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
      document.getElementById('home-screen').style.display = 'block';
      document.getElementById('dash-section').style.display = 'block';
      _dashTab = 'fat';
      renderDashboard();
    });
    const estado = () => page.evaluate(() => {
      const bar = document.getElementById('dash-tabs');
      const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
      const on = bar.querySelector('.dash-tab.on');
      const br = bar.getBoundingClientRect(), ob = on ? on.getBoundingClientRect() : null;
      return { scroll: Math.round(bar.scrollLeft), max: bar.scrollWidth - bar.clientWidth,
               esq: vis('dash-tabs-esq'), dir: vis('dash-tabs-dir'),
               onVisivel: !!ob && ob.left >= br.left - 1 && ob.right <= br.right + 1,
               paginaLarga: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
    const clicarSeta = async (lado) => { await page.click('#dash-tabs-' + lado); await page.waitForTimeout(500); };

    let e = await estado();
    check(`${rotulo}: a barra tem mais abas do que cabe (é o problema relatado)`, e.max > 0, JSON.stringify(e));
    check(`${rotulo}: no começo, só a seta da direita aparece`, !e.esq && e.dir, JSON.stringify(e));
    check(`${rotulo}: as setas não alargam a página`, !e.paginaLarga);

    await clicarSeta('dir');
    const e1 = await estado();
    check(`${rotulo}: clicar › rola a barra pra direita`, e1.scroll > 0, JSON.stringify(e1));
    check(`${rotulo}: e a seta ‹ aparece`, e1.esq);

    for (let i = 0; i < 10 && (await estado()).dir; i++) await clicarSeta('dir');
    const fim = await estado();
    check(`${rotulo}: no fim da barra a seta › some`, !fim.dir && fim.scroll >= fim.max - 2, JSON.stringify(fim));
    const dreVisivel = await page.evaluate(() => {
      const bar = document.getElementById('dash-tabs'), br = bar.getBoundingClientRect();
      const b = [...bar.querySelectorAll('.dash-tab')].find(x => /DRE/.test(x.textContent)).getBoundingClientRect();
      return b.left >= br.left - 1 && b.right <= br.right + 1;
    });
    check(`${rotulo}: chega no DRE só com as setas, sem teclado`, dreVisivel);
    // Num monitor largo (1920px) todas as abas cabem: aí nenhuma seta deve aparecer.

    // Trocar de aba redesenha o Painel inteiro: a barra não pode voltar pro começo.
    await page.evaluate(() => _setDashTab('dre'));
    await page.waitForTimeout(150);
    const depois = await estado();
    check(`${rotulo}: depois de abrir o DRE a barra continua onde estava, com o DRE à vista`,
      depois.scroll > 0 && depois.onVisivel, JSON.stringify(depois));

    await clicarSeta('esq');
    const volta = await estado();
    check(`${rotulo}: ‹ rola de volta`, volta.scroll < depois.scroll && volta.dir, JSON.stringify(volta));

    // Painel aberto já numa aba do fim (scroll zerado): a aba escolhida vem à vista sozinha.
    await page.evaluate(() => { _dashTabsScroll = 0; _dashTab = 'metas'; renderDashboard(); });
    const metas = await estado();
    check(`${rotulo}: abrindo direto numa aba do fim, ela aparece sem precisar rolar`, metas.onVisivel && metas.esq, JSON.stringify(metas));

    check(`${rotulo}: nenhum erro de JavaScript`, erros.length === 0, erros.join(' | '));
    await ctx.close();
  }
  // Monitor largo: todas as abas cabem, e nenhuma seta aparece por cima delas.
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 900 } });
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    await page.goto('file://' + HOME);
    await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard']);
    const r = await page.evaluate(() => {
      session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
      document.getElementById('home-screen').style.display = 'block';
      document.getElementById('dash-section').style.display = 'block';
      renderDashboard();
      const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
      const bar = document.getElementById('dash-tabs');
      return { cabe: bar.scrollWidth <= bar.clientWidth, esq: vis('dash-tabs-esq'), dir: vis('dash-tabs-dir') };
    });
    check('monitor de 1920px: tudo cabe e nenhuma seta aparece', r.cabe && !r.esq && !r.dir, JSON.stringify(r));
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
