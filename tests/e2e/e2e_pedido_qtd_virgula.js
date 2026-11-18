// 18/11/2026: "a canela em casca, no pedido que ele [Matheus] fez pra Nova América, não
// salvou — fez três vezes." A canela é em KG; no celular o teclado decimal é com vírgula,
// e o app lia parseFloat('0,5') = 0 (e '1,5' = 1), gravando zero sem aviso.
//
// Cobra, digitando no campo de verdade (oninput/onblur → qtdChanged → upsert no banco):
// "0,5" grava 0.5; "1,5" grava 1.5; "2" continua 2; "0.5" continua 0.5; "1.234,5" = 1234.5;
// apagar grava 0.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const gravados = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    if (/gn_pedido_itens/.test(req.url()) && req.method() === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); gravados.push(Array.isArray(b) ? b[0] : b);
      return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'item-1' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + PEDIDOS);
  await page.waitForFunction(() => { try { return typeof qtdChanged === 'function' && typeof S === 'object' && S !== null; } catch (e) { return false; } }, null, { timeout: 25000 });
  await page.evaluate(() => {
    S.pedidoAtual = { id: 'ped-1', status: 'RASCUNHO' };
    S.catalogo = [{ id: 'c-canela', produto: 'canela em casca', fornecedor: 'CASA NORDESTINA', und: 'KG', custo: 79.9, ativo: true }];
    S.lojas = [{ slug_pedido: 'nova_america', nome_display: 'Nova América' }];
    S.pedidoItens = {};
    const d = document.createElement('div');
    d.innerHTML = `<input id="q" class="qty-input" type="text" inputmode="decimal"
      oninput="qtdChanged('c-canela','nova_america',79.9,this.value)"
      onblur="qtdChanged('c-canela','nova_america',79.9,this.value,true)">`;
    document.body.appendChild(d);
  });

  const digitar = async txt => {
    const antes = gravados.length;
    await page.fill('#q', txt);
    await page.evaluate(() => document.getElementById('q').blur());
    await page.waitForTimeout(700);
    const ult = gravados.slice(antes).pop();
    return { banco: ult ? parseFloat(ult.qtd_pedida) : null, tela: await page.evaluate(() => S.pedidoItens['c-canela'].nova_america.qtd) };
  };

  const a = await digitar('0,5');
  check('"0,5" (vírgula, teclado do celular) grava 0,5 kg — antes gravava 0', a.banco === 0.5 && a.tela === 0.5, a);
  const b = await digitar('1,5');
  check('"1,5" grava 1,5 — antes gravava 1', b.banco === 1.5, b);
  const c = await digitar('2');
  check('"2" continua 2', c.banco === 2, c);
  const d = await digitar('0.5');
  check('"0.5" (ponto) continua 0,5', d.banco === 0.5, d);
  const e = await digitar('1.234,5');
  check('"1.234,5" (milhar com ponto) = 1234,5', e.banco === 1234.5, e);
  const f = await digitar('');
  check('apagar o campo grava 0', f.banco === 0, f);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
