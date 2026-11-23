// Lista de barris da contagem semanal (Lojas) legível nos dois temas (23/11/2026).
// As cores eram fixas: âmbar #D97706 do "vence em Xd", fundo #F5F6F8 da linha em dia e
// delta "vs anterior" #dc2626/#16a34a — no tema escuro ficavam apagadas ou estouravam
// numa faixa branca. Passam a vir dos tokens do tema (--txt-amber, --txt-red, --t1…).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + LOJAS, { waitUntil: 'load' });
  await page.waitForFunction(() => { try { return typeof _renderTravaBarrisSemanal === 'function' && _barrisSemItens !== undefined; } catch (e) { return false; } }, null, { timeout: 15000 });

  for (const tema of ['escuro', 'claro']) {
    const r = await page.evaluate((tema) => {
      if (tema === 'escuro') document.documentElement.setAttribute('data-tema', 'escuro');
      else document.documentElement.removeAttribute('data-tema');
      document.querySelectorAll('[id*="verlay"]:not(#barris-semanal-trava-overlay),#login-screen').forEach(e => e.style.display = 'none');
      const iso = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
      _barrisSemPendente = true;
      _barrisSemComparativo = { data: iso(-7), CLARO: 2, VINHO: 0, CO2_CHEIO: 0, CO2_VAZIO: 0 };
      _barrisSemItens = { CLARO: [{ status: 'CHEIO', validade: iso(-1) }], VINHO: [{ status: 'CHEIO', validade: iso(0) }, { status: 'NA_LINHA_CHEIO', validade: iso(60) }] };
      _renderTravaBarrisSemanal();
      const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
      const fundo = el => { // compõe os fundos translúcidos de baixo pra cima
        const pilha = []; for (let e = el; e; e = e.parentElement) pilha.push(getComputedStyle(e).backgroundColor);
        let c = { r: 255, g: 255, b: 255 }; const bodyBg = parse(getComputedStyle(document.body).backgroundColor); if (bodyBg.a > 0) c = bodyBg;
        for (const s of pilha.reverse()) { const p = parse(s); if (!p.a) continue; c = { r: p.r * p.a + c.r * (1 - p.a), g: p.g * p.a + c.g * (1 - p.a), b: p.b * p.a + c.b * (1 - p.a) }; }
        return c;
      };
      const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
      const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      const ov = document.getElementById('barris-semanal-trava-overlay');
      const spans = [...ov.querySelectorAll('span')].filter(s => /venc\.|Cheio|vs anterior|vazio/i.test(s.textContent) && s.children.length === 0);
      return spans.map(s => ({ txt: s.textContent.trim().slice(0, 40), c: +cr(parse(getComputedStyle(s).color), fundo(s)).toFixed(2) }));
    }, tema);
    check(`${tema}: achou os textos da lista (${r.length})`, r.length >= 6);
    for (const x of r) check(`${tema}: "${x.txt}" contraste ${x.c} ≥ 4.5`, x.c >= 4.5);
    if (tema === 'escuro') await page.screenshot({ path: process.env.PRINT || '/dev/null', clip: { x: 0, y: 0, width: 390, height: 900 } }).catch(() => {});
  }
  check('sem erro de JS', erros.length === 0); if (erros.length) console.log(erros);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
