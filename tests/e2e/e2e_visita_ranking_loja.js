// "No app lojas, o ranking hoje permite ver todas as lojas, quero que fique visível pra
//  todas só os 3 primeiros, e do 4 em diante só a própria loja sua posição, pra não gerar
//  um desânimo ou chacota das lojas." (15/11/2026)
//
// Na Home da loja (card Resultado das visitas › Ver ranking): o pódio + a própria loja. As
// outras não chegam ao HTML. O Painel (supervisão) continua com a rede inteira.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _vckHomeRankingHtml === 'function' && typeof _vckRankingHtml === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  if (!(await page.evaluate(() => typeof _vckRankingVisivelLoja === 'function'))) {
    console.log('FALHOU: o recorte do ranking na Home da loja não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  // 11 lojas: 6 com posição (empate no 3º), 2 em formação, 3 sem visita.
  const RK = [
    { loja: 'São Gonçalo', pos: 1, total: 6, media: 95, visitas: 4, reincidentes: 0 },
    { loja: 'Pedreira', pos: 2, total: 6, media: 91, visitas: 3, reincidentes: 0 },
    { loja: 'Boulevard', pos: 3, total: 6, media: 88, visitas: 3, reincidentes: 0 },
    { loja: 'Caxias', pos: 3, total: 6, media: 88, visitas: 5, reincidentes: 0 },
    { loja: 'Norte Shopping', pos: 5, total: 6, media: 70, visitas: 3, reincidentes: 2 },
    { loja: 'Bangu', pos: 6, total: 6, media: 62, visitas: 3, reincidentes: 3 },
    { loja: 'Itaquera', pos: null, total: 6, media: 80, visitas: 1, emFormacao: true },
    { loja: 'Guarulhos', pos: null, total: 6, media: 75, visitas: 2, emFormacao: true },
    { loja: 'Campo Grande', pos: null, total: 6, media: null, visitas: 0 },
    { loja: 'Rancho', pos: null, total: 6, media: null, visitas: 0 },
    { loja: 'Nova América', pos: null, total: 6, media: null, visitas: 0 },
  ];
  const ver = (loja) => page.evaluate(([rk, loja]) => {
    _vckHomeRanking = rk; _vckAlertaLoja = loja; _vckHomeRankAberto = true;
    const h = _vckHomeRankingHtml();
    const host = document.createElement('div'); host.innerHTML = h;
    const txt = host.textContent.replace(/\s+/g, ' ');
    return { html: h, txt };
  }, [RK, loja]);

  const bangu = await ver('Bangu');
  check('Bangu (6º) vê o pódio: São Gonçalo, Pedreira, Boulevard e Caxias (empate no 3º)', ['São Gonçalo', 'Pedreira', 'Boulevard', 'Caxias'].every(n => bangu.html.includes(n)), bangu.txt);
  check('…e a própria posição (6º, média 62)', /Bangu/.test(bangu.txt) && /6º de 6/.test(bangu.txt), bangu.txt);
  check('…e NÃO vê as outras do 4º em diante nem as em formação/sem visita (nem no HTML)', !['Norte Shopping', 'Itaquera', 'Guarulhos', 'Campo Grande', 'Rancho', 'Nova América'].some(n => bangu.html.includes(n)), bangu.txt);
  check('…só a contagem de quantas ficaram de fora (6 lojas)', /\+ 6 lojas — fora do pódio cada loja vê só a própria posição/.test(bangu.txt), bangu.txt);

  const sg = await ver('São Gonçalo');
  check('quem está no pódio vê o pódio, sem as outras', ['Pedreira', 'Boulevard', 'Caxias'].every(n => sg.html.includes(n)) && !/Bangu|Norte Shopping/.test(sg.html), sg.txt);

  const it = await ver('Itaquera');
  check('loja em formação vê o pódio e a própria linha ("em formação")', /Itaquera/.test(it.txt) && /em formação/.test(it.txt) && !/Guarulhos|Bangu/.test(it.html), it.txt);

  const vazio = await page.evaluate(() => {
    _vckHomeRanking = [{ loja: 'Bangu', pos: null, total: 0, media: 70.1, visitas: 2, emFormacao: true }, { loja: 'Pedreira', pos: null, total: 0, media: 89, visitas: 1, emFormacao: true }];
    _vckAlertaLoja = 'Bangu'; _vckHomeRankAberto = true;
    const h = _vckHomeRankingHtml(); return { h, txt: h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
  });
  check('ninguém com posição ainda (o print): Bangu vê só a si, nenhuma outra loja', /Bangu/.test(vazio.txt) && !/Pedreira/.test(vazio.h) && /\+ 1 loja —/.test(vazio.txt), vazio.txt);

  // O Painel (supervisão) segue vendo tudo.
  const painel = await page.evaluate((rk) => _vckRankingHtml(rk, ''), RK);
  check('o ranking do Painel (supervisão) continua com as 11 lojas', ['Norte Shopping', 'Bangu', 'Itaquera', 'Nova América'].every(n => painel.includes(n)));

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
