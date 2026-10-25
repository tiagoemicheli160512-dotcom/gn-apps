// Tema escuro no app Lojas — o maior arquivo do sistema: 1.912 cores escritas à mão e
// ZERO tokens. A paleta dele é slate (#64748B rótulo, #475569 corpo), diferente dos outros,
// mas o vocabulário novo é o mesmo do Check-list e do Painel: três dicionários pra mesma
// coisa é o que faz um deles apodrecer.
//
// O teste é o mesmo de sempre, e o medidor virou arquivo compartilhado (medidor_contraste.js)
// depois de eu copiá-lo duas vezes e ter que corrigir as cópias uma a uma.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const { MEDIDOR } = require('' + CAMINHOS.fix('medidor_contraste.js') + '');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
const BASE = process.env.ARQ_BASE || CAMINHOS.pub('_base_lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));

  const abrir = async (pg, arquivo) => {
    for (let t = 1; ; t++) {
      await pg.goto('file://' + arquivo);
      try { await pg.waitForFunction(() => { try {
        // Cada app tem seus próprios globais: LOJAS_LISTA não existe aqui. changeLoja é
        // função deste arquivo, e o #header é a barra de cima.
        return typeof changeLoja === 'function' && !!document.getElementById('header');
      } catch (e) { return false; } }, { timeout: 15000 }); break; }
      catch (e) { if (t >= 5) throw new Error('não carregou: ' + arquivo); }
    }
    await pg.evaluate(() => {
      // ESCONDE o que cobre a tela, não remove: o app agenda um
      // setTimeout(() => getElementById('loginNome').focus(), 100) logo depois de montar o
      // login, e apagar o elemento fazia esse timer estourar — o teste acusava um erro de
      // JS que ele mesmo tinha criado. display:none basta: o medidor já pula o que não tem
      // caixa na tela.
      document.querySelectorAll('[id*="verlay"],#login-screen').forEach(e => { e.style.display = 'none'; });
      document.body.style.overflow = '';
    });
  };
  await abrir(page, LOJAS);

  // ── O botão ──────────────────────────────────────────────────────────────────────────
  check('o Lojas abre no claro por padrão',
    (await page.evaluate(() => document.documentElement.getAttribute('data-tema'))) === null);

  const vis = await page.evaluate(() => {
    const b = document.querySelector('[data-botao-tema]');
    if (!b) return { existe: false };
    const r = b.getBoundingClientRect();
    return { existe: true, naTela: r.width > 14 && r.height > 14 && r.top >= 0 && r.left >= 0 && r.right <= innerWidth,
             w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('o botão do tema existe', vis.existe === true);
  check('e está visível e tocável a 390px (a lição do Check-list)', vis.naTela === true);
  if (vis.existe && !vis.naTela) console.log(`      medido: ${vis.w}x${vis.h}`);

  const t1 = await page.evaluate(() => { gnTrocarTema();
    return { attr: document.documentElement.getAttribute('data-tema'),
             chave: localStorage.getItem('gn_tema'),
             icone: document.querySelector('[data-botao-tema]').textContent.trim() }; });
  check('o botão liga o escuro', t1.attr === 'escuro');
  check('guardando na chave compartilhada entre os apps', t1.chave === 'escuro');
  check('e o ícone vira o de voltar pro claro', t1.icone === '☀️');

  const estrutura = await page.evaluate(() => {
    const sc = document.head.querySelector('script[src*="gn-tema"]') || document.querySelector('script[src*="gn-tema"]');
    const st = document.querySelector('style');
    if (!sc || !st) return false;
    return !!(sc.compareDocumentPosition(st) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  check('o tema é aplicado antes do <style> (sem piscar branco na entrada)', estrutura === true);

  // ── Dá pra ler? ──────────────────────────────────────────────────────────────────────
  // O Lojas não tem abas num seletor único; a varredura passa pelos botões de navegação
  // que existirem, e sempre mede ao menos a tela inicial.
  const varrer = async (pg) => {
    // Esperar a TRANSIÇÃO acabar antes de medir. Vários apps têm
    // `transition:all .15s` nos chips e botões: medir no mesmo instante em que o tema
    // troca pega a cor NO MEIO do caminho, e o teste acusa (ou esconde) um contraste
    // que não existe em tela parada. Duas rodadas seguidas davam números diferentes.
    await pg.waitForTimeout(400);
    const achados = [];
    const abas = await pg.evaluate(() => [...document.querySelectorAll('[data-tab],.tab-btn,.nav-btn')].map((b, i) => i));
    const passos = abas.length ? abas : [null];
    for (const i of passos) {
      if (i !== null) await pg.evaluate((idx) => {
        const bs = [...document.querySelectorAll('[data-tab],.tab-btn,.nav-btn')];
        try { bs[idx] && bs[idx].click(); } catch (e) {}
        window.scrollTo(0, 0);
      }, i);
      await pg.waitForTimeout(130);
      const ruins = await pg.evaluate(MEDIDOR);
      if (ruins.length) achados.push({ aba: i === null ? 'inicial' : 'nav#' + i, ruins });
    }
    return achados;
  };

  await page.evaluate(() => gnTema.aplicar('escuro'));
  const escuro = await varrer(page);

  // ── No claro, nada pode ter piorado ──────────────────────────────────────────────────
  await page.evaluate(() => gnTema.aplicar('claro'));
  const claro = await varrer(page);

  const pb = await ctx.newPage();
  await abrir(pb, BASE);
  await pb.evaluate(() => document.documentElement.removeAttribute('data-tema'));
  const baseRuins = {};
  for (const a of await varrer(pb)) for (const x of a.ruins) {
    const k = a.aba + '|' + x.txt;
    if (baseRuins[k] === undefined || x.r < baseRuins[k]) baseRuins[k] = x.r;
  }
  await pb.close();

  // O escuro é medido contra a MESMA base: o que já era fraco em produção (o hero pintado
  // com a cor da loja, igual nos dois temas) não é regressão desta mudança.
  const piorouEscuro = [];
  for (const a of escuro) for (const x of a.ruins) {
    const antes = baseRuins[a.aba + '|' + x.txt];
    if (antes === undefined || x.r < antes - 0.01) piorouEscuro.push({ ...x, aba: a.aba, antes: antes === undefined ? 'não existia' : antes });
  }
  const chavesEscuro = new Set();
  escuro.forEach(a => a.ruins.forEach(x => chavesEscuro.add(a.aba + '|' + x.txt)));
  check('no tema ESCURO, nenhum texto ficou pior do que já é em produção', piorouEscuro.length === 0);
  piorouEscuro.slice(0, 8).forEach(x => console.log(`      ${x.aba} "${x.txt}": era ${x.antes}:1, ficou ${x.r}:1 — cor ${x.cor} sobre ${x.fundo}`));
  console.log(`      (no escuro: ${chavesEscuro.size} caso(s) abaixo de 3:1, contra ${Object.keys(baseRuins).length} da produção)`);

  const piorou = [];
  for (const a of claro) for (const x of a.ruins) {
    const antes = baseRuins[a.aba + '|' + x.txt];
    if (antes === undefined || x.r < antes - 0.01) piorou.push({ ...x, aba: a.aba, antes: antes === undefined ? 'não existia' : antes });
  }
  const chaves = new Set();
  claro.forEach(a => a.ruins.forEach(x => chaves.add(a.aba + '|' + x.txt)));
  check(`no tema CLARO nada piorou (o que está no ar já tinha ${Object.keys(baseRuins).length} caso(s))`, piorou.length === 0);
  piorou.slice(0, 8).forEach(x => console.log(`      ${x.aba} "${x.txt}": era ${x.antes}:1, ficou ${x.r}:1`));
  console.log(`      (no claro: ${Object.keys(baseRuins).length} antes, ${chaves.size} depois)`);

  const errosReais = erros.filter(e => !/createClient|Failed to fetch/.test(e));
  check('nenhum erro de JS', errosReais.length === 0);
  errosReais.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
