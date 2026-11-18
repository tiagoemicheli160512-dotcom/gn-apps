// Print do dono (18/11/2026, Home da loja › 📋 Resultado das visitas): na auditoria
// reprovada, "🔴 Reprovado — item crítico não conforme (revalidação em até 7 dias)" e o selo
// "🔧 Calibração de Equipamentos e Manutenção Preventiva 50%" passavam da borda do cartão
// (white-space:nowrap). Cobra em 320/360/412 px: nada passa da largura do cartão; a
// classificação longa aparece inteira numa linha própria; a curta ("⚠️ Atenção") continua
// à direita da data; o percentual do selo não se separa do nome no meio.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

const nao = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, { resp: i === 0 ? 'NAO' : 'SIM' }]));
const LINHAS = [
  { id: 'a1', loja: 'Bangu', data: '2026-11-17', tipo: 'padrao', visitante: 'Tiago', finalizada: true,
    dados: { seguranca_alimentos: { finalizada: true, itens: { 0: { resp: 'NAO' }, 1: { resp: 'NAO' }, 2: { resp: 'SIM' } } },
             calibracao_equipamentos: { finalizada: true, itens: { 0: { resp: 'NAO' }, 1: { resp: 'SIM' } } },
             gestao_pessoas: { finalizada: true, itens: nao(4) } } },
  { id: 's1', loja: 'Bangu', data: '2026-11-15', tipo: 'salao', visitante: 'Tiago', finalizada: true,
    dados: { fechada: true, itens: { visual: { limpeza_geral: 5 }, validade: { val_cozinha: 4 }, delivery: { tempo: 10 } } } },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todos = [];
  for (const w of [320, 360, 412]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    page.on('pageerror', e => todos.push(String(e.message || e)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + HOME);
      try { await page.waitForFunction(() => { try { return typeof _vckHomeCardHtml === 'function' && !!window.GNVck; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
      catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
    }
    const r = await page.evaluate(linhas => {
      document.querySelectorAll('body *').forEach(e => { if (getComputedStyle(e).position === 'fixed') e.style.display = 'none'; });
      const box = document.createElement('div'); box.id = 'card-teste'; box.innerHTML = _vckHomeCardHtml(linhas, new Date('2026-11-18T12:00:00'));
      document.body.prepend(box);
      const card = box.firstElementChild, cr = card.getBoundingClientRect();
      const fora = [...card.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > cr.right + 0.5).map(e => (e.className || e.tagName) + ':' + e.textContent.trim().slice(0, 40));
      const classe = card.querySelector('.vck-home-classe');
      const botoes = [...card.querySelectorAll('button')];
      const salao = botoes.find(b => /Supervisão salão|salão/i.test(b.textContent));
      const selo = [...card.querySelectorAll('.vck-home-selo')].find(s => /Calibração/.test(s.textContent));
      return { fora, classe: classe ? classe.textContent.trim() : null, nClasse: card.querySelectorAll('.vck-home-classe').length,
        salaoAtencaoLinhaData: salao ? (!salao.querySelector('.vck-home-classe') && [...salao.querySelectorAll('span')].some(s => /^(⭐|✅|⚠️|🚨)/.test(s.textContent.trim()) && getComputedStyle(s).whiteSpace === 'nowrap')) : null,
        salaoTxt: salao ? salao.innerText.replace(/\s+/g, ' ').slice(0, 120) : null,
        seloPct: selo ? [...selo.querySelectorAll('span')].map(s => s.textContent + '|' + getComputedStyle(s).whiteSpace) : null,
        sw: document.documentElement.scrollWidth, vw: window.innerWidth };
    }, LINHAS);
    check(`${w}px: nada passa da borda do cartão`, r.fora.length === 0 && r.sw <= r.vw, r.fora);
    check(`${w}px: a classificação longa da auditoria aparece inteira, numa linha própria`, r.nClasse === 1 && /Reprovado — item crítico não conforme \(revalidação em até 7 dias\)/.test(r.classe), r);
    check(`${w}px: a curta (Supervisão salão: Atenção/Crítico…) continua ao lado da data`, r.salaoAtencaoLinhaData === true, r);
    check(`${w}px: o percentual do selo não se separa no meio`, r.seloPct && r.seloPct.some(x => /50%\|nowrap/.test(x)), r.seloPct);
    await ctx.close();
  }
  check('nenhum erro de JavaScript', todos.length === 0, todos);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
