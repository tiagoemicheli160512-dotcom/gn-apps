// ETAPA 3 (26/11/2026) — Painel › Operação › ⇄ Transferências.
// "Precisamos trazer para o Painel de Gestão o controle de transferência de mercadorias
//  entre lojas, que atualmente fica no aplicativo Lojas, na aba Transferência."
// Só leitura. O mesmo empréstimo existe nas duas pontas (origem e destino) e as cópias
// podem discordar: aqui vira UM registro por id, com as confirmações somadas por OU.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };
const T = (id, data, origem, destino, extra) => Object.assign({ id, data, origem, destino, insumo: 'CARNE DE SOL', qtd: 10, qtdOriginal: 10, unidade: 'KG', motivo: '', quitado: false,
  confirmadoOrigem: false, confirmadoDestino: false, pagDinheiroOrigem: false, pagDinheiroDestino: false, pagDinheiroAvariaId: null }, extra || {});
const ROWS = [
  { loja: 'BANGU', tf: { 'BANGU|2026-11-16': [T('a1', '2026-11-20T10:00:00Z', 'BANGU', 'RANCHO'), T('q1', '2026-11-10T10:00:00Z', 'BANGU', 'CAXIAS', { quitado: true, dataQuitacao: '2026-11-12T10:00:00Z', formaQuitacao: 'mercadoria' })] } },
  // Cópia da mesma a1 na ponta do destino, já com a confirmação dele (as cópias discordam).
  { loja: 'RANCHO', tf: { 'RANCHO|2026-11-16': [T('a1', '2026-11-20T10:00:00Z', 'BANGU', 'RANCHO', { confirmadoDestino: true })] } },
  { loja: 'CAXIAS', tf: { 'CAXIAS|2026-09-01': [T('v1', '2026-09-05T10:00:00Z', 'CAXIAS', 'PEDREIRA', { insumo: 'PICANHA', quitado: true, dataQuitacao: '2026-09-07T10:00:00Z' }),
                                               T('o1', '2026-09-06T10:00:00Z', 'PEDREIRA', 'CAXIAS', { insumo: 'COCA' })] } },
  { loja: 'PEDREIRA', tf: null },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof renderDashboard === 'function' && typeof DASH_GRUPOS !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  if (!(await page.evaluate(() => typeof _buildEmprestPanel === 'function'))) {
    console.log('FALHOU: a aba de transferências não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const r = await page.evaluate(async (ROWS) => {
    let url = '';
    window.gnFetchJson = async (u, h, c) => { if (c === 'emprestPainel') { url = u; return ROWS; } return []; };
    renderDashboard = () => {};
    LOJAS_LISTA = ['BANGU', 'RANCHO', 'CAXIAS', 'PEDREIRA', 'MAGLIA'];
    _emprestPainel = null; _emprestDias = 30; _emprestFiltro = 'abertos'; _emprestLoja = '';
    await _loadEmprestPainel();
    const pega = () => { const h = document.createElement('div'); h.innerHTML = _buildEmprestPanel(); document.body.appendChild(h);
      const o = { html: h.innerHTML, itens: [...h.querySelectorAll('.emprest-item')].map(x => ({ st: x.dataset.st, txt: x.textContent.replace(/\s+/g, ' ').trim() })), abertos: (h.querySelector('.emprest-abertos') || {}).textContent, txt: h.textContent.replace(/\s+/g, ' ') }; h.remove(); return o; };
    const abertos = pega();
    _emprestFiltro = 'quitados'; const quit30 = pega();
    _emprestDias = 90; const quit90 = pega();
    _emprestFiltro = 'abertos'; _emprestLoja = 'CAXIAS'; const caxias = pega();
    _emprestLoja = ''; _emprestFiltro = 'abertos';
    const rel = _emprestRelatorioTexto(true).msg;
    const aba = JSON.stringify(DASH_GRUPOS.find(g => g.g === 'operacao').abas);
    const caixaIntacto = typeof _transfRelatorioTexto === 'function' && _transfRelatorioTexto.length === 2 && typeof _emprestRelatorioTexto === 'function';
    return { url, total: _emprestPainel.lista.length, abertos, quit30, quit90, caxias, rel, aba, caixaIntacto };
  }, ROWS);
  check('Painel › Operação tem a aba ⇄ Transferências', /emprest/.test(r.aba) && /Transferências/.test(r.aba), r.aba);
  check('lê as transferências das lojas numa requisição só, sem a linha da Maglia', /transferAll/.test(r.url) && /BANGU/.test(r.url) && !/MAGLIA/.test(r.url), r.url);
  check('o mesmo empréstimo nas duas pontas vira UM só (4 empréstimos, não 5)', r.total === 4, r.total);
  check('as confirmações das duas cópias se somam: a do destino aparece', r.abertos.itens.some(i => i.st === 'meio' && /Nova Iguaçu diz que devolveu — falta Bangu confirmar que recebeu/.test(i.txt)), r.abertos.itens);
  check('em aberto aparece de qualquer idade (o de setembro continua, com os dias em aberto)', r.abertos.itens.length === 2 && r.abertos.itens.some(i => /COCA/.test(i.txt) && /Caxias ainda não devolveu · 81 dias/.test(i.txt)) && r.abertos.abertos === '2', r.abertos);
  check('devolvidos: só os do período (30 dias: 1; 90 dias: 2), com data e forma', r.quit30.itens.length === 1 && /devolvido em 12\/11 \(mercadoria\)/.test(r.quit30.itens[0].txt) && r.quit90.itens.length === 2, { q30: r.quit30.itens, q90: r.quit90.itens.length });
  check('filtro por loja: Caxias vê o que emprestou e o que pegou', r.caxias.itens.length === 1 && /COCA/.test(r.caxias.itens[0].txt), r.caxias.itens);
  check('nomes de exibição das lojas (Nova Iguaçu, não RANCHO)', !/RANCHO/.test(r.abertos.txt) && /Nova Iguaçu/.test(r.abertos.txt));
  check('relatório do WhatsApp com os abertos e a situação de cada um', /TRANSFERÊNCIAS ENTRE LOJAS/.test(r.rel) && /Em aberto: 2/.test(r.rel) && /Bangu → Nova Iguaçu/.test(r.rel), String(r.rel));
  check('só leitura: a aba não tem botão de confirmar/quitar', !/quitarEmprestimo|marcarPagamentoDinheiro|Recebi de volta/.test(r.abertos.html), r.abertos.html.slice(0, 200));
  // O nome _transf* já era das transferências de CAIXA: uma function repetida sobrescreve a
  // outra sem erro. O relatório da aba de caixa continua sendo o dele.
  check('não sobrescreve o relatório das transferências de caixa (nomes próprios _emprest*)', r.caixaIntacto, r.caixaIntacto);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
