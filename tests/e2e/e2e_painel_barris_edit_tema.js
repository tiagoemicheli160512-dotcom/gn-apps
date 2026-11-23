// Painel › Barris › editar contagem (supervisão), tema escuro (23/11/2026, print): o
// "+ Adicionar" ficou ilegível — botão com fundo escuro e SEM cor de texto (fica o preto do
// navegador); selects e inputs também sem cor (o branco do navegador no meio do tema escuro).
// Cobra contraste ≥ 4.5 de todos os campos e botões do painel de edição nos dois temas.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _buildEditPanelBarris === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  for (const tema of ['escuro', 'claro']) {
    const r = await page.evaluate((tema) => {
      if (tema === 'escuro') document.documentElement.setAttribute('data-tema', 'escuro'); else document.documentElement.removeAttribute('data-tema');
      _barrisSemEditItens = { CLARO: [{ status: 'CHEIO', validade: '2026-12-10' }, { status: 'VAZIO' }], VINHO: [{ status: 'CHEIO', validade: '2026-12-10' }] };
      let box = document.getElementById('__t'); if (box) box.remove();
      box = document.createElement('div'); box.id = '__t'; box.style.cssText = 'background:var(--s1);padding:10px';
      box.innerHTML = '<div style="background:var(--s2);padding:10px">' + _buildEditPanelBarris('BANGU') + '</div>';
      document.body.appendChild(box);
      const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
      const fundo = el => { const pilha = []; for (let e = el; e; e = e.parentElement) pilha.push(getComputedStyle(e).backgroundColor);
        let c = { r: 255, g: 255, b: 255 }; for (const s of pilha.reverse()) { const p = parse(s); if (!p.a) continue; c = { r: p.r * p.a + c.r * (1 - p.a), g: p.g * p.a + c.g * (1 - p.a), b: p.b * p.a + c.b * (1 - p.a) }; } return c; };
      const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
      const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      return [...box.querySelectorAll('button, select, input')].filter(el => el.offsetParent).map(el => ({
        el: el.tagName.toLowerCase() + (el.type ? ':' + el.type : '') + ' ' + (el.textContent || el.value || '').trim().slice(0, 14),
        c: +cr(parse(getComputedStyle(el).color), fundo(el)).toFixed(2) }));
    }, tema);
    const ruins = r.filter(x => x.c < 4.5);
    check(`${tema}: todos os ${r.length} campos/botões do painel de edição legíveis (contraste ≥ 4.5)`, r.length >= 7 && ruins.length === 0, ruins.length ? ruins : r);
    const ad = r.filter(x => /Adicionar/.test(x.el));
    check(`${tema}: os 2 "+ Adicionar" legíveis (${ad.map(x => x.c).join(' / ')})`, ad.length === 2 && ad.every(x => x.c >= 4.5), ad);
  }
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
