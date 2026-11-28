// Painel › 🛠 Operação em duas partes (28/11/2026): eram 12 abas numa barra que rolava pro
// lado — várias ficavam escondidas. Agora todas aparecem de uma vez, quebrando linha, em
// "Cobrança e rotina" e "Estoque e mercadoria". Os 5 grupos seguem numa linha e a DRE a um toque.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  for (const largura of [320, 390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 }, timezoneId: 'America/Sao_Paulo' });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-28T10:00:00-03:00');
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
    for (let t = 1; ; t++) { await page.goto('file://' + HOME); try { await page.waitForFunction(() => { try { return typeof _dashGrupoIr === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
    const r = await page.evaluate(() => {
      session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
      document.getElementById('home-screen').style.display = 'block'; document.getElementById('dash-section').style.display = 'block';
      _dashGrupoIr('operacao');
      const sec = document.getElementById('dash-section');
      const tabs = [...sec.querySelectorAll('.dash-secoes .dash-tab')];
      const vis = tabs.filter(b => { const q = b.getBoundingClientRect(); return q.width > 0 && q.left >= -1 && q.right <= window.innerWidth + 1; });
      const titulos = [...sec.querySelectorAll('.dash-secao > div:first-child')].map(x => x.textContent.trim());
      const barraEscondida = getComputedStyle(sec.querySelector('.dash-tabs-wrap')).display === 'none';
      // Tocar numa aba de estoque abre ela e continua no grupo Operação.
      tabs.find(b => /Transferências/.test(b.textContent)).click();
      const abriu = _dashTab === 'emprest' && (document.querySelector('.dash-grupo.on') || {}).dataset.grupo === 'operacao' && !!document.querySelector('.dash-secoes .dash-tab.on');
      return { n: tabs.length, nVis: vis.length, titulos, barraEscondida, abriu, paginaLarga: document.documentElement.scrollWidth > window.innerWidth + 1,
        grupos: document.querySelectorAll('.dash-grupo').length };
    });
    if (largura === 390) await page.screenshot({ path: (CAMINHOS.TMP || '/tmp') + '/operacao_secoes_390.png' });
    check(`${largura}px: as 12 abas da Operação aparecem todas, sem rolar`, r.n === 12 && r.nVis === 12 && r.barraEscondida, r);
    check(`${largura}px: duas partes com título`, JSON.stringify(r.titulos) === JSON.stringify(['Cobrança e rotina', 'Estoque e mercadoria']), r.titulos);
    check(`${largura}px: tocar numa aba abre ela e marca, sem trocar de grupo`, r.abriu, r);
    check(`${largura}px: continuam 5 grupos e sem rolagem de lado`, r.grupos === 5 && !r.paginaLarga, r);
    check(`${largura}px: nenhum erro de JavaScript`, erros.length === 0, erros);
    await ctx.close();
  }
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
