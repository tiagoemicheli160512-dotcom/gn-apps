// "No app home painel de gestão, em cancelamentos e transferências, não tenho como mandar só
//  o relatório da loja, ao selecionar vem todas, poderia colocar por loja igual temos no
//  chopp, nas carnes e ter esse padrão. Pois às vezes precisamos mandar só uma loja."
//  (16/11/2026)
//
// Mesmo seletor "Relatório de" de Barris/Carnes (nenhuma marcada = todas). O recorte vale pro
// WhatsApp e pro PDF; a tela segue mostrando a rede. Com filtro, o relatório não lista as
// outras lojas — só a posição da loja marcada na rede.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };

const canc = (n, valor, motivo) => Array.from({ length: n }, (_, i) => ({ data: '2026-11-1' + (i % 9), valor, motivo, motivo_categoria: 'Erro de lançamento', autor: 'Carol', foto: 'https://sb/c.jpg' }));
const transf = n => Array.from({ length: n }, (_, i) => ({ data: '2026-11-1' + (i % 9), origem: String(i + 1), destino: String(i + 2), motivo: 'juntou mesa', autor: 'Carol', foto: 'https://sb/t.jpg' }));
const decl = (caixas, quem) => ({ caixas, declarados: caixas, abertos: 0, responsaveis: [quem],
  datasOk: Array.from({ length: caixas }, (_, i) => ({ data: '2026-11-0' + (i + 1), turno: 'NOITE', por: quem })), datasFalta: [] });

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let i = 1; ; i++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildCancelPanel === 'function' && typeof _transfMacroDados === 'function'; } catch (e) { return false; } }, { timeout: 20000 }); break; }
    catch (e) { if (i >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _cancelLojaFiltroHtml === 'function'))) {
    console.log('FALHOU: o seletor de lojas do relatório de cancelamento não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const r = await page.evaluate(({ C, T, D }) => {
    LOJAS_LISTA = ['BANGU', 'CAXIAS', 'BOULEVARD', 'PEDREIRA', 'GUARULHOS', 'MAGLIA'];
    _dashCancelPer = C; _dashDeclPer = { GUARULHOS: D };
    _dashTransfPer = T; _dashDeclTransfPer = { GUARULHOS: D };
    _dashFat = { BANGU: 600000, CAXIAS: 100000, BOULEVARD: 350000, PEDREIRA: 200000, GUARULHOS: 300000 };
    _dashPer = 'mes'; _dashWoff = 0;
    _cancelRelatorioLojasFiltro = [];
    const host = document.createElement('div'); host.innerHTML = _buildCancelPanel(); document.body.appendChild(host);
    const caixas = [...host.querySelectorAll('input.cancel-rel-loja')].map(i => i.value);
    const txtTela = host.innerText;
    host.remove();
    const todas = _cancelRelatorioTexto(true).msg;
    // Marca só Caxias, como quem toca na caixinha.
    _cancelFiltroLojaToggle('CAXIAS', true);
    const so = _cancelRelatorioTexto(true);
    const soPdf = _cancelRelatorioTexto(false);
    // A tela continua com a rede inteira.
    const h2 = document.createElement('div'); h2.innerHTML = _buildCancelPanel();
    const telaComFiltro = h2.innerText;
    const marcada = [...h2.querySelectorAll('input.cancel-rel-loja')].filter(i => i.checked).map(i => i.value);
    // PDF: KPIs do recorte.
    let pdfArgs = null; const orig = window.gnRelatorioPDF; window.gnRelatorioPDF = a => { pdfArgs = a; };
    gerarPDFCancel(); window.gnRelatorioPDF = orig;
    // Duas lojas.
    _cancelFiltroLojaToggle('BANGU', true);
    const duas = _cancelRelatorioTexto(true).msg;
    // Loja sem nada no período (Guarulhos assinou que não houve).
    _cancelRelatorioLojasFiltro = ['GUARULHOS'];
    const gua = _cancelRelatorioTexto(true).msg;
    // Desmarcar tudo volta pra rede.
    _cancelRelatorioLojasFiltro = [];
    const voltou = _cancelRelatorioTexto(true).msg;
    return { caixas, txtTela, todas, so: so.msg, soTitulo: so.titulo, soPdf: soPdf.msg, telaComFiltro, marcada, pdfArgs, duas, gua, voltou };
  }, {
    C: { BANGU: canc(3, 100, 'cliente desistiu'), CAXIAS: canc(2, 50, 'lançou errado'), BOULEVARD: canc(1, 400, 'prato voltou') },
    T: { BANGU: transf(12), CAXIAS: transf(3), BOULEVARD: transf(7), PEDREIRA: transf(1) },
    D: decl(10, 'Rafael'),
  });

  check('a aba tem o seletor "Relatório de" com as lojas (padrão Barris/Carnes)', /Relatório de \(marque 1\+ lojas; nenhuma marcada = todas\)/.test(r.txtTela) && r.caixas.length === 5, r.caixas);
  check('Maglia não aparece no seletor (não usa cancelamento nem transferência)', !r.caixas.includes('MAGLIA'), r.caixas);
  check('sem nada marcado o relatório é o da rede (Bangu, Caxias e Boulevard)', /Bangu/.test(r.todas) && /Boulevard/.test(r.todas) && /Caxias/.test(r.todas));

  check('só Caxias marcada: o título diz a loja', /NOTAS CANCELADAS — CAXIAS/.test(r.so) && /Caxias/.test(r.soTitulo), r.so.slice(0, 120));
  check('…os cancelamentos são só os de Caxias (2 notas, R$ 100)', /Total: R\$\s?100,00\*? em 2 notas, 1 loja/.test(r.so) && /lançou errado/.test(r.so) && !/cliente desistiu|prato voltou/.test(r.so), r.so);
  check('…as transferências também são só as de Caxias (3)', /3 transferências em 1 loja/.test(r.so) && !/Bangu\* \(12\)|Boulevard\* \(7\)/.test(r.so), r.so.slice(r.so.indexOf('TRANSF')));
  check('…nenhuma outra loja aparece no texto (nem no ranking, nem em "sem cancelamento")', !/Bangu|Boulevard|Pedreira|Guarulhos/.test(r.so), r.so);
  check('…mas diz a posição de Caxias na rede no cancelamento (% do faturamento)', /Posição na rede[\s\S]*Caxias: \d+º de \d+ · 0,10%/.test(r.so), r.so);
  check('…e na transferência (3º de 5 em quantidade, por faturamento também)', /Caxias: 3º de 5 em quantidade \(3\) · \d+º de 5 por faturamento/.test(r.so), r.so.slice(r.so.indexOf('TRANSF')));
  check('o PDF sai com o mesmo recorte', /Caxias/.test(r.soPdf) && !/Bangu|Boulevard/.test(r.soPdf));
  check('…e os KPIs do PDF são de Caxias (R$ 100, 2 notas, 1 loja)', r.pdfArgs && /100,00/.test(r.pdfArgs.kpis[0].valor) && /2 notas · 1 loja/.test(r.pdfArgs.kpis[0].sub) && /Caxias/.test(r.pdfArgs.titulo), r.pdfArgs && { k: r.pdfArgs.kpis, t: r.pdfArgs.titulo });
  check('a tela continua mostrando a rede inteira com o filtro marcado', /Bangu/.test(r.telaComFiltro) && /Boulevard/.test(r.telaComFiltro) && JSON.stringify(r.marcada) === '["CAXIAS"]', r.marcada);
  check('duas lojas marcadas (Bangu e Caxias): as duas, sem Boulevard', /BANGU, CAXIAS/.test(r.duas) && /cliente desistiu/.test(r.duas) && /lançou errado/.test(r.duas) && !/Boulevard/.test(r.duas), r.duas.slice(0, 300));
  check('loja sem cancelamento no período (Guarulhos): diz que não teve e quem confirmou', /Guarulhos: nenhum cancelamento lançado/.test(r.gua) && /confirmado por Rafael/.test(r.gua) && !/Bangu|Caxias/.test(r.gua), r.gua);
  check('desmarcando tudo volta a ser a rede', r.voltou === r.todas);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
