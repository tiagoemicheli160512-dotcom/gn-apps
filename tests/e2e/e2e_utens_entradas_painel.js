// "Pode fazer a visão das entradas no painel de gestão." (16/11/2026) — Painel › Operação ›
// 🍴 Utensílios: as entradas que as lojas lançam no Check-list (📥 Entrada), por loja, com
// quem assinou. Janela de 30 ou 90 dias. Maglia fora.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };

const dias = n => new Date(Date.now() - n * 864e5).toISOString();
const ROWS = [
  { loja: 'BANGU', us: {
    'copo de chopp': { nome: 'Copo de chopp', qtd: 60, entradas: [
      { em: dias(2), qtd: 24, origem: 'Compra da loja', obs: 'nota 1234', assinado_por: 'Carla', registrado_por: 'Bangu Loja' },
      { em: dias(45), qtd: 10, origem: 'Outro', assinado_por: 'Neto', registrado_por: 'Neto' }] },
    'prato fundo': { nome: 'Prato fundo', qtd: 5 } } },
  { loja: 'NORTE', us: { 'garfo': { nome: 'Garfo', qtd: 80, entradas: [{ em: dias(5), qtd: 50, origem: 'Veio de outra loja', assinado_por: 'Felix', registrado_por: 'Felix' }] } } },
  { loja: 'MAGLIA', us: { 'taça': { nome: 'Taça', qtd: 9, entradas: [{ em: dias(1), qtd: 9, origem: 'Compra da loja', assinado_por: 'M' }] } } },
  { loja: 'CAXIAS', us: null },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  let url = '';
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (/gn_lojas/.test(u) && /utensilios_saldo/.test(decodeURIComponent(u))) { url = decodeURIComponent(u); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROWS) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let i = 1; ; i++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof renderDashboard === 'function' && typeof DASH_GRUPOS !== 'undefined'; } catch (e) { return false; } }, { timeout: 20000 }); break; }
    catch (e) { if (i >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _buildUtensEntradasPanel === 'function'))) {
    console.log('FALHOU: a aba de entradas de utensílios não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const r = await page.evaluate(async () => {
    LOJAS_LISTA = ['BANGU', 'NORTE SHOPPING', 'CAXIAS', 'MAGLIA'];
    const aba = JSON.stringify(DASH_GRUPOS.find(g => g.g === 'operacao').abas);
    _utensEntPainel = null; _utensEntDias = 30;
    await _loadUtensEntradasPainel();
    const pega = () => { const h = document.createElement('div'); h.innerHTML = _buildUtensEntradasPanel(); document.body.appendChild(h);
      const out = { txt: h.innerText.replace(/\s+/g, ' '), lojas: [...h.querySelectorAll('.utensent-loja')].map(x => x.dataset.loja), itens: h.querySelectorAll('.utensent-item').length }; h.remove(); return out; };
    const d30 = pega();
    _utensEntDias = 90; const d90 = pega();
    return { aba, d30, d90 };
  });
  check('Painel › Operação tem a aba 🍴 Utensílios', /utensent/.test(r.aba) && /Utensílios/.test(r.aba), r.aba);
  check('lê o saldo das lojas numa requisição só, sem a Maglia', /utensilios_saldo/.test(url) && /BANGU/.test(url) && /NORTE/.test(url) && !/MAGLIA/.test(url), url);
  check('30 dias: as entradas de Bangu (24 copos, 2 dias atrás) e Norte (50 garfos)', r.d30.lojas.join() === 'NORTE SHOPPING,BANGU' && r.d30.itens === 2, r.d30);
  check('…com total de peças (74), entradas (2) e lojas (2)', /Peças que entraram 74/i.test(r.d30.txt) && /2 entradas · 2 lojas/.test(r.d30.txt), r.d30.txt.slice(0, 300));
  check('…cada entrada com peça, origem, observação e quem assinou (e o aparelho, quando foi outro)', /Copo de chopp/.test(r.d30.txt) && /Compra da loja · nota 1234 · assinado por Carla \(aparelho: Bangu Loja\)/.test(r.d30.txt) && /\+24/.test(r.d30.txt), r.d30.txt);
  check('…e o saldo de hoje da peça', /saldo hoje 60/.test(r.d30.txt), r.d30.txt);
  check('a entrada de 45 dias atrás fica fora dos 30 dias e entra nos 90', !/Neto/.test(r.d30.txt) && /Neto/.test(r.d90.txt) && r.d90.itens === 3, r.d90.txt);
  check('lista quem não teve entrada (Caxias)', /Sem entrada no período: Caxias/.test(r.d30.txt), r.d30.txt);
  check('Maglia não aparece', !/Maglia|Taça/.test(r.d30.txt + r.d90.txt));

  // ── "Tem como colocar os estoques de quem tem e quem não fez ainda também, até pra cobrar
  //     a gerência." (17/11/2026) ──
  const est = await page.evaluate(() => {
    _utensEntDias = 30; _utensEstAberta = new Set();
    const pega = () => { const h = document.createElement('div'); h.innerHTML = _buildUtensEntradasPanel(); document.body.appendChild(h);
      const bloco = h.querySelector('.utensest');
      const out = { txt: bloco ? bloco.innerText.replace(/\s+/g, ' ') : '', sem: (h.querySelector('.utensest-sem') || {}).innerText || '',
        lojas: [...h.querySelectorAll('.utensest-loja')].map(x => x.dataset.loja), pecas: [...h.querySelectorAll('.utensest-pecas div')].map(x => x.innerText.replace(/\s+/g, ' ')) };
      h.remove(); return out; };
    const fechado = pega();
    _utensEstToggle('BANGU');
    const aberto = pega();
    // Sem nenhuma entrada no período, o estoque continua aparecendo.
    const salvo = _utensEntPainel.entradas; _utensEntPainel.entradas = [];
    const vazio = pega(); _utensEntPainel.entradas = salvo;
    return { fechado, aberto, vazio };
  });
  check('estoque: quem NÃO fez a contagem aparece primeiro, pra cobrar (Caxias)', /Não fizeram a contagem \(1\)/.test(est.fechado.sem) && /Caxias/.test(est.fechado.sem), est.fechado.sem);
  check('…quem tem o controle aparece com peças, unidades e zeradas (Bangu: 2 peças, 65 unidades; Norte: 1 peça, 80)',
    /Bangu 2 peças no controle/.test(est.fechado.txt) && /\b65\b/.test(est.fechado.txt) && /Norte Shopping 1 peça no controle/.test(est.fechado.txt) && /\b80\b/.test(est.fechado.txt), est.fechado.txt);
  check('…sem a Maglia', !est.fechado.lojas.includes('MAGLIA') && !/Maglia/.test(est.fechado.txt + est.fechado.sem), est.fechado.lojas);
  check('…"2 de 3 lojas com o controle começado"', /2 de 3 lojas com o controle começado/.test(est.fechado.txt), est.fechado.txt);
  check('tocar na loja abre as peças, da menor quantidade pra maior (Prato fundo 5, Copo de chopp 60)',
    est.fechado.pecas.length === 0 && est.aberto.pecas.length === 2 && /Prato fundo 5/.test(est.aberto.pecas[0]) && /Copo de chopp 60/.test(est.aberto.pecas[1]), est.aberto.pecas);
  check('mesmo sem nenhuma entrada no período, o estoque aparece', /Não fizeram a contagem/.test(est.vazio.sem) && est.vazio.lojas.length === 2, est.vazio);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
