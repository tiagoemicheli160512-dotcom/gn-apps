// Print do dono (19/11/2026, Home da loja › Resultado das visitas): na auditoria de padrão o
// número grande "6,7%" parecia o resultado — e era só a nota da PIOR seção (Segurança de
// Alimentos). "Gera um erro de leitura."
//
// Cobra: o número grande é a média das seções avaliadas (a mesma conta do ranking da loja),
// com "média das N seções" ao lado; a classificação (reprovado) continua; cada seção mantém o
// seu selo; com uma seção só, o número é o dela (sem "média").
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _vckHomeCardHtml === 'function' && !!window.GNVck; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  const r = await page.evaluate(() => {
    const G = window.GNVck;
    // Segurança: só o 1º item SIM de muitos (nota baixa, com crítico NÃO); Prevenção: tudo SIM.
    const resp = (key, fn) => { const t = G.AUDP_TIPOS.find(x => x.key === key); const itens = {}; t.itens.forEach((it, i) => { itens[i] = { resp: fn(it, i) }; }); return { finalizada: true, itens }; };
    const dados = {
      seguranca_alimentos: resp('seguranca_alimentos', (it, i) => i === 0 ? 'SIM' : 'NAO'),
      prevencao_perdas: resp('prevencao_perdas', () => 'SIM'),
    };
    const notas = ['seguranca_alimentos', 'prevencao_perdas'].map(k => G.calcPadrao(dados, k).nota);
    const media = Math.round((notas[0] + notas[1]) / 2 * 10) / 10;
    const h = document.createElement('div');
    h.innerHTML = _vckHomeCardHtml([{ id: 'a', data: '2026-11-18', tipo: 'padrao', visitante: 'Tiago', dados }], new Date('2026-11-19T12:00:00'));
    document.body.appendChild(h);
    const btn = h.querySelector('button');
    const grande = [...btn.querySelectorAll('span')].find(s => getComputedStyle(s).fontSize === '16px');
    const out = { notas, media, grande: grande && grande.textContent.trim(), sub: (btn.querySelector('.vck-home-notasub') || {}).textContent || '', txt: btn.innerText.replace(/\s+/g, ' ') };
    h.remove();
    // Uma seção só: número é o dela, sem "média".
    const h2 = document.createElement('div');
    h2.innerHTML = _vckHomeCardHtml([{ id: 'b', data: '2026-11-18', tipo: 'padrao', visitante: 'Tiago', dados: { prevencao_perdas: dados.prevencao_perdas } }], new Date('2026-11-19T12:00:00'));
    document.body.appendChild(h2);
    out.uma = { sub: (h2.querySelector('.vck-home-notasub') || {}).textContent || '', txt: h2.innerText.replace(/\s+/g, ' ') };
    h2.remove();
    return out;
  });
  const fmt = n => String(n).replace('.', ',') + '%';
  check('o número grande é a média das seções, não a pior', r.grande === fmt(r.media) && r.grande !== fmt(Math.min(...r.notas)), r);
  check('…com "média das 2 seções" ao lado', /média das 2 seções/.test(r.sub), r.sub);
  check('…a classificação de reprovado (item crítico) continua', /Reprovado — item crítico não conforme/.test(r.txt), r.txt);
  check('…e cada seção mantém o próprio selo (a pior continua visível)', r.txt.includes(fmt(Math.min(...r.notas))) && r.txt.includes(fmt(Math.max(...r.notas))), r.txt);
  check('com uma seção só, o número é o dela, sem "média"', r.uma.sub === '' && /100%/.test(r.uma.txt), r.uma);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
