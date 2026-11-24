// "O Matheus de São Gonçalo lançou no app Lojas em avarias no dia 18, porém apareceu pra ele
//  a pergunta se não teve avarias pra ele confirmar. Quem tem avaria lançada na semana não
//  precisa assinar, certo?" (23/11/2026)
//
// Certo — e o defeito era de LEITURA: o app Lojas grava as avarias na linha com o nome da loja
// ("SÃO GONÇALO", "NORTE SHOPPING") e a conferência semanal lia a comKey ("SAO_GONCALO",
// "NORTE"), onde não há avaria nenhuma. Medido: São Gonçalo 6 e Norte Shopping 2 avarias em
// 16–22/11, as duas cobradas de "não houve". Aqui o banco de mentira responde como o real.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); c ? ok++ : falhou++; };
const AV = { 'SÃO GONÇALO': [{ id: 'a1', ts: '2026-11-18T15:00:00Z', semana: '2026-11-16', insumo: 'Picanha', status: 'finalizado' }],
             'NORTE SHOPPING': [{ id: 'n1', ts: '2026-11-19T15:00:00Z', semana: '2026-11-16', insumo: 'Arroz', status: 'finalizado' }] };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-23T10:00:00');
  const lidas = [];
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url());
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    // Ninguém assinou a semana 16/11. A de 09/11 todas responderam (como no banco real) —
    // desde 23/11 a cobrança começa pela semana pendente mais antiga (gn-semlanc-acesso.js).
    const ok0911 = { '2026-11-09': { 'SÃO GONÇALO': { nome: 'x' }, 'NORTE SHOPPING': { nome: 'x' }, 'NOVA AMERICA': { nome: 'x' }, 'BANGU': { nome: 'x' } } };
    if (/gn_lojas\?loja=in\./.test(u)) return json([{ loja: 'AVARIAS_SEM_SEMANA', all_data: ok0911 }, { loja: 'UTENSILIOS_SEM_SEMANA', all_data: ok0911 }]);
    const m = /gn_lojas\?loja=eq\.([^&]+)&select=all_data/.exec(u);
    if (m) { lidas.push(m[1]); return json(AV[m[1]] ? [{ all_data: { avariasAll: { [m[1]]: AV[m[1]] } } }] : [{ all_data: {} }]); }
    if (/checklist_diario/.test(u)) return json([{ data_operacao: '2026-11-18', manutencao: [{ tipo: 'Utensílio / Louça' }] }]);
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _renderSemLancHome === 'function' && typeof LOJAS_LISTA !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 25000 });
  const render = loja => page.evaluate(async loja => {
    LOJAS_LISTA = ['SÃO GONÇALO', 'NORTE SHOPPING', 'NOVA AMERICA', 'BANGU']; masterLoja = null; _semLanc = {};
    await _renderSemLancHome(true, { nome: 'Matheus', loja, cargo: 'gerente', permissoes: {} }, false);
    return { av: document.getElementById('avarias-semana-home-card').textContent.replace(/\s+/g, ' ').trim(), qtd: _semLanc.avarias && _semLanc.avarias.qtd };
  }, loja);

  let r = await render('SÃO GONÇALO');
  check('São Gonçalo lançou avaria em 18/11: a conta acha (1 na semana 16–22/11)', r.qtd === 1, r);
  check('e NÃO pede "não houve avaria"', r.av === '', r.av);
  check('lê a linha onde o app Lojas grava (SÃO GONÇALO), não a SAO_GONCALO', lidas.includes('SÃO GONÇALO') && !lidas.includes('SAO_GONCALO'), lidas);
  r = await render('NORTE SHOPPING');
  check('Norte Shopping (2 nomes diferentes também) com avaria: não cobra', r.qtd === 1 && r.av === '', r);
  r = await render('NOVA AMERICA');
  check('Nova América sem avaria na semana: continua cobrando o "não houve"', r.qtd === 0 && /Avarias da semana 16\/11 a 22\/11: nenhuma lançada/.test(r.av), r);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
