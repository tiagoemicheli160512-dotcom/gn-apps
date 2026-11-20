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
  // ── Mesma coisa em Cancel. e transf. (cancelamentos + transferências de mesa) ──────
  const c = await page.evaluate(async () => {
    const canc = (k, nome, n) => ({ k, nome, valor: n * 50, semFoto: 0, itens: Array.from({ length: n }, (_, i) => ({ data: '2026-11-10', valor: 50, motivo: 'motivo ' + k + ' ' + i, motivo_categoria: 'Cliente desistiu', autor: 'Gerente', foto: null })) });
    const tr = (k, nome, n) => ({ k, nome, semFoto: 0, itens: Array.from({ length: n }, (_, i) => ({ data: '2026-11-10', origem: i, destino: i + 1, motivo: 'troca ' + k + ' ' + i, autor: 'Gerente', foto: null })) });
    const dc = { lojas: [canc('BANGU', 'Bangu', 30), canc('CAXIAS', 'Caxias', 25)], qtd: 55, semFoto: 0, nLojas: 11, semCancel: [{ k: 'PEDREIRA', nome: 'Pedreira', estado: 'declarado' }] };
    dc.valor = 55 * 50;
    const dt = { lojas: [tr('BANGU', 'Bangu', 12), tr('NORTE SHOPPING', 'Norte Shopping', 9)], qtd: 21, nLojas: 11, semTransf: [] };
    _dashCancelPer = {}; _dashTransfPer = {}; _dashFat = { BANGU: 300000, CAXIAS: 200000, PEDREIRA: 150000 };
    _cancelMacroDados = () => dc; _transfMacroDados = () => dt;
    _cancelPorCategoriaHtml = () => ''; _cancelSemNadaHtml = () => ''; _transfSemNadaHtml = () => '';
    const el = document.getElementById('dash-section');
    const montar = () => { el.innerHTML = _buildCancelPanel(); };
    montar();
    const vis = (p, k) => { const b = [...el.querySelectorAll('.pl-loja')].find(x => x.dataset.painel === p && x.dataset.loja === k); const n = b && b.querySelector('.pl-notas'); return !!n && getComputedStyle(n).display !== 'none'; };
    const out = { fechadas: !vis('cancel', 'BANGU') && !vis('cancel', 'CAXIAS') && !vis('transf', 'BANGU') && !vis('transf', 'NORTE SHOPPING'),
      altura: Math.round(el.getBoundingClientRect().height), textoTem: /motivo BANGU 29/.test(el.textContent) && /troca NORTE SHOPPING 8/.test(el.textContent) };
    [...el.querySelectorAll('.pl-loja')].find(x => x.dataset.painel === 'cancel' && x.dataset.loja === 'CAXIAS').querySelector('.pl-cab').click();
    out.abriuCaxias = vis('cancel', 'CAXIAS') && !vis('cancel', 'BANGU') && !vis('transf', 'BANGU');
    // O ranking de cancelamento leva até a loja; a loja "zerada" (Pedreira, declarou que não
    // houve) não tem bloco e não é clicável.
    window.scrollTo(0, 0);
    const rkC = [...el.querySelectorAll('.pl-rank')].filter(x => x.getAttribute('onclick') && x.getAttribute('onclick').includes("'cancel'"));
    out.pedreiraClicavel = rkC.some(x => x.getAttribute('onclick').includes('PEDREIRA'));
    rkC.find(x => x.getAttribute('onclick').includes("'BANGU'")).click(); await new Promise(r => setTimeout(r, 900));
    out.rankCancel = vis('cancel', 'BANGU');
    const rkT = [...el.querySelectorAll('.pl-rank')].find(x => (x.getAttribute('onclick') || '').includes("'transf','NORTE SHOPPING'"));
    rkT.click(); await new Promise(r => setTimeout(r, 900));
    const hdr = document.querySelector('.app-hdr');
    out.rankTransf = vis('transf', 'NORTE SHOPPING');
    out.topTransf = Math.round([...el.querySelectorAll('.pl-loja')].find(x => x.dataset.painel === 'transf' && x.dataset.loja === 'NORTE SHOPPING').getBoundingClientRect().top);
    out.hdrH = Math.round(hdr.getBoundingClientRect().height);
    // Cada lista tem o seu "abrir todas"; abrir as de cancelamento não abre as de transferência.
    // Fecha a Bangu (aberta pelo ranking): com uma fechada, o botão volta a ser "Abrir todas".
    [...el.querySelectorAll('.pl-loja')].find(x => x.dataset.painel === 'cancel' && x.dataset.loja === 'BANGU').querySelector('.pl-cab').click();
    const btnC = [...el.querySelectorAll('.pl-todas')].find(x => x.dataset.painel === 'cancel');
    out.btnTxt = btnC.textContent.trim();
    btnC.click();
    out.todasCancel = vis('cancel', 'BANGU') && vis('cancel', 'CAXIAS') && !vis('transf', 'BANGU');
    montar();
    out.persistiu = vis('cancel', 'CAXIAS') && vis('transf', 'NORTE SHOPPING') && !vis('transf', 'BANGU');
    return out;
  });
  check('Cancel. e transf.: cancelamentos e transferências vêm fechados por loja', c.fechadas && c.altura > 200, c);
  check('…tocar abre só aquela loja daquela lista', c.abriuCaxias, c);
  check('…o ranking de cancelamento leva até a loja; a loja zerada (sem bloco) não é clicável', c.rankCancel && !c.pedreiraClicavel, c);
  check('…o ranking de transferências também, parando abaixo do cabeçalho fixo', c.rankTransf && c.topTransf >= c.hdrH && c.topTransf < c.hdrH + 60, c);
  check('…"Abrir todas" de uma lista não abre a outra; e o aberto continua aberto no redesenho', c.btnTxt === '▼ Abrir todas' && c.todasCancel && c.persistiu, c);
  check('…os motivos continuam no conteúdo (relatórios não mudam)', c.textoTem, c);

  console.log('medidas:', JSON.stringify({ altura: r.altura, hdrH: r.hdrH, rankTop: r.rankTop }));
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
