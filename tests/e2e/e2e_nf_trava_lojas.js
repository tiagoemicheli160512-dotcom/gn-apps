// Trava de NF no app Lojas, religada com a regra recebido × lançado (26/11/2026).
// Decisões do dono: começa pela semana de 23/11 (primeira cobrança na segunda 30/11) e é
// LEVE — só Entradas (e Guia) até a NF lançada chegar à metade do recebido na semana
// fechada. A NF conta pela data da nota (lançada esta semana com data da semana passada vale).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

async function abrir(browser, iso) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, iso);
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  page.__erros = []; page.on('pageerror', e => page.__erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof _calcularNotasFiscaisPendentes === 'function' && typeof goTab === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  return { ctx, page };
}
// cfg: { cargo, loja, rec, nfServ, entradas: {semana: [...]}, falhaRede }
const avaliar = (page, cfg) => page.evaluate(async (cfg) => {
  _entregasVencidasAtivas = []; _barrisSemPendente = false;
  loja = cfg.loja || 'NORTE SHOPPING'; usuarioAtual = { nome: 'Ana', cargo: cfg.cargo || 'gerente', loja }; abasPermitidas = null;
  Object.keys(entradasAll).forEach(k => delete entradasAll[k]);
  Object.entries(cfg.entradas || {}).forEach(([sem, arr]) => { entradasAll[loja + '|' + sem] = arr; });
  window.__rpc = [];
  sbRequest = async (rota, opt) => {
    if (/rpc\/gn_nf_semana/.test(rota)) {
      window.__rpc.push(JSON.parse(opt.body));
      if (cfg.falhaRede) throw new Error('offline');
      return [{ tipo: 'rec', chave: 'norte_shopping', n: 119, valor: cfg.rec }, { tipo: 'nf', chave: loja, n: 0, valor: cfg.nfServ || 0 }];
    }
    return [];
  };
  tab = 'home'; try { render(); } catch (e) {}
  await _atualizarTravaNotaFiscal();
  const pend = JSON.parse(JSON.stringify(_notaFiscalPendenciasAtivas));
  const ov = document.getElementById('nota-fiscal-trava-overlay');
  const texto = ov ? ov.innerText.replace(/\s+/g, ' ') : '';
  goTab('pedido'); const foiPedido = tab === 'pedido';
  goTab('entradas'); const foiEntradas = tab === 'entradas';
  goTab('home');
  return { pend, texto, foiPedido, foiEntradas, rpc: window.__rpc };
}, cfg);

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const erros = [];
  // Hoje (quinta 26/11): a semana fechada é 16/11, antes do início combinado → nunca trava.
  let { ctx, page } = await abrir(browser, '2026-11-26T10:00:00');
  const hoje = await avaliar(page, { rec: 37557.48 });
  check('quinta 26/11 (semana fechada 16/11, antes do início 23/11): não trava ninguém', hoje.pend.length === 0 && hoje.foiPedido && hoje.rpc.length === 0, hoje);
  erros.push(...page.__erros); await ctx.close();

  // Segunda 30/11: semana fechada 23/11 → começa a valer.
  ({ ctx, page } = await abrir(browser, '2026-11-30T10:00:00'));
  const t = await avaliar(page, { rec: 30000 });
  check('30/11: recebeu R$ 30 mil na semana de 23/11 e não lançou NF → trava', t.pend.length === 1 && t.pend[0].semIni === '2026-11-23' && t.rpc[0].p_semana === '2026-11-23', t);
  check('trava LEVE: barra o Pedido e deixa a aba Entradas', !t.foiPedido && t.foiEntradas, t);
  check('a tela diz recebido, lançado e o mínimo pra liberar, e pede a data da nota',
    /Semana de 23\/11 a 29\/11/.test(t.texto) && /Recebido \(confirmado na Entrega\): R\$ 30\.000,00 · 119 itens/.test(t.texto) && /NF lançada: R\$ 0,00 — mínimo pra liberar: R\$ 15\.000,00/.test(t.texto) && /com a data da nota/.test(t.texto), t.texto);
  const nfNaSemanaAtualComDataPassada = await avaliar(page, { rec: 30000, entradas: { '2026-11-30': [{ id: 'a', insumo: 'X', qtd: 100, custoUnit: 160, dataNF: '2026-11-27', nf: '1' }] } });
  check('NF lançada HOJE com data da nota da semana passada (R$ 16 mil) conta e destrava', nfNaSemanaAtualComDataPassada.pend.length === 0 && nfNaSemanaAtualComDataPassada.foiPedido, nfNaSemanaAtualComDataPassada.pend);
  const nfDataDestaSemana = await avaliar(page, { rec: 30000, entradas: { '2026-11-30': [{ id: 'b', insumo: 'X', qtd: 100, custoUnit: 160, dataNF: '2026-11-30', nf: '2' }] } });
  check('NF com data desta semana NÃO conta pra semana passada', nfDataDestaSemana.pend.length === 1, nfDataDestaSemana.pend);
  const abaixo = await avaliar(page, { rec: 30000, entradas: { '2026-11-23': [{ id: 'c', insumo: 'X', qtd: 10, custoUnit: 1400, dataNF: '2026-11-24' }] } });
  check('NF abaixo da metade (R$ 14 mil de 30 mil) continua travando, mostrando o lançado', abaixo.pend.length === 1 && Math.round(abaixo.pend[0].lancado) === 14000, abaixo.pend);
  const servidor = await avaliar(page, { rec: 30000, nfServ: 20000 });
  check('NF já na nuvem (lançada em outro aparelho, R$ 20 mil) → não trava', servidor.pend.length === 0, servidor.pend);
  check('mestre não trava', (await avaliar(page, { rec: 30000, cargo: 'mestre' })).pend.length === 0);
  check('Maglia não trava (não foi citada)', (await avaliar(page, { rec: 30000, loja: 'MAGLIA' })).pend.length === 0);
  check('sem rede: não trava', (await avaliar(page, { rec: 30000, falhaRede: true })).pend.length === 0);
  check('nada recebido na semana: não trava (é a trava de Entrega que cobra a confirmação)', (await avaliar(page, { rec: 0 })).pend.length === 0);
  // Lançar a nota destrava na hora (o lançamento recalcula a trava).
  const lancar = await page.evaluate(async () => {
    loja = 'NORTE SHOPPING'; usuarioAtual = { nome: 'Ana', cargo: 'gerente', loja }; abasPermitidas = null;
    Object.keys(entradasAll).forEach(k => delete entradasAll[k]);
    sbRequest = async (rota) => /rpc\/gn_nf_semana/.test(rota) ? [{ tipo: 'rec', chave: 'norte_shopping', n: 5, valor: 1000 }] : [];
    autoSave = () => {}; showToast = () => {};
    await _atualizarTravaNotaFiscal();
    const antes = _notaFiscalPendenciasAtivas.length;
    addEntrada('TOMATE', '2026-11-28', '55', 'CEASA', 100, 6);   // R$ 600 com data da semana passada
    await new Promise(r => setTimeout(r, 200));
    return { antes, depois: _notaFiscalPendenciasAtivas.length, overlay: !!document.getElementById('nota-fiscal-trava-overlay') };
  });
  check('lançar a nota na aba Entradas destrava na hora, sem recarregar', lancar.antes === 1 && lancar.depois === 0 && !lancar.overlay, lancar);
  erros.push(...page.__erros); await ctx.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
