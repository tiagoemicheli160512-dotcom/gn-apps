// "Aconteceu em Bangu que o caixa não foi fechado porque as etiquetas vencendo na data de
//  ontem travaram o app após 00h, e tá certo. O que podemos fazer é trocar a regra de
//  travamento até 20h do dia que tá vencendo. Até porque não pode ficar data vencida pro dia
//  seguinte, nunca." (22/11/2026)
//
// Regra nova: o item que vence HOJE trava os apps a partir das 20h do próprio dia (loja
// aberta, tempo de resolver antes de fechar o caixa). O vencido de dias anteriores segue
// travando sempre. O Check-list continua aberto (é onde se corrige). Roda o guardião de
// verdade, no app do Caixa, com o relógio fixado — sem passar hora nem data à mão.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CAIXA = CAMINHOS.pub('gn-caixa.html');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const GUARD_ENV = process.env.ARQ_GUARD;   // contraprova: o guardião antigo
const fs = require('fs');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

const linhas = validade => [{ loja: 'VALIDADES_BANGU_camaras', all_data: { itens: [
  { id: '1', nome: 'ETIQUETA CARNE DE SOL', validade }, { id: '2', nome: 'QUEIJO COALHO', validade: '2026-12-20' } ] } }];

async function abrir(browser, relogio, validade, url, cargo) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, relogio);
  await ctx.addInitScript(c => { try { localStorage.setItem('gn_session_v1', JSON.stringify({ id: 77, nome: 'Fernando', loja: 'BANGU', cargo: c, permissoes: {}, ts: Date.now() })); } catch (e) {} }, cargo || 'gerente');
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    return r.fulfill({ status: 200, contentType: 'application/json', body: /gn_lojas\?loja=like\.VALIDADES_/.test(u) ? JSON.stringify(linhas(validade)) : '[]' });
  });
  if (GUARD_ENV) await ctx.route('**/gn-validade-acesso.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(GUARD_ENV, 'utf8') }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + (url || CAIXA));
  await page.waitForFunction(() => !!window.gnValidadeAcesso, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const tela = await page.evaluate(() => { const o = document.getElementById('gn-validade-bloqueio'); return o ? o.textContent.replace(/\s+/g, ' ') : null; });
  return { ctx, page, tela, erros };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const casos = [];

  let r = await abrir(browser, '2026-11-21T19:59:00', '2026-11-21'); casos.push(r);
  check('vence hoje, 19h59: o Caixa abre (ainda dá tempo de resolver)', r.tela === null, r.tela);
  await r.ctx.close();

  r = await abrir(browser, '2026-11-21T20:00:00', '2026-11-21'); casos.push(r);
  check('vence hoje, 20h00: o Caixa trava', !!r.tela, r.tela);
  check('a tela diz "vencendo hoje" e mostra o item com "vence hoje"', /Produto vencendo hoje/.test(r.tela || '') && /ETIQUETA CARNE DE SOL\s*vence hoje/.test(r.tela || ''), r.tela);
  check('a tela explica a regra das 20h', /trava a partir das 20h/.test(r.tela || ''), r.tela);
  check('o item que vence em dezembro não entra', !/QUEIJO COALHO/.test(r.tela || ''), r.tela);
  await r.ctx.close();

  r = await abrir(browser, '2026-11-21T23:30:00', '2026-11-21'); casos.push(r);
  check('vence hoje, 23h30 (fechando o caixa): já travou desde as 20h', !!r.tela, r.tela);
  await r.ctx.close();

  r = await abrir(browser, '2026-11-22T00:30:00', '2026-11-21'); casos.push(r);
  check('venceu ontem, 00h30: continua travado (nunca vira o dia vencido)', !!r.tela && /Produto vencido na lista/.test(r.tela || ''), r.tela);
  await r.ctx.close();

  r = await abrir(browser, '2026-11-21T21:00:00', '2026-11-22'); casos.push(r);
  check('vence amanhã, 21h: não trava hoje', r.tela === null, r.tela);
  await r.ctx.close();

  r = await abrir(browser, '2026-11-21T21:00:00', '2026-11-21', null, 'supervisor'); casos.push(r);
  check('supervisor segue livre mesmo depois das 20h', r.tela === null, r.tela);
  await r.ctx.close();

  r = await abrir(browser, '2026-11-21T21:00:00', '2026-11-21', CAMINHOS.pub('gn-checklist.html')); casos.push(r);
  check('o Check-list segue aberto depois das 20h (é onde se corrige)', r.tela === null, r.tela);
  await r.ctx.close();

  // O card da Home avisa antes das 20h e conta como travado depois.
  const card = async relogio => {
    const x = await abrir(browser, relogio, '2026-11-21', HOME);
    const t = await x.page.evaluate(async () => {
      try { if (typeof _loadValidadesHome === 'function') await _loadValidadesHome(); } catch (e) {}
      const el = document.getElementById('validades-home-card'); return el ? el.textContent.replace(/\s+/g, ' ') : '';
    });
    casos.push(x); await x.ctx.close(); return t;
  };
  if (!GUARD_ENV) {
    const antes = await card('2026-11-21T15:00:00');
    check('Home às 15h: "vence HOJE · trava às 20h" e o aviso pra resolver antes', /vence HOJE · trava às 20h/.test(antes) && /trava os apps às 20h — resolva antes/.test(antes), antes);
  }
  check('nenhum erro de JavaScript', casos.every(c => !c.erros.length), casos.map(c => c.erros).flat());
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
