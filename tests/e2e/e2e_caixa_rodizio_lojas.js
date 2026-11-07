// "Nova América só tem feijoada, e os valores não batem" (07/11/2026). A conta do Painel
// estava certa (13 × 69,90 = R$ 908,70; 10 meias de rodízio × 39,95 = R$ 399,50) — o erro
// era lançamento: o caixa da Nova América de 06/11 gravou 10 "meias de rodízio" e o do
// Rancho de 02/11, 43, nenhuma das duas serve rodízio (zerados no banco). A causa: o app
// Caixa mostrava o campo de rodízio pra TODA loja. Agora só nas que servem rodízio
// (GN_BUFFET_RODIZIO, definido pelo dono): Bangu, Boulevard, Itaquera, São Gonçalo,
// Pedreira e Campo Grande. A feijoada continua pra todas.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  await page.goto('file://' + ARQ);
  try { await page.waitForFunction(() => { try { return typeof renderBuffet === 'function' && typeof S !== 'undefined' && !!window.GN_BUFFET_PRECOS; } catch (e) { return false; } }, { timeout: 25000 }); }
  catch (e) { console.log('FALHOU: o app Caixa não carregou'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }

  const tela = (loja, data) => page.evaluate(({ loja, data }) => {
    S.user = { nome: 'Tiago', cargo: 'gerente' };
    S.loja = loja; S.modoConsulta = false;
    S.fech = { id: 'f-' + loja + data, loja, data, turno: 'NOITE', status: 'ABERTO' };
    renderBuffet();
    const sec = document.getElementById('secBuffet');
    return { visivel: getComputedStyle(sec).display !== 'none',
      campos: ['feijoada_inteira', 'feijoada_meia', 'rodizio_inteira', 'rodizio_meia'].filter(c => !!document.getElementById('bf_' + c)),
      titulo: document.getElementById('buffetTitulo').innerText, doDia: buffetCamposDoDia(), payload: buffetPayload() };
  }, { loja, data });

  // Sexta 06/11/2026 (tem feijoada) e quarta 04/11 (não tem).
  let r = await tela('NOVA AMERICA', '2026-11-06');
  check('Nova América na sexta: só feijoada (inteira e meia), sem o campo de rodízio',
    r.visivel && r.campos.join(',') === 'feijoada_inteira,feijoada_meia', JSON.stringify(r));
  check('…e o título diz "Buffet de feijoada", não "& Rodízio"', /Buffet de feijoada/.test(r.titulo) && !/Rodízio/.test(r.titulo), r.titulo);
  check('o que vai pro banco não leva rodízio (null)', r.payload.rodizio_inteira === null && r.payload.rodizio_meia === null, JSON.stringify(r.payload));
  r = await tela('NOVA AMERICA', '2026-11-04');
  check('Nova América na quarta (sem feijoada, sem rodízio): a seção de buffet nem aparece', !r.visivel && r.doDia.length === 0, JSON.stringify(r));
  r = await tela('RANCHO', '2026-11-02');
  check('Rancho na segunda: seção escondida (o caso das 43 meias de 02/11)', !r.visivel, JSON.stringify(r));

  for (const loja of ['BANGU', 'BOULEVARD', 'ITAQUERA', 'SÃO GONÇALO', 'PEDREIRA', 'CAMPO GRANDE']) {
    r = await tela(loja, '2026-11-06');
    check(`${loja} (serve rodízio), sexta: feijoada e rodízio`, r.visivel && r.campos.length === 4 && /Rodízio/.test(r.titulo), JSON.stringify(r));
  }
  r = await tela('ITAQUERA', '2026-11-04');
  check('Itaquera na quarta: só rodízio (feijoada é sexta e sábado)', r.visivel && r.campos.join(',') === 'rodizio_inteira,rodizio_meia', JSON.stringify(r));
  for (const loja of ['CAXIAS', 'NORTE SHOPPING', 'GUARULHOS']) {
    r = await tela(loja, '2026-11-07');
    check(`${loja} no sábado: só feijoada`, r.visivel && r.campos.join(',') === 'feijoada_inteira,feijoada_meia', JSON.stringify(r));
  }
  r = await tela('MAGLIA', '2026-11-07');
  check('Maglia continua sem buffet nenhum', !r.visivel, JSON.stringify(r));
  // A trava de fechar continua igual: Pedreira (obrigatória) cobra o rodízio; Itaquera não.
  const obrig = await page.evaluate(() => ({ ped: gnBuffetCamposObrigatorios('PEDREIRA', 3), ita: gnBuffetCamposObrigatorios('ITAQUERA', 3) }));
  check('a obrigatoriedade não mudou (Pedreira cobra rodízio, Itaquera não)', obrig.ped.includes('rodizio_inteira') && !obrig.ita.includes('rodizio_inteira'), JSON.stringify(obrig));
  check('toda loja obrigada a lançar rodízio está na lista das que servem rodízio',
    await page.evaluate(() => GN_BUFFET_OBRIGATORIO.every(k => GN_BUFFET_RODIZIO.includes(k))));
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
