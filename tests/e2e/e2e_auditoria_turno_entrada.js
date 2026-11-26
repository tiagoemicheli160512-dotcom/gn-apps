// Etapa 6 (26/11/2026) — os dois bugs reais que a auditoria de funções duplicadas achou.
//  1. Check-list › Escala › cadastro do funcionário: o select "Turno" não gravava (a função
//     certa era sobrescrita por outra de mesmo nome e 3 argumentos → erro em sel.value).
//  2. App Lojas › Entradas: apagar uma entrada revertia o estoque, mas a entrada voltava da
//     nuvem na sincronização seguinte (a exclusão não era registrada pro merge).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

async function abrir(browser, arq, pronto, semCdn) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T10:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  if (semCdn) await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  page.__erros = []; page.on('pageerror', e => page.__erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + arq);
    try { await page.waitForFunction(pronto, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('não carregou: ' + arq); }
  }
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const erros = [];

  // ── 1. Check-list: turno do funcionário ──
  let { ctx, page } = await abrir(browser, CHK, () => { try { return typeof updComissoesTurno === 'function'; } catch (e) { return false; } });
  const t = await page.evaluate(() => {
    const ops = []; scheduleComissoesOp = m => ops.push(m);
    comissoesWD = { funcs: [{ nome: 'Ana Souza', turno: 'DIA', turnos: [null, null, null, null, null, null, null] }] };
    let erro1 = null; try { updComissoesTurno(0, 'NOITE'); } catch (e) { erro1 = String(e.message); }
    const geral = comissoesWD.funcs[0].turno;
    let erro2 = null; try { (window.updComissoesTurnoDia || (() => { throw new Error('não existe'); }))(0, 2, { value: 'NOITE' }); } catch (e) { erro2 = String(e.message); }
    // O select do cadastro chama mesmo a função do turno GERAL, com 2 argumentos.
    const tpl = String(document.documentElement.innerHTML).includes('onchange="updComissoesTurno(${i},this.value)"') || /updComissoesTurno\(\$\{i\},this\.value\)/.test([...document.scripts].map(s => s.textContent).join('\n'));
    return { erro1, geral, erro2, dia: comissoesWD.funcs[0].turnos[2], geralDepois: comissoesWD.funcs[0].turno, ops: ops.length, tpl };
  });
  check('select "Turno" do cadastro (updComissoesTurno(i, valor)) grava o turno, sem erro', t.erro1 === null && t.geral === 'NOITE', t);
  check('turno do DIA no meio expediente continua funcionando, com nome próprio (updComissoesTurnoDia)', t.erro2 === null && t.dia === 'NOITE' && t.geralDepois === 'NOITE', t);
  check('as duas alterações vão pra fila de gravação', t.ops === 2, t.ops);
  erros.push(...page.__erros); await ctx.close();

  // ── 2. App Lojas: apagar entrada ──
  ({ ctx, page } = await abrir(browser, LOJAS, () => { try { return typeof delEntrada === 'function' && typeof _mergeListaPorLojaSemana === 'function'; } catch (e) { return false; } }, true));
  const e = await page.evaluate(() => {
    loja = 'PEDREIRA'; render = () => {}; autoSave = () => {}; showToast = () => {};
    const k = lojaKey();
    const ent = { id: 'e-123', insumo: 'TOMATE', qtd: 10, nf: '1' };
    entradasAll[k] = [ent, { id: 'e-999', insumo: 'ALHO', qtd: 2 }];
    estIniAll[k] = { TOMATE: 25, ALHO: 2 };
    delEntrada('e-123');
    // A nuvem ainda tem a entrada (o outro aparelho não sincronizou): o merge não pode repescar.
    const nuvem = { [k]: [ent, { id: 'e-999', insumo: 'ALHO', qtd: 2 }] };
    const merged = _mergeListaPorLojaSemana({ [k]: entradasAll[k] }, nuvem, _pendingDelIds.entradasAll);
    return { local: entradasAll[k].map(x => x.id), estoque: estIniAll[k].TOMATE, merged: (merged[k] || []).map(x => x.id), marcada: _pendingDelIds.entradasAll.has('e-123') };
  });
  check('apagar a entrada tira da lista e reverte o estoque (25 − 10 = 15)', e.local.join() === 'e-999' && e.estoque === 15, e);
  check('…e ela NÃO volta da nuvem na sincronização seguinte', e.marcada && e.merged.join() === 'e-999', e);
  erros.push(...page.__erros); await ctx.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
