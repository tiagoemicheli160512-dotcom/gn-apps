// Painel › Atenção: pagamento de empréstimo em dinheiro parado há mais de 3 dias (27/11/2026).
// Antes tudo aparecia como "💵 pagamento em dinheiro em validação" — inclusive quando quem
// devia o passo era a outra LOJA (Margarina, Nova América → Norte, 35 dias). Cobra a etapa e
// quem tem que agir: loja aceitar / Compras definir valor / Financeiro validar; até 3 dias sem
// alerta; quitado e finalizado fora; texto da aba Transferências dizendo de quem é a vez.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };
const T = o => Object.assign({ fator: 1, unidade: 'KG', quitado: false, confirmadoOrigem: false, confirmadoDestino: false, pagDinheiroOrigem: false, pagDinheiroDestino: false }, o);
const TF = {
  'NORTE SHOPPING|2026-10-19': [T({ id: 'mg', insumo: 'MARGARINA BALDE 15 L', qtd: 2, unidade: 'UN', data: '2026-10-23T12:00:00Z', origem: 'NOVA AMERICA', destino: 'NORTE SHOPPING', pagDinheiroDestino: true })],
  'CAMPO GRANDE|2026-10-05': [T({ id: 'cs', insumo: 'COSTELA SUINA SALGADA', qtd: 2, data: '2026-10-07T12:00:00Z', origem: 'BANGU', destino: 'CAMPO GRANDE', pagDinheiroOrigem: true, pagDinheiroDestino: true, pagDinheiroAvariaId: 'av1' })],
  'BOULEVARD|2026-11-23': [T({ id: 'cr', insumo: 'CARNE SECA', qtd: 3, data: '2026-11-24T12:00:00Z', origem: 'CAMPO GRANDE', destino: 'BOULEVARD', pagDinheiroOrigem: true, pagDinheiroDestino: true, pagDinheiroAvariaId: 'av2' })],
  'PEDREIRA|2026-11-23': [T({ id: 'nv', insumo: 'NOVO', qtd: 1, data: '2026-11-25T12:00:00Z', origem: 'PEDREIRA', destino: 'CAXIAS', pagDinheiroOrigem: true, pagDinheiroDestino: true, pagDinheiroAvariaId: 'av3' })],
  'BANGU|2026-10-05': [T({ id: 'qt', insumo: 'QUITADO', qtd: 1, data: '2026-10-01T12:00:00Z', origem: 'BANGU', destino: 'CAXIAS', pagDinheiroOrigem: true, pagDinheiroDestino: true, pagDinheiroAvariaId: 'av4', quitado: true })],
};
const AV = {
  'CAMPO GRANDE': { 'CAMPO GRANDE': [{ id: 'av1', tipo: 'transferencia_dinheiro', status: 'loja_confirmou', ts: '2026-10-08T14:00:00Z', loja_conf_ts: '2026-10-09T19:00:00Z' }] },
  'BOULEVARD': { 'BOULEVARD': [{ id: 'av2', tipo: 'transferencia_dinheiro', status: 'pendente', ts: '2026-11-20T10:00:00Z' }] },
  'CAXIAS': { 'CAXIAS': [{ id: 'av3', tipo: 'transferencia_dinheiro', status: 'pendente', ts: '2026-11-26T10:00:00Z' }, { id: 'av4', tipo: 'transferencia_dinheiro', status: 'finalizado', ts: '2026-10-02T10:00:00Z' }] },
};
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-27T18:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) { await page.goto('file://' + HOME); try { await page.waitForFunction(() => { try { return typeof _computeAlertas === 'function' && typeof _emprestSituacao === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
  if (!(await page.evaluate(() => typeof _loadDinheiroParado === 'function'))) {
    console.log('FALHOU: o alerta de pagamento em dinheiro parado não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const r = await page.evaluate(async ({ TF, AV }) => {
    window.gnFetchJson = async (url, h, nome, fb) => {
      const u = decodeURIComponent(url);
      if (nome === 'emprestPainel') return [{ loja: 'X', tf: TF }];
      if (nome === 'dinheiroParado') { const pedidas = u.match(/loja=in\.\(([^)]*)\)/)[1].split(',').map(x => x.replace(/"/g, '')); return pedidas.filter(k => AV[k]).map(k => ({ loja: k, av: AV[k] })); }
      return fb === undefined ? [] : fb;
    };
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    _emprestPainel = null; await _loadDinheiroParado();
    const sit = id => _emprestSituacao(_emprestPainel.lista.find(t => t.id === id)).txt;
    return { alertas: _computeAlertas().filter(a => a.tipo === 'dinheiro').map(a => a.loja + ' | ' + a.msg + ' | ' + a.sub),
      sit: { mg: sit('mg'), cs: sit('cs'), cr: sit('cr'), nv: sit('nv') } };
  }, { TF, AV });
  const A = r.alertas, tem = (loja, re) => A.some(a => a.startsWith(loja + ' |') && re.test(a));
  check('Margarina: alerta na Nova América — falta ela aceitar (35 dias desde o empréstimo)', tem('NOVA AMERICA', /parado há 35 dias: MARGARINA BALDE 15 L \(Nova América → Norte Shopping\).*Falta Nova América aceitar/), A);
  check('Costela: alerta — falta o Financeiro validar no app RH (desde 09/10, 49 dias)', tem('CAMPO GRANDE', /parado há 49 dias: COSTELA SUINA SALGADA.*Falta Financeiro validar \(app RH › Avarias\)/), A);
  check('Carne seca: alerta — falta Compras definir o valor (desde 20/11, 7 dias)', tem('BOULEVARD', /parado há 7 dias: CARNE SECA.*Falta Compras definir o valor/), A);
  check('até 3 dias não alerta (pendente desde ontem) e quitado/finalizado ficam fora', A.length === 3 && !A.some(a => /NOVO|QUITADO/.test(a)), A);
  check('aba Transferências diz de quem é a vez (não mais só "em validação")', /falta Nova América aceitar .*· parado há 35 dias/.test(r.sit.mg) && /falta Financeiro validar/.test(r.sit.cs) && /falta Compras definir o valor · parado há 7 dias/.test(r.sit.cr) && /parado há 1 dia$/.test(r.sit.nv), r.sit);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
