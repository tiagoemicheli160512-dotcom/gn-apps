// Print do dono (20/11/2026), Painel › Caixa › Sem 10%, no mensal: "o relatório fica aberto
// total; pra ir até uma loja fica ruim. Tem como colocar fechado e ao clicar abrir a loja?"
//
// Cobra: cada loja vem fechada (nome, 10% e nº de notas à vista, notas escondidas); tocar
// no cabeçalho abre/fecha; tocar no ranking abre a loja e rola até ela; "Abrir todas" /
// "Fechar todas"; o que está aberto continua aberto quando o Painel redesenha; o texto (e
// portanto os relatórios) não muda.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildSem10Panel === 'function' && typeof _sem10MacroDados === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _sem10IrLoja === 'function'))) {
    console.log('FALHOU: as lojas da aba Sem 10% não abrem/fecham neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const r = await page.evaluate(async () => {
    const nota = (i, v) => ({ data: '2026-11-1' + (i % 9), mesa: String(i), garcom: 'Garçom ' + i, valor: v });
    const loja = (k, nome, n, v) => { const itens = Array.from({ length: n }, (_, i) => nota(i, v)); const valor = n * v; return { k, nome, itens, valor, dez: valor * 0.1, suspeitas: 0, semTotalDia: 0 }; };
    const lojas = [loja('ITAQUERA', 'Itaquera', 105, 223), loja('PEDREIRA', 'Pedreira', 80, 235), loja('BOULEVARD', 'Boulevard', 20, 192)];
    const d = { lojas, valor: lojas.reduce((a, l) => a + l.valor, 0), qtd: 205, suspeitas: 0, semTotalDia: 0, nLojas: 11, semNota: [] };
    d.dez = d.valor * 0.1;
    _dashSem10Per = {}; _sem10MacroDados = () => d; _sem10SemNadaHtml = () => '';
    // Tela do app aberta como depois do login (sem isso tudo mede 0 e o teste não prova nada).
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('home-screen').style.display = 'flex';
    const el = document.getElementById('dash-section'); el.style.display = 'block';
    const montar = () => { el.innerHTML = _buildSem10Panel(); };
    montar();
    const vis = k => { const b = el.querySelector(`.sem10-loja[data-loja="${k}"] .sem10-notas`); return b && getComputedStyle(b).display !== 'none'; };
    const out = {};
    out.fechadas = ['ITAQUERA', 'PEDREIRA', 'BOULEVARD'].every(k => !vis(k));
    out.altura = Math.round(el.getBoundingClientRect().height);
    out.cabTxt = el.querySelector('.sem10-loja[data-loja="ITAQUERA"] .sem10-loja-cab').innerText.replace(/\s+/g, ' ');
    out.textoTemNotas = /Mesa 57/.test(el.textContent);
    el.querySelector('.sem10-loja[data-loja="PEDREIRA"] .sem10-loja-cab').click();
    out.abriuPedreira = vis('PEDREIRA') && !vis('ITAQUERA');
    el.querySelector('.sem10-loja[data-loja="PEDREIRA"] .sem10-loja-cab').click();
    out.fechouPedreira = !vis('PEDREIRA');
    const hdr = document.querySelector('.app-hdr');
    out.hdrH = hdr ? Math.round(hdr.getBoundingClientRect().height) : 0;
    window.scrollTo(0, 0);
    const rank = [...el.querySelectorAll('.sem10-rank-linha')].find(x => /Itaquera/.test(x.innerText));
    rank.click(); await new Promise(res => setTimeout(res, 900));
    const box = el.querySelector('.sem10-loja[data-loja="ITAQUERA"]').getBoundingClientRect();
    out.rankAbriu = vis('ITAQUERA'); out.rankTop = Math.round(box.top);
    montar();
    out.continuaAberta = vis('ITAQUERA') && !vis('PEDREIRA');
    el.querySelector('.sem10-todas').click();
    out.todas = ['ITAQUERA', 'PEDREIRA', 'BOULEVARD'].every(vis) && /Fechar todas/.test(el.querySelector('.sem10-todas').textContent);
    el.querySelector('.sem10-todas').click();
    out.nenhuma = !['ITAQUERA', 'PEDREIRA', 'BOULEVARD'].some(vis);
    out.largos = [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).length;
    return out;
  });
  check('as lojas vêm fechadas (notas escondidas)', r.fechadas, r);
  check('…e a tela fechada é curta (3 lojas com 205 notas em menos de 1.600 px)', r.altura > 200 && r.altura < 1600, r.altura);
  check('fechada, a loja mostra nome, 10%, nº de notas e a seta pra abrir', /Itaquera R\$ 2\.341,50 ▼ 105 notas · R\$ 23\.415,00 em notas/.test(r.cabTxt), r.cabTxt);
  check('tocar no cabeçalho abre só aquela loja; tocar de novo fecha', r.abriuPedreira && r.fechouPedreira, r);
  check('tocar na loja do ranking abre ela e rola até ela, logo abaixo do cabeçalho fixo (sem ficar escondida)', r.rankAbriu && r.hdrH > 0 && r.rankTop >= r.hdrH && r.rankTop < r.hdrH + 60, r);
  check('o que está aberto continua aberto quando o Painel redesenha', r.continuaAberta, r);
  check('"Abrir todas" abre todas e vira "Fechar todas"; "Fechar todas" fecha', r.todas && r.nenhuma, r);
  check('as notas continuam no conteúdo (relatórios e contas não mudam)', r.textoTemNotas, r);
  check('nada passa da largura em 390 px', r.largos === 0, r.largos);
  console.log('medidas:', JSON.stringify({ altura: r.altura, hdrH: r.hdrH, rankTop: r.rankTop }));
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
