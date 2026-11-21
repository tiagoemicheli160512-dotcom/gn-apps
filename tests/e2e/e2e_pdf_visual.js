// "Eu gosto muito disso aqui, esse relatório, incluindo o ranking — queria que no PDF saísse
// assim. Em todos os controles que temos isso é cinema." (21/11/2026, print do painel de
// cancelamento: KPIs, "Por categoria" com barras, "Lojas — do melhor pro pior" com barras)
//
// O PDF de Cancel. e transf., de Sem 10% e de Trios leva os MESMOS quadros da tela
// (_pdfVisual reaproveita o HTML do painel), sem o que é de toque, com as cores do papel, e
// o texto do PDF não repete em lista o que o quadro já mostra. O WhatsApp segue em texto.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const path = require('path');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };

const CANCEL = {
  cancel: {
    'ITAQUERA':       [{ data: '2026-10-24', valor: 1500, motivo: 'a', motivo_categoria: 'Cliente desistiu', autor: 'Gilda', foto: 'x' }],
    'NORTE SHOPPING': [{ data: '2026-10-24', valor: 1200, motivo: 'b', motivo_categoria: 'Troca de pedido ou produto', autor: 'Ana', foto: 'x' }],
    'GUARULHOS':      [{ data: '2026-10-24', valor: 800,  motivo: 'c', motivo_categoria: 'Erro de lançamento', autor: 'Léo', foto: 'x' }],
  },
  fat: { 'ITAQUERA': 300000, 'NORTE SHOPPING': 200000, 'GUARULHOS': 80000 },
};
const nota = (n, valor, garcom) => Array.from({ length: n }, (_, i) => ({ data: '2026-10-1' + i, valor, mesa: String(10 + i), garcom }));
const ap = (loja, data, cache, couver) => ({ loja, data, cache, couver_valor: couver, couver_qtd: couver / 10,
  couver_lancado_em: couver > 0 ? data + 'T23:30:00.000Z' : null, artista: 'Trio ' + loja, horario_inicio: '20:00', presenca_confirmada: true });
const TRIOS = [ap('pedreira', '2026-10-10', 600, 900), ap('pedreira', '2026-10-11', 600, 800), ap('bangu', '2026-10-24', 800, 500), ap('bangu', '2026-10-25', 800, 600)];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-29T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let i = 1; ; i++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildCancelPanel === 'function' && typeof _buildSem10Panel === 'function' && typeof _loadTriosGerencia === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (i >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _pdfVisual === 'function'))) {
    console.log('FALHOU: os quadros da tela no PDF não existem neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const r = await page.evaluate(async ({ CANCEL, N, TRIOS }) => {
    const pega = gerar => { const orig = window.gnRelatorioPDF; let o = null; window.gnRelatorioPDF = x => { o = x; }; try { gerar(); } finally { window.gnRelatorioPDF = orig; } return o; };
    const out = {};
    // Cancelamento (rede)
    _dashCancelPer = CANCEL.cancel; _dashFat = CANCEL.fat; _dashDeclPer = {}; _dashPer = 'mes'; _dashMoff = 0;
    _cancelRelatorioLojasFiltro = [];
    out.cancel = pega(gerarPDFCancel);
    out.cancelWpp = _cancelRelatorioTexto(true).msg;
    out.cancelHtml = out.cancel ? gnRelatorioHtml(out.cancel, false) : '';
    // Cancelamento de uma loja só: sem o ranking da rede (o texto diz a posição)
    _cancelRelatorioLojasFiltro = ['GUARULHOS'];
    out.cancelLoja = pega(gerarPDFCancel);
    _cancelRelatorioLojasFiltro = [];
    // Sem 10%
    LOJAS_LISTA = ['BANGU', 'CAXIAS', 'BOULEVARD', 'PEDREIRA'];
    _dashSem10Per = N; _dashSem10CaixasPer = {}; _dashDeclSem10Per = {}; _sem10RelatorioLojasFiltro = [];
    out.sem10 = pega(gerarPDFSem10);
    // Trios (mês)
    const orig = window.gnFetchJson;
    window.gnFetchJson = async url => (/gn_trios_agenda/.test(url) ? TRIOS : []);
    _triosPer = 'mes'; _triosGerLoaded = false; _triosGerData = null; _triosGerOff = 0;
    try { await _loadTriosGerencia(); } finally { window.gnFetchJson = orig; }
    out.trios = pega(gerarPDFTrios);
    return out;
  }, { CANCEL, N: { BANGU: nota(3, 500, 'Júlio'), CAXIAS: nota(2, 200, 'Renan'), BOULEVARD: nota(1, 1000, 'Ana') }, TRIOS });

  const v = (r.cancel && r.cancel.visual) || '';
  check('cancelamento: o PDF leva o quadro "Por categoria" com barras', /POR CATEGORIA/.test(v) && /Cliente desistiu/.test(v) && /background:#E8580A/.test(v), v.slice(0, 300));
  check('cancelamento: e o ranking "Lojas — do melhor pro pior" com % e faturado', /LOJAS — DO MELHOR PRO PIOR/.test(v) && /1º[\s\S]{0,200}Itaquera/.test(v) && /0,50%/.test(v) && /de R\$\s?300,0k faturados/.test(v));
  check('cancelamento: nada de toque no papel (onclick, "toque numa loja", cursor)', !/onclick|role="button"|toque numa loja|cursor:pointer/i.test(v));
  check('cancelamento: cores do papel (nenhum var(--…) sobrando)', !/var\(--/.test(v));
  check('cancelamento: KPIs seguem no topo', r.cancel && r.cancel.kpis && r.cancel.kpis[0].label === 'Total cancelado');
  check('cancelamento: o texto do PDF não repete em lista o que o quadro mostra', !/Por categoria:/.test(r.cancel.texto) && !/Lojas, do melhor pro pior/.test(r.cancel.texto) && /Itaquera/.test(r.cancel.texto));
  check('cancelamento: o WhatsApp continua com tudo em texto', /Por categoria:/.test(r.cancelWpp) && /Lojas, do melhor pro pior/.test(r.cancelWpp));
  check('cancelamento: no HTML do PDF o quadro vem depois dos KPIs e antes do texto',
    r.cancelHtml.indexOf('kpi-row') < r.cancelHtml.indexOf('pdf-vis') && r.cancelHtml.indexOf('pdf-vis') < r.cancelHtml.indexOf('📍') + (r.cancelHtml.indexOf('📍') < 0 ? 1e9 : 0));
  check('cancelamento de UMA loja (uma categoria só): sem o ranking da rede', r.cancelLoja && /POR CATEGORIA/.test(r.cancelLoja.visual || '') === false && !/DO MELHOR PRO PIOR/.test(r.cancelLoja.visual || ''), r.cancelLoja && r.cancelLoja.visual);
  const s = (r.sem10 && r.sem10.visual) || '';
  check('sem 10%: KPIs (10% não cobrado, valor das notas, período)', r.sem10 && r.sem10.kpis.map(k => k.label).join('|') === '10% não cobrado|Valor das notas|Período' && r.sem10.kpis[0].valor.replace(/\s/g, '') === 'R$290,00', r.sem10 && r.sem10.kpis);
  check('sem 10%: o ranking da tela no PDF, sem o "toque numa loja"', /Ranking · 10% não cobrado/i.test(s) && /Caxias/.test(s) && !/Toque numa loja|onclick/.test(s) && !/var\(--/.test(s), s.slice(0, 300));
  const t = (r.trios && r.trios.visual) || '';
  check('trios: o ranking do couvert (do melhor pro pior saldo) no PDF', /DO MELHOR PRO PIOR SALDO/.test(t) && /Pedreira[\s\S]*Bangu/.test(t) && !/var\(--/.test(t), t.slice(0, 300));
  check('trios: KPIs de couvert, cachê e saldo', r.trios && r.trios.kpis.map(k => k.label).join('|') === 'Couvert arrecadado|Cachê a pagar|Saldo da rede', r.trios && r.trios.kpis);

  // Impressão de verdade do PDF do cancelamento (o quadro tem que sair no papel).
  const imp = await ctx.newPage();
  await imp.setContent(r.cancelHtml);
  await imp.pdf({ path: path.join(CAMINHOS.TMP, 'pdf_visual_cancel.pdf'), printBackground: true });
  await imp.setViewportSize({ width: 794, height: 1123 });
  await imp.emulateMedia({ media: 'print' });
  await imp.screenshot({ path: path.join(CAMINHOS.TMP, 'pdf_visual_cancel.png'), fullPage: true });
  const barras = await imp.evaluate(() => [...document.querySelectorAll('.pdf-vis div')].filter(d => /background:#(E8580A|B91C1C)/i.test(d.getAttribute('style') || '') && d.getBoundingClientRect().width > 0).length);
  check('impresso: as barras aparecem na página (largura > 0)', barras >= 4, barras);
  check('nenhum erro de JavaScript', erros.length === 0, erros);

  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
