// "Aconteceu em Bangu que o caixa não foi fechado porque as etiquetas vencendo na data de
//  ontem travaram o app após 00h, e tá certo. O que podemos fazer é trocar a regra de
//  travamento até 20h do dia que tá vencendo. Até porque não pode ficar data vencida pro dia
//  seguinte, nunca." (22/11/2026)
//
// Ajuste do dono, no mesmo dia: "mudar pras 10h e, ao invés de travar, pois não virou
// vencida ainda, abrir a lista pra ser trocada antes de travar" — e trava às 22h.
//
// Regra: no dia do vencimento, das 10h às 22h abre a LISTA pra trocar (dá pra fechar, volta
// em 1h); às 22h, se sobrou, TRAVA. O vencido de dias anteriores segue travando sempre. O
// Check-list continua aberto (é onde se corrige). Roda o guardião de verdade, no app do
// Caixa, com o relógio fixado — sem passar hora nem data à mão.
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
  const ler = () => page.evaluate(() => { const t = id => { const o = document.getElementById(id); return o ? o.textContent.replace(/\s+/g, ' ') : null; };
    return { tela: t('gn-validade-bloqueio'), aviso: t('gn-validade-aviso') }; });
  const l = await ler();
  return { ctx, page, tela: l.tela, aviso: l.aviso, erros, ler };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const casos = [];
  const caso = async (...a) => { const r = await abrir(browser, ...a); casos.push(r); return r; };

  let r = await caso('2026-11-21T09:59:00', '2026-11-21');
  check('vence hoje, 09h59: nada (nem aviso, nem trava)', r.tela === null && r.aviso === null, r);
  await r.ctx.close();

  r = await caso('2026-11-21T10:00:00', '2026-11-21');
  check('vence hoje, 10h00: abre a LISTA pra trocar, sem travar', r.tela === null && !!r.aviso, r);
  check('a lista mostra o item "vence hoje" e não o de dezembro', /ETIQUETA CARNE DE SOL\s*vence hoje/.test(r.aviso || '') && !/QUEIJO COALHO/.test(r.aviso || ''), r.aviso);
  check('o aviso diz que trava às 22h', /até as 22h ainda houver item vencendo hoje, os apps travam/.test(r.aviso || ''), r.aviso);
  if (r.aviso) await r.page.click('#gn-val-aviso-depois');
  check('"Lembrar em 1 hora" fecha o aviso e o app fica usável', (await r.ler()).aviso === null);
  const adiado = await r.page.evaluate(() => Number(localStorage.getItem('gn_validade_aviso_adiado') || 0) - Date.now());
  check('o adiamento é gravado por 1 hora', adiado > 59 * 60e3 && adiado <= 60 * 60e3, adiado);
  await CAMINHOS.recarregarPreservando(r.page); await r.page.waitForFunction(() => !!window.gnValidadeAcesso, null, { timeout: 30000 }); await r.page.waitForTimeout(2500);
  check('reabrindo o app dentro da 1 hora: o aviso não volta', (await r.ler()).aviso === null);
  await r.ctx.close();

  r = await caso('2026-11-21T21:59:00', '2026-11-21');
  check('vence hoje, 21h59: ainda é só aviso', r.tela === null && !!r.aviso, r);
  await r.ctx.close();

  r = await caso('2026-11-21T22:00:00', '2026-11-21');
  check('vence hoje, 22h00: TRAVA', !!r.tela && r.aviso === null, r);
  check('a tela de trava diz "vencendo hoje" e explica 10h/22h', /Produto vencendo hoje/.test(r.tela || '') && /trava a partir das 22h \(o aviso começa às 10h\)/.test(r.tela || ''), r.tela);
  await r.ctx.close();

  r = await caso('2026-11-21T23:30:00', '2026-11-21');
  check('vence hoje, 23h30 (fechando o caixa): já travou desde as 22h', !!r.tela, r);
  await r.ctx.close();

  r = await caso('2026-11-22T00:30:00', '2026-11-21');
  check('venceu ontem, 00h30: continua travado', !!r.tela && /Produto vencido na lista/.test(r.tela || ''), r.tela);
  await r.ctx.close();

  r = await caso('2026-11-22T15:00:00', '2026-11-21');
  check('venceu ontem, 15h: trava (vencido não vira aviso)', !!r.tela && r.aviso === null, r);
  await r.ctx.close();

  r = await caso('2026-11-21T21:00:00', '2026-11-22');
  check('vence amanhã, 21h: nada hoje', r.tela === null && r.aviso === null, r);
  await r.ctx.close();

  r = await caso('2026-11-21T22:30:00', '2026-11-21', null, 'supervisor');
  check('supervisor segue livre depois das 22h', r.tela === null && r.aviso === null, r);
  await r.ctx.close();

  r = await caso('2026-11-21T22:30:00', '2026-11-21', CAMINHOS.pub('gn-checklist.html'));
  check('o Check-list segue aberto depois das 22h (é onde se corrige)', r.tela === null && r.aviso === null, r);
  await r.ctx.close();

  if (!GUARD_ENV) {
    const x = await caso('2026-11-21T15:00:00', '2026-11-21', HOME);
    await x.page.evaluate(() => { const a = document.getElementById('gn-validade-aviso'); if (a) a.remove(); });
    const t = await x.page.evaluate(() => { const el = document.getElementById('validades-home-card'); return el ? el.textContent.replace(/\s+/g, ' ') : ''; });
    check('Home às 15h: "vence HOJE · trava às 22h" e o aviso pra resolver antes', /vence HOJE · trava às 22h/.test(t) && /trava os apps às 22h — resolva antes/.test(t), t);
    await x.ctx.close();
  }
  check('nenhum erro de JavaScript', casos.every(c => !c.erros.length), casos.map(c => c.erros).flat());
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
