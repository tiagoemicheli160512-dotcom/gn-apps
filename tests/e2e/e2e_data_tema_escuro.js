// Campo de data ilegível no tema escuro (23/11/2026, print da contagem de barris no Lojas):
// a regra global de input[type=date] fixava o texto em #1a1a2e e o calendário nativo em
// color-scheme:light — no escuro, texto quase preto sobre fundo #1B1F26. O Caixa tinha a
// mesma regra. O Check-list já resolvia com --esquema-cor; Lojas e Caixa passam a seguir.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQS = {
  lojas: process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html'),
  caixa: process.env.ARQ_CAIXA || CAMINHOS.pub('gn-caixa.html'),
};
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

function lum(rgb) {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  for (const [nome, arq] of Object.entries(ARQS)) {
    const page = await ctx.newPage();
    await page.goto('file://' + arq, { waitUntil: 'load' });
    for (const tema of ['escuro', 'claro']) {
      const m = await page.evaluate((tema) => {
        if (tema === 'escuro') document.documentElement.setAttribute('data-tema', 'escuro');
        else document.documentElement.removeAttribute('data-tema');
        const box = document.createElement('div'); box.className = 'card';
        box.innerHTML = '<input type="date" value="2026-11-22"><input type="date" class="inp-full" value="2026-11-22">';
        document.body.appendChild(box);
        const r = [...box.querySelectorAll('input')].map(i => {
          const cs = getComputedStyle(i);
          return { cor: cs.color, fundo: cs.backgroundColor, esquema: cs.colorScheme };
        });
        box.remove(); return r;
      }, tema);
      m.forEach((x, i) => {
        const c = contraste(x.cor, x.fundo);
        check(`${nome}/${tema}: data #${i + 1} legível (contraste ${c.toFixed(1)} ≥ 4.5)`, c >= 4.5);
        check(`${nome}/${tema}: calendário nativo no esquema ${tema === 'escuro' ? 'dark' : 'light'} (${x.esquema})`,
          x.esquema === (tema === 'escuro' ? 'dark' : 'light'));
      });
    }
    await page.close();
  }
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
