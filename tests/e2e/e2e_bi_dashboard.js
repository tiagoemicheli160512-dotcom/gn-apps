// "No app Home, Painel de Gestão, aba BI: um dashboard das lojas com as informações da nossa
//  mini DRE, todas as informações por loja, e a opção de unir todas pra ter visão geral — hoje
//  a aba é muito superficial." (19/11/2026)
//
// Cobra:
//  · mês fechado por padrão (out/2026, hoje 19/11), com o mês atual como "parcial";
//  · REDE = soma das lojas: faturamento e variação, cancelamentos, transferências, avarias,
//    ocorrências; DRE real da rede = R$ das lojas que lançaram ÷ faturamento delas, ideal
//    ponderada, "x/11 lançaram";
//  · por loja: os números dela (mesmos do card "Resultado do mês", _mesDadosDaLoja);
//  · comparativo por loja, do maior faturamento pro menor; tocar abre a loja; voltar pra rede;
//  · escala lida só nas semanas do mês (não o histórico inteiro);
//  · relatório (WhatsApp) com o mesmo recorte; o índice de saúde continua embaixo;
//  · nada passa da largura em 360 px; Maglia fora.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-19T10:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildBiTab === 'function' && typeof DRE_CONTAS !== 'undefined' && typeof COMISSOES_CAL !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _buildBiDashboard === 'function'))) {
    console.log('FALHOU: o dashboard do BI não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  await page.evaluate(() => {
    window.__urls = [];
    const fat = { Bangu: { '2026-10': 100000, '2026-09': 80000 }, Caxias: { '2026-10': 50000, '2026-09': 50000 } };
    window.gnFetchJson = async (url, h, ctxName, fb) => {
      const u = decodeURIComponent(url); window.__urls.push(ctxName + ' ' + u);
      const loja = (u.match(/loja=eq\.([^&]+)/) || [])[1];
      const mes = (u.match(/gte\.(\d{4}-\d{2})/) || [])[1];
      if (ctxName === 'dre:config') return [{ all_data: { real: {
        'BANGU|2026-10': { cmv_pct: 30, folha_pct: 25, agua: 1000, gas: 1000, luz: 2000 },
        'CAXIAS|2026-10': { cmv_pct: 26 } } } }];
      if (ctxName === 'mesAnt:venda' || ctxName === 'mesAnt:vendaAnt') { const v = (fat[loja] || {})[mes]; return v ? [{ venda_salao: v, venda_delivery: 0 }] : []; }
      if (ctxName === 'mesAnt:lojas') return loja === 'BANGU' ? [{ all_data: { avariasAll: { BANGU: [{ id: 'a', ts: '2026-10-10T12:00:00Z', insumo: 'X', valorTotal: 40, status: 'pendente' }] } } }] : [{ all_data: {} }];
      if (ctxName === 'bi:comissoes') {
        const idxs = [...u.matchAll(/s(\d+):all_data/g)].map(m => +m[1]);
        const r = {}; if (loja === 'BANGU') { const meio = idxs[2]; r['s' + meio] = { funcs: [{ nome: 'A', dias: ['FALTA', 'ATESTADO', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'FOLGA'] }] }; }
        return [r];
      }
      if (ctxName === 'mesAnt:comissoes') return [{ all_data: {} }];
      if (ctxName === 'mesAnt:extra') {
        if (loja === 'BANGU') return [{ data: '2026-10-05', gn_caixa_despesa: [], gn_caixa_cancelamento: [{ valor: 100 }, { valor: 50 }], gn_caixa_transferencia: [{ id: 1 }, { id: 2 }, { id: 3 }], gn_caixa_gorjeta: [] }];
        if (loja === 'CAXIAS') return [{ data: '2026-10-06', gn_caixa_despesa: [], gn_caixa_cancelamento: [{ valor: 25 }], gn_caixa_transferencia: [], gn_caixa_gorjeta: [] }];
        return [];
      }
      return fb === undefined ? [] : fb;
    };
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    _dreAllData = null; _biDados = {}; _biComp = null; _biEscopo = 'REDE';
    _dashTab = 'bi';
    document.getElementById('dash-section').style.display = 'block';
  });

  const ler = () => page.evaluate(async () => {
    await _biCarregar(false); await new Promise(r => setTimeout(r, 80));
    const el = document.getElementById('dash-section');
    el.innerHTML = _buildBiTab(_dashFat || {}, 1, false);
    const linha = k => (el.querySelector(`.bi-dre-linha[data-conta="${k}"]`) || {}).innerText;
    return { txt: el.innerText.replace(/\s+/g, ' '), cmv: (linha('cmv') || '').replace(/\s+/g, ' '), folha: (linha('folha') || '').replace(/\s+/g, ' '), util: (linha('utilidades') || '').replace(/\s+/g, ' '),
      lojas: [...el.querySelectorAll('.bi-loja')].map(x => x.dataset.loja), comp: _biComp,
      opMes: [...el.querySelectorAll('select')[0].options].map(o => o.text).slice(0, 2), saude: !!el.querySelector('details.bi-saude'),
      largos: [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5) };
  });

  const r = await ler();
  check('abre no mês fechado (outubro/2026) e oferece o mês atual como parcial', r.comp === '2026-10' && /parcial/.test(r.opMes[0]), r);
  check('REDE: faturamento somado R$ 150.000,00 com ▲ 15,4% vs R$ 130.000,00', /R\$ 150\.000,00/.test(r.txt) && /▲ 15,4% vs R\$ 130\.000,00/.test(r.txt), r.txt.slice(0, 400));
  check('REDE: CMV real = (30.000 + 13.000) ÷ 150.000 = 28,67%, "2/11 lojas lançaram"', /28,67%/.test(r.cmv) && /2\/11 lojas lançaram/.test(r.cmv) && /29,00%/.test(r.cmv), r.cmv);
  check('REDE: folha só da Bangu (25%, 1/11) e água/gás/luz R$ 4.000 = 4,00%', /25,00%/.test(r.folha) && /1\/11/.test(r.folha) && /4,00%/.test(r.util) && /R\$ 4\.000,00/.test(r.util), [r.folha, r.util]);
  check('REDE: cancelamentos 3 · R$ 175,00, 3 transferências, avarias R$ 40,00', /3 · R\$ 175,00/.test(r.txt) && /3 feitas/.test(r.txt) && /R\$ 40,00/.test(r.txt), r.txt);
  check('REDE: ocorrências da escala (1 falta, 1 atestado) lidas só das semanas do mês', /1\s?📄 Atestados/.test(r.txt) && /1\s?🚫 Faltas/.test(r.txt), r.txt.slice(r.txt.indexOf('Pessoas'), r.txt.indexOf('Pessoas') + 120));
  const comissoes = await page.evaluate(() => window.__urls.filter(u => /gn_comissoes/.test(u)));
  check('a escala é lida por semana (all_data->"N"), nunca o histórico inteiro', comissoes.length >= 10 && comissoes.every(u => /^bi:comissoes/.test(u) && /all_data->"\d+"/.test(u)), comissoes.slice(0, 2));
  check('comparativo por loja: Bangu, depois Caxias (maior faturamento primeiro), 11 lojas, sem Maglia', r.lojas[0] === 'BANGU' && r.lojas[1] === 'CAXIAS' && r.lojas.length === 11 && !r.lojas.includes('MAGLIA'), r.lojas);
  check('o índice de saúde de antes continua, embaixo', r.saude);
  check('nada passa da largura em 360 px', r.largos.length === 0, r.largos);

  // Abrir a Bangu pelo comparativo.
  await page.evaluate(() => { renderDashboard = () => {}; _biTrocarEscopo('BANGU'); });
  const b = await ler();
  check('Bangu: R$ 100.000,00 ▲ 25,0%, CMV 30,00% (vermelho acima de 29%), cancelamentos 2 · R$ 150,00', /R\$ 100\.000,00/.test(b.txt) && /▲ 25,0%/.test(b.txt) && /30,00%/.test(b.cmv) && /2 · R\$ 150,00/.test(b.txt) && b.lojas.length === 0 && /Voltar pra rede/.test(b.txt), b.txt.slice(0, 500));
  const cor = await page.evaluate(() => { const el = document.querySelector('.bi-dre-linha[data-conta="cmv"] span:nth-child(3)'); return el && getComputedStyle(el).color; });
  check('…e o CMV acima do ideal aparece em vermelho', cor === 'rgb(220, 38, 38)', cor);
  const rel = await page.evaluate(() => _biRelatorioTexto());
  check('relatório da Bangu com a DRE e a operação', /BI — BANGU/.test(rel.msg) && /CMV: ideal 29,00% · real 30,00%/.test(rel.msg) && /Cancelamentos: 2/.test(rel.msg), rel.msg);
  await page.evaluate(() => _biTrocarEscopo('REDE'));
  const relR = await page.evaluate(() => _biRelatorioTexto());
  check('relatório da rede traz o "Por loja"', /BI — REDE \(11 lojas\)/.test(relR.msg) && /Por loja/.test(relR.msg) && /• Bangu: R\$ 100\.000,00/.test(relR.msg), relR.msg);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
