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
    const linhas = rk ? [...rk.querySelectorAll(':scope > div[style*="margin-bottom:7px"]')].map(d => d.innerText.replace(/\s+/g, ' ').trim()) : [];
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

  // Uma loja só não é ranking.
  const um = await page.evaluate(() => { _dashTransfPer = { BANGU: [{ data: '2026-11-10', origem: '1', destino: '2', motivo: 'x', autor: 'y', foto: null }] }; _dashDeclTransfPer = {}; return /transf-ranking/.test(_buildCancelPanel()); });
  check('com uma loja só, não mostra ranking', um === false);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
