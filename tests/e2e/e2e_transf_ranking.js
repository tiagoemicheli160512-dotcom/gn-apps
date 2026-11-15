// "No painel de gestão, na aba caixa, canc e transferências vem juntos, porém gostaria de ter
//  um ranking de transferências também, das lojas que mais transfere, com quantidade, quem
//  menos transfere fica em primeiro e assim por diante." (15/11/2026)
//
// Por quantidade; quem menos transfere em 1º; empate divide a posição; zero só entra se a
// loja assinou que não houve (zero sem assinatura fica de fora, como no cancelamento).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

const t = (n, data) => Array.from({ length: n }, (_, i) => ({ data: data || '2026-11-1' + (i % 9), origem: String(i + 1), destino: String(i + 2), motivo: 'juntou mesa', autor: 'Carol', foto: 'https://sb/t.jpg' }));
const decl = (caixas, declarados, quem) => ({ caixas, declarados, abertos: 0, responsaveis: quem ? [quem] : [],
  datasOk: Array.from({ length: declarados }, (_, i) => ({ data: '2026-11-0' + (i + 1), turno: 'NOITE', por: quem })),
  datasFalta: Array.from({ length: caixas - declarados }, (_, i) => ({ data: '2026-11-1' + i, turno: 'NOITE' })) });

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
  if (!(await page.evaluate(() => typeof _transfRankingLinhas === 'function'))) {
    console.log('FALHOU: o ranking de transferências não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const r = await page.evaluate(({ transf, declT }) => {
    _dashCancelPer = {}; _dashDeclPer = {};
    _dashTransfPer = transf; _dashDeclTransfPer = declT;
    _dashPer = 'mes'; _dashWoff = 0;
    const html = _buildCancelPanel();
    const host = document.createElement('div'); host.innerHTML = html; document.body.appendChild(host);
    const rk = host.querySelector('.transf-ranking');
    const linhas = rk ? [...rk.querySelectorAll(':scope > div[style*="margin-bottom:7px"]')].map(d => d.innerText.replace(/\s+/g, ' ').trim()).filter(t => /^\d+º/.test(t)) : [];
    const posRanking = html.indexOf('transf-ranking'), posPrimeiraLoja = html.indexOf('border-left:3px solid #4F46E5');
    host.remove();
    return { linhas, temRanking: !!rk, rodape: rk ? rk.innerText : '', antesDosDetalhes: posRanking > 0 && posRanking < posPrimeiraLoja,
             wpp: _cancelRelatorioTexto(true).msg, pdf: _cancelRelatorioTexto(false).msg };
  }, {
    transf: { BANGU: t(12), CAXIAS: t(3), BOULEVARD: t(7), PEDREIRA: t(3), 'NOVA AMERICA': t(1) },
    declT: {
      GUARULHOS: decl(10, 10, 'Rafael'),   // assinou todos: zero de verdade → 1º
      ITAQUERA: decl(8, 0),                 // fechou sem ninguém assinar → fora
      'CAMPO GRANDE': decl(6, 4, 'Israel'), // assinou só parte → fora
    },
  });

  check('a aba Caixa › Cancel. e transf. tem o ranking de transferências', r.temRanking, r);
  check('…acima da lista detalhada por loja', r.antesDosDetalhes);
  const nomes = r.linhas.map(l => l.replace(/^\d+º\s*/, '').replace(/\s*\d+ transf\.$/, ''));
  check('ordem: quem menos transfere primeiro (Guarulhos 0, Nova América 1, Caxias/Pedreira 3, Boulevard 7, Bangu 12)',
    JSON.stringify(nomes) === JSON.stringify(['Guarulhos', 'Nova América', 'Caxias', 'Pedreira', 'Boulevard', 'Bangu']), r.linhas);
  check('com a quantidade de cada uma', /Bangu\s*12 transf\./.test(r.linhas[5] || '') && /Guarulhos\s*0 transf\./.test(r.linhas[0] || ''), r.linhas);
  check('empate divide a posição (Caxias e Pedreira, as duas 3º; Boulevard 5º)',
    /^3º Caxias/.test(r.linhas[2] || '') && /^3º Pedreira/.test(r.linhas[3] || '') && /^5º Boulevard/.test(r.linhas[4] || '') && /^6º Bangu/.test(r.linhas[5] || ''), r.linhas);
  check('zero sem assinatura NÃO entra no topo (Itaquera, Campo Grande fora)', !r.linhas.some(l => /Itaquera|Campo Grande/.test(l)), r.linhas);
  check('…e o rodapé diz quantas ficaram de fora e por quê', /2 lojas ficaram de fora com zero NÃO conferido/.test(r.rodape), r.rodape);

  check('o WhatsApp leva o ranking', /Ranking — de quem menos transfere pra quem mais\*\n\s+1º Guarulhos — 0\n\s+2º Nova América — 1\n\s+3º Caxias — 3\n\s+3º Pedreira — 3\n\s+5º Boulevard — 7\n\s+6º Bangu — 12/.test(r.wpp), r.wpp.slice(r.wpp.indexOf('TRANSF'), r.wpp.indexOf('TRANSF') + 400));
  check('o PDF também', /Ranking — de quem menos transfere pra quem mais\n\s+1º Guarulhos — 0/.test(r.pdf));

  // ── "Pode fazer o ranking por faturamento também" ──
  // Transferências a cada R$ 100 mil faturados. Bangu 12 em 600 mil = 2,00; Boulevard 7 em
  // 350 mil = 2,00 (empate); Caxias 3 em 100 mil = 3,00; Nova América 1 em 200 mil = 0,50;
  // Guarulhos 0 (assinado); Pedreira sem faturamento no período → fim, não 1º.
  const f = await page.evaluate(() => {
    _dashFat = { BANGU: 600000, BOULEVARD: 350000, CAXIAS: 100000, 'NOVA AMERICA': 200000, GUARULHOS: 300000 };
    _transfRankModo = 'qtd';
    const host = document.createElement('div'); host.innerHTML = _buildCancelPanel(); document.body.appendChild(host);
    const linhas = () => [...host.querySelectorAll('.transf-ranking > div[style*="margin-bottom:7px"]')].map(d => d.innerText.replace(/\s+/g, ' ').trim()).filter(t => /^\d+º/.test(t));
    const antes = linhas();
    [...host.querySelectorAll('.transf-ranking button')].find(b => /Por faturamento/.test(b.textContent)).click();
    const depois = linhas();
    const modo = host.querySelector('.transf-ranking').dataset.modo;
    const sub = host.querySelector('.transf-ranking').innerText;
    [...host.querySelectorAll('.transf-ranking button')].find(b => /Quantidade/.test(b.textContent)).click();
    const voltou = linhas();
    host.remove();
    _transfRankModo = 'qtd';
    return { antes, depois, modo, sub, voltou, wpp: _cancelRelatorioTexto(true).msg };
  });
  check('o ranking abre por quantidade (o pedido anterior continua igual)', /^1º Guarulhos/.test(f.antes[0] || '') && /^6º Bangu/.test(f.antes[5] || ''), f.antes);
  check('tocar em "Por faturamento" reordena pelo número a cada R$ 100 mil', f.modo === 'fat' && /a cada R\$ 100 mil faturados/.test(f.sub), f.modo);
  const nf = f.depois.map(l => (l.match(/^\d+º (.+?) ·/) || [])[1]);
  check('ordem por faturamento: Guarulhos 0, Nova América 0,50, Bangu e Boulevard 2,00, Caxias 3,00, Pedreira (sem faturamento) por último',
    JSON.stringify(nf) === JSON.stringify(['Guarulhos', 'Nova América', 'Bangu', 'Boulevard', 'Caxias', 'Pedreira']), f.depois);
  check('…Bangu, que é o último em quantidade, sobe pra 3º quando se divide pelo faturamento', /^3º Bangu · 12 transf\. 2,00 de R\$ 600,0k faturados/.test(f.depois[2] || ''), f.depois[2]);
  check('…empate divide a posição (Bangu e Boulevard 3º; Caxias 5º)', /^3º Boulevard/.test(f.depois[3] || '') && /^5º Caxias · 3 transf\. 3,00/.test(f.depois[4] || ''), f.depois);
  check('…loja sem faturamento vai pro fim com "—", sem fingir que é a melhor', /^6º Pedreira · 3 transf\. — sem faturamento no período/.test(f.depois[5] || ''), f.depois[5]);
  check('volta pra quantidade', /^1º Guarulhos/.test(f.voltou[0] || '') && /^6º Bangu/.test(f.voltou[5] || ''), f.voltou);
  check('o relatório leva os dois rankings', /Ranking por faturamento \(transf\. a cada R\$ 100 mil\)\*\n\s+1º Guarulhos — 0,00 \(0 em R\$ 300,0k\)\n\s+2º Nova América — 0,50 \(1 em R\$ 200,0k\)/.test(f.wpp), f.wpp.slice(f.wpp.indexOf('Ranking por'), f.wpp.indexOf('Ranking por') + 300));

  // Uma loja só não é ranking.
  const um = await page.evaluate(() => { _dashTransfPer = { BANGU: [{ data: '2026-11-10', origem: '1', destino: '2', motivo: 'x', autor: 'y', foto: null }] }; _dashDeclTransfPer = {}; return /transf-ranking/.test(_buildCancelPanel()); });
  check('com uma loja só, não mostra ranking', um === false);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
