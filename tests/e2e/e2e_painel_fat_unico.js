// Painel de Gestão (07/11/2026): o faturamento da semana aparecia TRÊS vezes, um embaixo
// do outro — chip "📈 R$ 567,7k / sem" no topo, KPI "Faturamento R$ 567,7k" e o card
// "Faturamento total R$ 567.664,69". E o card somava LOJAS_LISTA inteira, com a Maglia,
// que nunca entra no consolidado (CLAUDE.md) — só não aparecia porque ela estava sem dados.
// Agora: o KPI é o único lugar (valor exato no title; "sem dados: X" das lojas do
// consolidado), o card saiu, e o chip só aparece pra quem não vê o Painel.
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
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard', '_buildKPIRow', '_renderHealthChips']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  // Maglia COM venda (o caso que o card antigo somava errado); Campo Grande sem venda.
  const painel = await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    const fat = {}; LOJAS_LISTA.forEach(k => { fat[k] = 10000; }); const cg = LOJAS_LISTA.find(k => LOJA_DISPLAY[k] === 'Campo Grande'); fat[cg] = 0; fat.MAGLIA = 99999;
    const prev = {}; LOJAS_LISTA.forEach(k => { prev[k] = 10000; });
    _dashFat = fat; _dashFatPrev = prev; _dashTab = 'fat'; _dashViewMode = 'cards';
    renderDashboard();
    const ds = document.getElementById('dash-section');
    const tile = [...ds.querySelectorAll('.kpi-tile')].find(e => /Faturamento/.test(e.textContent));
    return { cons: !!ds.querySelector('.cons-card .cons-val'), totalTexto: /FATURAMENTO TOTAL/i.test(ds.innerText),
      tile: tile ? tile.innerText.replace(/\s+/g, ' ') : '', title: tile ? (tile.querySelector('[title]') || {}).title : '',
      ckeys: LOJAS_LISTA.length, temCG: LOJAS_LISTA.includes('CAMPO_GRANDE') };
  });
  check('o card "Faturamento total" saiu do Painel', !painel.cons && !painel.totalTexto);
  // 11 lojas do consolidado, menos Campo Grande (0) = 10 × 10.000; a Maglia (99.999) fica de fora.
  check('o KPI soma só o consolidado: R$ 100,0k — sem a Maglia', /100,0k/.test(painel.tile) && !/199/.test(painel.tile), painel.tile);
  check('o valor exato fica no title do KPI (R$ 100.000,00)', /100\.000,00/.test(painel.title || ''), painel.title);
  check('o KPI diz quem do consolidado está sem dados (Campo Grande)', /sem dados: Campo Grande/.test(painel.tile), painel.tile);
  check('…e não cita a Maglia, que não é do consolidado', !/Maglia/.test(painel.tile), painel.tile);

  const chips = async (cargo) => page.evaluate(async (cargo) => {
    session = { id: 1, nome: 'Tiago', cargo, loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    const fat = {}; LOJAS_LISTA.forEach(k => { fat[k] = 10000; });
    _fetchFat = async () => fat;
    window.gnFetchJson = async (u, h, c, fb) => fb;
    _manutRedeCache = null;
    await _renderHealthChips();
    return [...document.querySelectorAll('#health-chips span')].map(e => e.textContent).join(' | ');
  }, cargo);
  const mestre = await chips('mestre');
  check('mestre (vê o Painel): o chip "R$ / sem" não repete o KPI', !/\/ sem/.test(mestre), mestre);
  const outro = await chips('administrador');
  check('quem é master mas não vê o Painel continua com o chip do faturamento', /\/ sem/.test(outro), outro);

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
