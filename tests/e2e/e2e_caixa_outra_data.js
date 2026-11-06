// "No app caixa já tenho a opção de relançar, pra esses casos de falha. Pode colocar uma
//  opção de selecionar a data, pra quando for mais antiga eu conseguir acessar." (06/11/2026)
//
// A tela inicial do Caixa só lista os 6 fechados mais recentes. O caso que motivou: Caxias,
// 10/10/2026 — Check-list do dia com venda R$ 0,00, caixa fechado em R$ 27.128,91 (32
// comprovantes), e o "↑ Relançar" desse dia inalcançável. Fixture com os números reais.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const FECH = { id: 'f1010', loja: 'CAXIAS', data: '2026-10-10', turno: 'DIA', status: 'FECHADO', operador: 'Ana',
               repique: 2216.94, total_sistema: 27128.91, total_real: 27128.91 };
// Comprovantes que somam 27.128,80, com 379,00 de delivery (IFOOD).
const COMPS = [{ bandeira: 'Crédito', valor: 20000 }, { bandeira: 'Pix', valor: 6749.80 }, { bandeira: 'IFOOD', valor: 379.00 }];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
  let chk = [{ venda_salao: 0, venda_delivery: 0 }];
  const gravacoes = [];
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), u = req.url(), m = req.method();
    const j = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (m !== 'GET') {
      let corpo = null; try { corpo = JSON.parse(req.postData() || 'null'); } catch (e) {}
      gravacoes.push({ u, corpo });
      if (/checklist_diario/.test(u) && corpo) chk = [{ venda_salao: corpo.venda_salao, venda_delivery: corpo.venda_delivery }];
      return r.fulfill({ status: 204, body: '' });
    }
    if (/gn_caixa_fechamento/.test(u) && /data=eq\.2026-10-10/.test(u)) return j([FECH]);
    if (/gn_caixa_fechamento/.test(u) && /data=eq\./.test(u)) return j([]);
    if (/gn_caixa_comprovante/.test(u)) return j(COMPS);
    if (/checklist_diario/.test(u) && /data_operacao=eq\.2026-10-10/.test(u)) return j(/select=despesas/.test(u) ? [{ despesas: [] }] : chk);
    return j([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try { return typeof mostrarHome === 'function' && typeof relancarChecklist === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  const tem = await page.evaluate(() => typeof _homeOutraData === 'function');
  if (!tem) { console.log('FALHOU: não existe a busca por outra data'); console.log('\n0 OK, 1 falhou'); process.exit(1); }

  await page.evaluate(async () => {
    S.user = { nome: 'Tiago', cargo: 'gerente' }; S.loja = 'CAXIAS'; S._homeOutraData = '';
    ['telaLogin', 'telaTurno', 'app', 'telaBloqueioCaixa'].forEach(id => document.getElementById(id) && document.getElementById(id).classList.add('hidden'));
    window._diaCaixaPendente = async () => null;   // a trava de caixa pendente não é o que se mede aqui
    await mostrarHome();
  });
  await page.waitForTimeout(300);
  const campo = await page.evaluate(() => { const i = document.getElementById('homeOutraDataInput'); return i ? { max: i.max, tipo: i.type } : null; });
  check('a tela inicial tem o campo de escolher a data', !!campo && campo.tipo === 'date', JSON.stringify(campo));
  check('e não deixa escolher data futura (máximo = hoje)', campo && campo.max === '2026-11-06', JSON.stringify(campo));

  await page.fill('#homeOutraDataInput', '2026-10-10');
  await page.dispatchEvent('#homeOutraDataInput', 'change');
  await page.waitForTimeout(400);
  const res = await page.evaluate(() => ({ txt: document.getElementById('homeOutraDataRes').textContent.replace(/\s+/g, ' '),
    botoes: [...document.querySelectorAll('#homeOutraDataRes button')].map(b => b.textContent.trim()) }));
  check('escolhendo 10/10, aparece o caixa daquele dia', /10\/10\/2026/.test(res.txt) && /FECHADO/.test(res.txt), res.txt);
  check('com os mesmos botões: Relançar, Reimprimir e Reabrir', ['↑ Relançar', '🖨️ Reimprimir', '↩ Reabrir'].every(b => res.botoes.includes(b)), JSON.stringify(res.botoes));
  check('e avisa que a venda do Check-list está faltando (R$ 0,00 contra caixa de R$ 27.128,91)', /R\$ 0,00/.test(res.txt) && /está faltando/.test(res.txt), res.txt);

  // Relançar a partir da data escolhida.
  await page.click('#homeOutraDataRes button:has-text("Relançar")');
  await page.waitForTimeout(900);
  const g = gravacoes.filter(x => /checklist_diario/.test(x.u)).pop();
  check('relançar grava no Check-list de 10/10 a venda do caixa: salão R$ 24.532,86 + delivery R$ 379,00',
    g && g.corpo.data_operacao === '2026-10-10' && g.corpo.loja === 'Caxias' &&
    Math.abs(g.corpo.venda_salao - 24532.86) < 0.01 && Math.abs(g.corpo.venda_delivery - 379) < 0.01, JSON.stringify(g && g.corpo));
  const depois = await page.evaluate(() => ({ data: (document.getElementById('homeOutraDataInput') || {}).value,
    txt: (document.getElementById('homeOutraDataRes') || {}).textContent.replace(/\s+/g, ' ') }));
  check('depois de relançar a data continua escolhida e a venda aparece certa (R$ 24.911,86)',
    depois.data === '2026-10-10' && /24\.911,86/.test(depois.txt) && !/está faltando/.test(depois.txt), JSON.stringify(depois));

  // Data sem caixa.
  await page.fill('#homeOutraDataInput', '2026-10-05');
  await page.dispatchEvent('#homeOutraDataInput', 'change');
  await page.waitForTimeout(300);
  check('data sem caixa diz isso', /Nenhum caixa em 05\/10\/2026/.test(await page.evaluate(() => document.getElementById('homeOutraDataRes').textContent)));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
