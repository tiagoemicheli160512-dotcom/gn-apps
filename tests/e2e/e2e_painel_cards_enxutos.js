// Painel de Gestão (07/11/2026): cada card de loja passava de 240 px no celular (mini
// tabela do dia a dia, funcionários, feijoada/rodízio, raio-x, em letra de 7–9 px). Fechado,
// agora mostra nome, posição, faturamento + variação, tendência, meta e a linha de saúde;
// o resto abre no "▾ detalhes" do card — que NÃO entra na loja (o toque no corpo entra).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-07T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard', '_dashCardToggle', '_dashCardTodos']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    const fat = {}, prev = {}, func = {}, buf = {};
    LOJAS_LISTA.forEach((k, i) => { fat[k] = 50000 + i * 1000; prev[k] = 48000; func[k] = 30; buf[k] = { feijoadaLancada: true, feijoadaQtd: 10, feijoada: 900, rodizioLancado: false, rodizioQtd: 0, rodizio: 0, total: 900 }; });
    _dashFat = fat; _dashFatPrev = prev; _dashFuncCount = func; _dashBuffet = buf; _dashTab = 'fat'; _dashViewMode = 'cards';
    window._entrou = null; selecionarLojaMestre = k => { window._entrou = k; };
    renderDashboard();
  });
  const estado = () => page.evaluate(() => {
    const cards = [...document.querySelectorAll('.store-card.has-data')];
    return { n: cards.length, comDetalhe: cards.filter(c => c.querySelector('.sc-det')).length,
      hMax: Math.max(...cards.map(c => Math.round(c.getBoundingClientRect().height))),
      funcVisivel: cards.some(c => /funcs?\b/.test(c.innerText)), valor: /R\$/.test(cards[0].innerText), btn: (document.querySelector('.sc-det-btn') || {}).textContent };
  });
  let e = await estado();
  check('fechado: nenhum card mostra o detalhe (func, feijoada)', e.n > 0 && e.comDetalhe === 0 && !e.funcVisivel, JSON.stringify(e));
  check('fechado: o card continua com o faturamento', e.valor);
  check('fechado: cada card fica baixo (< 190 px)', e.hMax < 190, e.hMax);
  check('o botão diz "▾ detalhes"', /▾ detalhes/.test(e.btn || ''), e.btn);

  await page.click('.store-card.has-data .sc-det-btn');
  e = await estado();
  const entrou = await page.evaluate(() => window._entrou);
  check('"▾ detalhes" abre o detalhe só daquele card', e.comDetalhe === 1 && e.funcVisivel, JSON.stringify(e));
  check('…e NÃO entra na loja (o toque no corpo é que entra)', entrou === null, entrou);
  await page.evaluate(() => { _setDashTab('att'); _setDashTab('fat'); });
  e = await estado();
  check('trocar de aba e voltar: o card aberto continua aberto', e.comDetalhe === 1, JSON.stringify(e));
  await page.click('.store-card.has-data .sc-nome');
  check('tocar no corpo do card continua entrando na loja', !!(await page.evaluate(() => window._entrou)));

  await page.click('.sc-det-todos');
  e = await estado();
  check('"detalhes de todas" abre todos', e.comDetalhe === e.n, JSON.stringify(e));
  const lbl = await page.evaluate(() => document.querySelector('.sc-det-todos').textContent);
  check('…e vira "esconder detalhes"', /esconder/.test(lbl), lbl);
  await page.click('.sc-det-todos');
  e = await estado();
  check('"esconder detalhes" fecha todos', e.comDetalhe === 0, JSON.stringify(e));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
