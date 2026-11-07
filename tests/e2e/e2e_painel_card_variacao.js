// Painel de Gestão (07/11/2026): no celular, o número dos cards das lojas quebrava no
// meio — "R$ 113,8k -" numa linha e "18%" na de baixo (o hífen é ponto de quebra), e
// "R$" sozinho em cima de "47,7k". Cobra: o valor e a variação nunca se partem; se não
// couberem juntos, a variação inteira desce. E o sinal é o de menos de verdade (−).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 500)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  for (const largura of [390, 360, 320]) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-07T12:00:00');
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + HOME);
      try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard']); break; }
      catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
    }
    const r = await page.evaluate(() => {
      session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
      document.getElementById('home-screen').style.display = 'block';
      document.getElementById('dash-section').style.display = 'block';
      // Os números de 07/11 (os que quebravam) e valores longos.
      const v = [113800, 62900, 57200, 51300, 50500, 47700, 47500, 44100, 41700, 34900, 16100, 999999];
      const p = [138800, 61100, 65000, 49800, 51000, 42600, 50500, 54400, 46300, 30600, 28200, 100000];
      const fat = {}, prev = {}; LOJAS_LISTA.forEach((k, i) => { fat[k] = v[i % v.length]; prev[k] = p[i % p.length]; });
      _dashFat = fat; _dashFatPrev = prev; _dashTab = 'fat'; _dashViewMode = 'cards';
      // A mini-tendência ao lado do valor é o que aperta a linha (sem ela, nada quebrava).
      _dashSparkData = {}; LOJAS_LISTA.forEach((k, i) => { _dashSparkData[k] = [v[i % v.length] * 1.3, v[i % v.length] * 1.1, v[i % v.length] * 1.2, v[i % v.length]]; });
      renderDashboard();
      const linhas = el => { const rg = document.createRange(); rg.selectNodeContents(el); const tops = new Set([...rg.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))); return tops.size; };
      return [...document.querySelectorAll('.store-card .sc-val')].map(el => {
        const diff = el.querySelector('.sc-diff') || el.querySelector('span[title^="Variação"]');
        const valorNo = [...el.childNodes].find(n => n.nodeType === 3);
        let valorLinhas = 0; if (valorNo) { const rg = document.createRange(); rg.selectNodeContents(valorNo); valorLinhas = new Set([...rg.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size; }
        return { txt: el.textContent, valorLinhas, diffLinhas: diff ? linhas(diff) : 1, diff: diff ? diff.textContent : '' };
      });
    });
    const partidos = r.filter(x => x.valorLinhas > 1 || x.diffLinhas > 1);
    check(`${largura} px: nenhum valor nem variação partido em duas linhas (${r.length} cards)`, r.length > 0 && partidos.length === 0, JSON.stringify(partidos));
    if (largura === 390) {
      const neg = r.find(x => /18%/.test(x.diff));
      check('variação negativa com sinal de menos (−18%), não hífen', !!neg && neg.diff === '−18%', JSON.stringify(neg));
      check('positiva continua com + (+3%)', r.some(x => x.diff === '+3%'), JSON.stringify(r.map(x => x.diff)));
    }
    check(`${largura} px: nenhum erro de JavaScript`, erros.length === 0, erros.join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
