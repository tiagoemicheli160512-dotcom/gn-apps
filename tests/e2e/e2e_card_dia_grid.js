// "No card da Nova América os valores ficam espremidos, e confunde pra identificar o valor
// da venda do dia a dia. Conseguimos ajustar?" (20/11/2026, com print do Painel em cards)
//
// A grade dia a dia dos cards (linha "Fat") tem 7 colunas estreitas. Com "14,9k", "19,6k" e
// "39,2k" os números encostavam um no outro (14,9k4,7k5,3k…). Acima de 10 mil o valor vai
// sem casa decimal (15k, 39k) e uma divisória fina separa os dias. Prova na tela de 390 px,
// com os valores do print: nenhum valor transborda a coluna dele.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

// Semana de 16 a 22/11/2026; hoje é sábado 21. Valores do print da Nova América.
const NA = { '2026-11-16': 14900, '2026-11-17': 4700, '2026-11-18': 5300, '2026-11-19': 19600, '2026-11-20': 39200 };
const linhas = [];
Object.entries(NA).forEach(([d, v]) => linhas.push({ loja: 'Nova América', data_operacao: d, venda_salao: v, venda_delivery: 0 }));
// Uma loja pequena, pra conferir que valor abaixo de 10 mil segue com a casa decimal.
[['2026-11-16', 4900], ['2026-11-17', 980], ['2026-11-18', 9960]].forEach(([d, v]) => linhas.push({ loja: 'Bangu', data_operacao: d, venda_salao: v, venda_delivery: 0 }));

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  for (const largura of [390, 360]) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-21T15:00:00');
    await ctx.route('**/rest/v1/**', async route => {
      const u = decodeURIComponent(route.request().url());
      const m = /checklist_diario\?.*data_operacao=gte\.(\d{4}-\d\d-\d\d)&data_operacao=lte\.(\d{4}-\d\d-\d\d)/.exec(u);
      if (m) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(linhas.filter(l => l.data_operacao >= m[1] && l.data_operacao <= m[2])) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + HOME);
      try { await page.waitForFunction(() => { try { return typeof _loadDashAll === 'function' && typeof renderDashboard === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
      catch (e) { if (t >= 3) { console.log('FALHOU: o painel não carregou'); process.exit(1); } }
    }
    if (largura === 390) {
      const existe = await page.evaluate(() => typeof _diaGridFmt === 'function');
      if (!existe) { console.log('FALHOU: o formato da grade dia a dia não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }
      const f = await page.evaluate(() => [14900, 39200, 9960, 9940, 4730, 980, 0].map(_diaGridFmt));
      check('formato: 14.900 → 15k, 39.200 → 39k, 9.960 → 10k, 9.940 → 9,9k, 4.730 → 4,7k, 980 → 980, 0 → —',
        f.join('|') === '15k|39k|10k|9,9k|4,7k|980|—', f);
    }
    const r = await page.evaluate(async () => {
      session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
      LOJAS_LISTA = GN_LOJAS.map(l => l.userKey);
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('home-screen').style.display = 'flex';
      document.getElementById('dash-section').style.display = 'block';
      _dashPer = 'sem'; _dashWoff = 0; _dashViewMode = 'cards'; _dashTab = typeof _dashTab === 'string' ? _dashTab : 'visao';
      for (let i = 0; i < 200 && _dashLoading; i++) await new Promise(r => setTimeout(r, 50));
      await _loadDashAll();
      LOJAS_LISTA.forEach(k => _dashCardAbertos.add(k));   // "detalhes" aberto, como no print
      renderDashboard();
      await new Promise(r => setTimeout(r, 300));
      const linhaDe = nome => {
        // O menor elemento que tem o nome da loja e a grade dela.
        const cands = [...document.querySelectorAll('#dash-section *')].filter(el => el.querySelector('td.dg-fat') && el.textContent.includes(nome));
        const card = cands.reverse().find(el => true);
        if (!card) return null;
        const tds = [...card.querySelectorAll('td.dg-fat')];
        return { txt: tds.map(td => td.textContent.trim()), transborda: tds.filter(td => td.scrollWidth > td.clientWidth + 0.5).map(td => td.textContent.trim()),
                 separados: tds.slice(1).every(td => getComputedStyle(td).borderLeftStyle === 'solid') };
      };
      return { na: linhaDe('Nova Am'), bangu: linhaDe('Bangu'), largura: document.documentElement.scrollWidth };
    });
    const pre = `${largura}px: `;
    check(pre + 'card da Nova América mostra os dias da semana', r.na && r.na.txt.slice(0, 5).join(' ') === '15k 4,7k 5,3k 20k 39k', r.na && r.na.txt);
    check(pre + 'nenhum valor do dia transborda a coluna dele (não encosta no vizinho)', r.na && r.na.transborda.length === 0, r.na && r.na.transborda);
    check(pre + 'divisória entre os dias', r.na && r.na.separados);
    check(pre + 'abaixo de 10 mil segue com a casa decimal (Bangu: 4,9k · 980 · 10k)', r.bangu && r.bangu.txt.slice(0, 3).join(' ') === '4,9k 980 10k', r.bangu && r.bangu.txt);
    check(pre + 'sem rolagem de lado', r.largura <= largura, r.largura);
    check(pre + 'nenhum erro de JavaScript', erros.length === 0, erros);
    await ctx.close();
  }
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
