// 18/11/2026: a SAUDALI/CIACARNE foi confirmada na terça cedo, entregou na quarta e a
// previsão saiu pra segunda seguinte (o app pula pro próximo dia de entrega). Ela ora
// entrega na semana seguinte, ora na mesma. "Pode fazer o aviso sim" — só pra ela.
//
// Cobra, rodando a confirmação de verdade (_confirmarFornecedoresSelecionados):
//  · Ciacarne sem 📅 caindo na semana que vem → pergunta; OK mantém a data (caso comum);
//  · Cancelar + OK → grava com a data de hoje; Cancelar + Cancelar → não grava nada;
//  · item com 📅 não pergunta; outro fornecedor (CIA MATHEUS) nunca pergunta.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-17T06:57:00');   // terça, como no caso real
  const gravadas = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = decodeURIComponent(req.url());
    if (/gn_provisoes/.test(u) && req.method() === 'POST') { const b = JSON.parse(req.postData() || '[]'); gravadas.push(...(Array.isArray(b) ? b : [b])); return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  let respostas = [], perguntas = [];
  page.on('dialog', d => { perguntas.push(d.message()); const r = respostas.shift(); r === false ? d.dismiss() : d.accept(); });
  await page.goto('file://' + PEDIDOS);
  await page.waitForFunction(() => { try { return typeof _confirmarFornecedoresSelecionados === 'function' && typeof S === 'object' && S !== null; } catch (e) { return false; } }, null, { timeout: 25000 });

  // forn: fornecedor a confirmar; semana: marca 📅 no item. resp: respostas aos diálogos (as 2
  // confirmações de sempre vêm primeiro).
  const confirmar = async (forn, semana, resp) => {
    respostas = [true, true, ...resp]; perguntas = []; const antes = gravadas.length;
    await page.evaluate(({ forn, semana }) => {
      S.regiao = 'RJ'; S.hortifrutiAtivo = false;
      S.pedidoAtual = { id: 'ped-1', status: 'RASCUNHO' };
      S.fornecedores = [{ nome: 'SAUDALI/CIACARNE', dias_entrega: ['SEG', 'TER'] }, { nome: 'CIA MATHEUS', dias_entrega: ['SEG', 'TER'] }];
      S.catalogo = [{ id: 'c-lombo', produto: 'Lombo', fornecedor: 'SAUDALI/CIACARNE', custo: 10, ativo: true }, { id: 'c-touc', produto: 'Toucinho', fornecedor: 'CIA MATHEUS', custo: 5, ativo: true }];
      S.lojas = [{ slug_pedido: 'bangu', nome_display: 'Bangu' }, { slug_pedido: 'caxias', nome_display: 'Caxias' }];
      S.pedidoItens = { 'c-lombo': { bangu: { id: 'i1', qtd: 10, entregaSemana: semana }, caxias: { id: 'i2', qtd: 10, entregaSemana: semana } }, 'c-touc': { bangu: { id: 'i3', qtd: 20 } } };
      S.fornecedoresConfirmados = new Set(); S.fornecedoresReabertos = new Set(); S.fornecedoresRevertidos = {};
      window._flushQtdTimersPendentes = async () => {}; window._pendentesDosFornecedores = () => 0; window.carregarItensPedido = async () => {};
      window.renderPedido = () => {};
      let box = document.getElementById('_t'); if (!box) { box = document.createElement('div'); box.id = '_t'; document.body.appendChild(box); }
      box.innerHTML = `<input type="checkbox" class="confirmForn-chk" value="${forn}" checked>`;
    }, { forn, semana });
    await page.evaluate(() => _confirmarFornecedoresSelecionados());
    await page.waitForTimeout(200);
    const extras = perguntas.slice(2);
    return { extras, datas: gravadas.slice(antes).map(p => p.data_entrega) };
  };

  const a = await confirmar('SAUDALI/CIACARNE', false, [true]);
  check('Ciacarne sem 📅 caindo na semana que vem: pergunta antes de gravar, com a data e as lojas',
    a.extras.length === 1 && /SAUDALI\/CIACARNE: a previsão vai sair para SEGUNDA 23\/11 — SEMANA QUE VEM \(2 item\(ns\) em 2 loja\(s\)\)/.test(a.extras[0]), a);
  check('…OK mantém a semana que vem (23/11) — o toque automático não muda a data', a.datas.length === 2 && a.datas.every(d => d === '2026-11-23'), a);

  const b = await confirmar('SAUDALI/CIACARNE', false, [false, true]);
  check('Cancelar + OK: grava com a data de HOJE (17/11), igual ao 📅', b.extras.length === 2 && /data de HOJE \(terça 17\/11\)/.test(b.extras[1]) && b.datas.length === 2 && b.datas.every(d => d === '2026-11-17'), b);

  const c = await confirmar('SAUDALI/CIACARNE', false, [false, false]);
  check('Cancelar + Cancelar: não grava nada', c.extras.length === 2 && c.datas.length === 0, c);

  const d = await confirmar('SAUDALI/CIACARNE', true, []);
  check('com 📅 marcado nos itens: não pergunta e grava hoje', d.extras.length === 0 && d.datas.length === 2 && d.datas.every(x => x === '2026-11-17'), d);

  const e = await confirmar('CIA MATHEUS', false, []);
  check('outro fornecedor (CIA MATHEUS) segue a regra normal, sem pergunta', e.extras.length === 0 && e.datas.length === 1 && e.datas[0] === '2026-11-23', e);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
