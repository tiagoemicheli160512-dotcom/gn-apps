// Painel de Gestão (07/11/2026): antes das abas, ~700 px de cards (alertas, fechamento da
// semana com 11 chips, resultado do mês com mais 11, férias, visitas). Agora cada card é
// UMA linha com o título do próprio card, e tocar abre o card inteiro. Cobra: a linha sai
// do texto do card (não diz outra coisa), card vazio não vira linha, abrir/fechar, card que
// se redesenha sozinho atualiza a linha, o aberto continua aberto quando o Painel redesenha
// (trocar de aba), e botão dentro do card não vira resumo.
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
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard', '_painelTopoOrganizar', '_painelTopoToggle']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  const espera = () => page.evaluate(() => new Promise(r => setTimeout(r, 40)));
  // Builders controlados: dá pra saber exatamente o que cada card diz.
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    const fat = {}; LOJAS_LISTA.forEach(k => { fat[k] = 10000; });
    _dashFat = fat; _dashFatPrev = fat; _dashTab = 'fat';
    window._cardAlertas = '<div style="border-left:3px solid rgb(220, 38, 38)"><div>🚨 Alertas urgentes · 31 ativos</div><div>31 de 31 ainda sem a gerência toda</div><button>🚨 Alertar lojas</button></div>';
    _buildAlertasUrgentesCard = () => window._cardAlertas;
    _buildPendenciasEssenciaisCard = () => '';
    _buildVendaFaltaCard = () => '';
    _buildFechamentoSemanalCard = () => '<div><div>📋 Fechamento da semana 26/10 a 01/11 · 7 de 11 lojas completas</div><div>Bangu 2/2</div><input id="campo-x"></div>';
    _buildCienciaMesCard = () => '<div><div>📊 Resultado de outubro · 1 de 11 lojas viram</div></div>';
    _buildFeriasUmaSemanaCard = () => '';
    _buildVisitasHojeCard = () => '<div><div>📍 Visitas do Dia</div><button>📅 Planejar visita</button><div>Nenhuma visita ou provisão registrada hoje.</div></div>';
    renderDashboard();
  });
  await espera();
  const estado = () => page.evaluate(() => {
    const topo = document.getElementById('painel-topo');
    const rows = [...topo.querySelectorAll('.pt-lista > .pt-row')].map(r => ({ k: r.getAttribute('data-pt'), txt: r.innerText.replace(/\s+/g, ' ').trim(), filete: r.firstElementChild.style.borderLeftColor }));
    const visiveis = [...topo.children].filter(c => !c.classList.contains('pt-lista') && getComputedStyle(c).display !== 'none' && c.innerHTML.trim()).map(c => c.innerText.split('\n')[0]);
    return { rows, visiveis, altura: Math.round(topo.getBoundingClientRect().height) };
  });
  let e = await estado();
  check('4 linhas — os cards com conteúdo; os vazios (pendências, venda faltando, férias) não viram linha', e.rows.length === 4, JSON.stringify(e.rows.map(r => r.txt)));
  check('a linha usa o título do card: nome + o que vem depois do "·"', /Alertas urgentes 31 ativos/.test(e.rows[0].txt) && /Fechamento da semana 26\/10 a 01\/11 7 de 11 lojas completas/.test(e.rows[1].txt), JSON.stringify(e.rows.map(r => r.txt)));
  check('texto de botão não vira resumo (Visitas mostra a frase, não "Planejar visita")', /Nenhuma visita ou provisão/.test(e.rows[3].txt) && !/Planejar/.test(e.rows[3].txt), e.rows[3].txt);
  check('a linha herda a cor do card (alerta em vermelho)', /220, 38, 38/.test(e.rows[0].filete), e.rows[0].filete);
  check('fechado: nenhum card inteiro à vista, só as linhas', e.visiveis.length === 0, JSON.stringify(e.visiveis));
  check('o topo ficou baixo (< 320 px com 4 linhas)', e.altura < 320, e.altura);

  // Abrir
  await page.click('.pt-row[data-pt^="📋"] > div'); await espera();
  e = await estado();
  check('tocar abre o card do fechamento, e só ele', e.visiveis.length === 1 && /Fechamento da semana/.test(e.visiveis[0]), JSON.stringify(e.visiveis));
  // Redesenho do Painel (trocar de aba) com a semana já "virada": a chave não usa números.
  await page.evaluate(() => { _buildFechamentoSemanalCard = () => '<div><div>📋 Fechamento da semana 02/11 a 08/11 · 9 de 11 lojas completas</div><input id="campo-x"></div>'; _setDashTab('att'); });
  await espera();
  e = await estado();
  check('trocar de aba redesenha o Painel e o fechamento continua aberto (mesmo com a semana nova)', e.visiveis.length === 1 && /02\/11 a 08\/11/.test(e.visiveis[0]), JSON.stringify(e.visiveis));
  // Card que se redesenha sozinho (o holder do fechamento troca o próprio innerHTML).
  await page.evaluate(() => { document.getElementById('fecha-painel-card-holder').innerHTML = '<div><div>📋 Fechamento da semana 02/11 a 08/11 · 11 de 11 lojas completas</div></div>'; });
  await espera();
  e = await estado();
  check('card que se redesenha sozinho atualiza a linha (9 → 11 de 11)', e.rows.some(r => /11 de 11 lojas completas/.test(r.txt)), JSON.stringify(e.rows.map(r => r.txt)));
  // Fechar
  await page.click('.pt-row[data-pt^="📋"] > div'); await espera();
  e = await estado();
  check('tocar de novo fecha', e.visiveis.length === 0, JSON.stringify(e.visiveis));
  // Card que fica vazio some da lista.
  await page.evaluate(() => { _buildCienciaMesCard = () => ''; renderDashboard(); });
  await espera();
  e = await estado();
  check('card que ficou vazio sai da lista (3 linhas)', e.rows.length === 3 && !e.rows.some(r => /Resultado/.test(r.txt)), JSON.stringify(e.rows.map(r => r.txt)));
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
