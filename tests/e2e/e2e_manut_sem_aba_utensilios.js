// "No app Manutenção, na aba Utensílios, não tem nada que puxe ou bata com a loja.
//  Precisamos verificar, se for o caso separar." (22/11/2026)
//
// Levantado: a aba (Contagem / Catálogo / Histórico) usava tabelas só dela
// (gn_utensilios_catalogo: 1 item, de julho; gn_utensilios_contagem: nenhuma linha) que
// nenhum outro app lê. O controle por loja é o do Check-list + Painel › Utensílios. Decisão do
// dono: tirar a aba. Os chamados "Utensílio / Louça" (que repõem o saldo da loja) ficam.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const MANUT = process.env.ARQ_MANUT || CAMINHOS.pub('gn-manutencao.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const pedidos = [];
  await ctx.route('**/rest/v1/**', r => { pedidos.push(r.request().url()); r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + MANUT);
    try { await page.waitForFunction(() => { try { return typeof renderBotNav === 'function' && typeof setFiltro === 'function' && Array.isArray(TIPOS); } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: o app Manutenção não carregou'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  const r = await page.evaluate(async () => {
    S.usuario = { nome: 'Tiago', cargo: 'mestre', loja: 'GERAL' };
    renderBotNav();
    const abas = [...document.querySelectorAll('#botNav .bot-tab')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
    const lateral = [...document.querySelectorAll('.sidebar-link')].map(b => b.textContent.trim());
    await setFiltro('Utensílios');
    const depois = S.filtro;
    const guia = (typeof GUIA_SECOES !== 'undefined' ? GUIA_SECOES : []).map(s => s.num + ' ' + s.titulo);
    return { abas, lateral, depois, primeiro: TIPOS[0].key, guia, tipos: TIPOS.map(t => t.key) };
  });
  check('a barra de baixo não tem mais a aba "Utensílios"', !r.abas.some(a => /^🍽️\s*Utensílios$/.test(a)), r.abas);
  check('a categoria de chamados "Utensílio / Louça" continua (é ela que repõe o saldo da loja)', r.tipos.includes('Utensílio / Louça') && r.abas.some(a => /Utensílio/.test(a)), r.abas);
  check('o menu lateral não tem mais "Utensílios"', !r.lateral.includes('🍽️Utensílios') && !r.lateral.some(l => /^🍽️\s*Utensílios$/.test(l)), r.lateral);
  check('um link antigo pra aba cai na primeira categoria, sem tela quebrada', r.depois === r.primeiro, r);
  check('nada consulta mais as tabelas soltas (catálogo/contagem)', !pedidos.some(u => /gn_utensilios_(catalogo|contagem)/.test(u)), pedidos.filter(u => /utensilios/.test(u)));
  if (r.guia.length) check('o guia não fala mais da aba e segue numerado 01, 02, 03…', !r.guia.some(g => /Utensílios/.test(g)) && r.guia.every((g, i) => g.startsWith(String(i + 1).padStart(2, '0') + ' ')), r.guia);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
