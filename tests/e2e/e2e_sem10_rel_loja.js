// "Notas sem 10%, também poderia fazer a mesma coisa?" (16/11/2026) — o seletor "Relatório
// de" de Cancel. e transf. (e Barris/Carnes) na aba 💸 Sem 10% do Painel. Nenhuma marcada =
// rede; o recorte vale pro WhatsApp/PDF; com filtro, só a posição da loja na rede.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };

const nota = (n, valor, garcom) => Array.from({ length: n }, (_, i) => ({ data: '2026-11-1' + i, valor, mesa: String(10 + i), garcom }));

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let i = 1; ; i++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildSem10Panel === 'function' && typeof _sem10MacroDados === 'function'; } catch (e) { return false; } }, { timeout: 20000 }); break; }
    catch (e) { if (i >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _sem10LojaFiltroHtml === 'function'))) {
    console.log('FALHOU: o seletor de lojas do relatório sem 10% não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const r = await page.evaluate(({ N }) => {
    LOJAS_LISTA = ['BANGU', 'CAXIAS', 'BOULEVARD', 'PEDREIRA', 'MAGLIA'];
    _dashSem10Per = N; _dashSem10CaixasPer = { PEDREIRA: 8 };
    _dashDeclSem10Per = { PEDREIRA: { caixas: 8, declarados: 8, abertos: 0, responsaveis: ['Marlon'], datasOk: [{ data: '2026-11-10', turno: 'NOITE', por: 'Marlon' }], datasFalta: [] } };
    _dashPer = 'mes'; _dashWoff = 0;
    _sem10RelatorioLojasFiltro = [];
    const host = document.createElement('div'); host.innerHTML = _buildSem10Panel(); document.body.appendChild(host);
    const caixas = [...host.querySelectorAll('input.sem10-rel-loja')].map(i => i.value);
    const tela = host.innerText;
    // marca Caxias pelo toque, como na tela
    host.querySelector('input.sem10-rel-loja[value="CAXIAS"]').click();
    host.remove();
    const todas = (() => { const s = _sem10RelatorioLojasFiltro; _sem10RelatorioLojasFiltro = []; const m = _sem10RelatorioTexto(true).msg; _sem10RelatorioLojasFiltro = s; return m; })();
    const so = _sem10RelatorioTexto(true);
    const soPdf = _sem10RelatorioTexto(false);
    const h2 = document.createElement('div'); h2.innerHTML = _buildSem10Panel();
    const telaComFiltro = h2.innerText;
    _sem10RelatorioLojasFiltro = ['PEDREIRA'];
    const ped = _sem10RelatorioTexto(true).msg;
    _sem10RelatorioLojasFiltro = [];
    const voltou = _sem10RelatorioTexto(true).msg;
    return { caixas, tela, todas, so: so.msg, soTitulo: so.titulo, soPdf: soPdf.msg, telaComFiltro, ped, voltou };
  }, { N: { BANGU: nota(3, 500, 'Júlio'), CAXIAS: nota(2, 200, 'Renan'), BOULEVARD: nota(1, 1000, 'Ana') } });

  check('a aba Sem 10% tem o seletor "Relatório de" (mesmo padrão)', /Relatório de \(marque 1\+ lojas; nenhuma marcada = todas\)/.test(r.tela) && r.caixas.length === 4, r.caixas);
  check('Maglia fora do seletor (não usa o app Caixa)', !r.caixas.includes('MAGLIA'), r.caixas);
  check('sem filtro, o relatório é o da rede', /Bangu/.test(r.todas) && /Boulevard/.test(r.todas) && /Caxias/.test(r.todas));
  check('só Caxias: o título diz a loja', /NOTAS SEM 10% — CAXIAS/.test(r.so) && /Caxias/.test(r.soTitulo), r.so.slice(0, 120));
  check('…10% e valor são só de Caxias (R$ 40 de R$ 400, 2 notas)', /10% não cobrado: R\$\s?40,00/.test(r.so) && /Valor das notas: R\$\s?400,00 \(2 notas\)/.test(r.so), r.so);
  check('…nenhuma outra loja aparece', !/Bangu|Boulevard|Pedreira|Júlio|Ana/.test(r.so), r.so);
  check('…com a posição de Caxias na rede (1º de 3, quem menos deixou de cobrar)', /Posição na rede[\s\S]*Caxias: 1º de 3 · R\$\s?40,00/.test(r.so), r.so);
  check('o PDF sai com o mesmo recorte', /CAXIAS/.test(r.soPdf) && !/Bangu|Boulevard/.test(r.soPdf));
  check('a tela continua com a rede inteira', /Bangu/.test(r.telaComFiltro) && /Boulevard/.test(r.telaComFiltro));
  check('loja sem nota (Pedreira assinou que não houve): diz quem confirmou e que está fora do ranking', /Pedreira[\s\S]*confirmado por Marlon/.test(r.ped) && /Pedreira: fora do ranking/.test(r.ped) && !/Bangu|Caxias|Boulevard/.test(r.ped), r.ped);
  check('desmarcando tudo volta a ser a rede', r.voltou === r.todas);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
