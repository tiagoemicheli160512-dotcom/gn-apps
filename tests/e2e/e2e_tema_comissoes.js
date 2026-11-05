// Tema escuro no app Gorjetas (gn-comissoes) e na Mestra (gn-comissoes-mestra), que
// compartilham o MESMO vocabulário de tokens — por isso o mesmo teste serve pros dois:
//
//   APP=gn-comissoes node e2e_tema_comissoes.js
//
// Estes dois já tinham camada de tokens, e boa: o trabalho foi mapear as ~50 cores
// literais que sobraram e declarar o :root[data-tema="escuro"]. O risco, como sempre, não
// é quebrar — é texto escuro sobre tinta escura, que não dá erro nenhum na tela.
//
// A diferença em relação ao teste genérico é o portão: este app não para no login, para na
// SELEÇÃO DE LOJA, e enquanto ela está na frente o cabeçalho (com o botão do tema dentro)
// nem é desenhado. Então a sessão é semeada antes da página rodar, pelo mesmo caminho que
// o gn-home usa de verdade, e o init do app escolhe a loja sozinho.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const { MEDIDOR } = require('' + CAMINHOS.fix('medidor_contraste.js') + '');
const APP  = process.env.APP || 'gn-comissoes';
const ARQ  = process.env.ARQ  || CAMINHOS.pub(`${APP}.html`);
const BASE = process.env.BASE || CAMINHOS.pub(`_base_${APP}.html`);
// A Mestra usa o mesmo vocabulário de tokens e o mesmo cabeçalho, mas nomeia a lista de
// abas de outro jeito — é a única diferença que o teste precisa saber.
const VTABS = process.env.VTABS || 'TABS';
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => {
    const u = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'BANGU',
                permissoes: { master: true, comissoes: true }, ts: Date.now() };
    try {
      localStorage.setItem('gn_session_v1', JSON.stringify(u));
      localStorage.setItem('gn_mestra_usuario', JSON.stringify('Tiago'));
      localStorage.setItem('gn_BANGU_usuario', JSON.stringify('Tiago'));
      localStorage.setItem('gn_aviso_guia_v1', '1');
    } catch (e) {}
  });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const erros = [];

  const abrir = async (pg, arquivo) => {
    for (let t = 1; ; t++) {
      await pg.goto('file://' + arquivo);
      // Esperar só pelas FUNÇÕES não prova nada: declaração de função é içada pro topo do
      // bloco e já existe com o script no meio da execução. TABS é um const avaliado na
      // ordem, lá no fim — é ele que prova que o bloco terminou.
      try { await pg.waitForFunction((v) => { try {
        // Function() compila em escopo global: um `const` de topo de <script> mora no
        // léxico global e NÃO vira propriedade de window — window['TABS_MESTRA'] é undefined.
        return typeof setTab === 'function' && Array.isArray(Function('return ' + v)());
      } catch (e) { return false; } }, VTABS, { timeout: 15000 }); break; }
      catch (e) { if (t >= 5) throw new Error('não carregou: ' + arquivo); }
    }
    await pg.waitForTimeout(600);
    // Sem rede o app fica esperando a nuvem; força o render com o que tem em mãos.
    await pg.evaluate(() => {
      try { if (typeof selecionarLoja === 'function' && !LOJA) selecionarLoja('BANGU', 'Bangu'); } catch (e) {}
      try { document.getElementById('seletor-loja').style.display = 'none'; } catch (e) {}
      try { document.getElementById('login').style.display = 'none'; } catch (e) {}
      try { document.getElementById('app').style.display = 'flex'; } catch (e) {}
      try { render(); } catch (e) {}
    });
    await pg.waitForTimeout(300);
  };

  const page = await ctx.newPage();
  page.on('pageerror', e => erros.push(String(e)));
  await abrir(page, ARQ);

  // Prova que o app entrou de verdade: sem isto tudo abaixo mediria uma tela escondida e
  // passaria em verde sem exercitar nada — já aconteceu duas vezes nesta série.
  const entrou = await page.evaluate(() => {
    const cab = document.querySelector('.header');
    const b = document.querySelector('[data-botao-tema]');
    return { cabNaTela: !!(cab && cab.getClientRects().length),
             botaoNoCab: !!(cab && b && cab.contains(b)),
             abas: document.querySelectorAll('#tab-bar .tab').length,
             visiveis: [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length).length };
  });
  check(`o app entrou de verdade: cabeçalho na tela e ${entrou.abas} abas montadas (${entrou.visiveis} elementos visíveis)`,
    entrou.cabNaTela && entrou.abas >= 5);
  check('e o botão do tema está dentro do cabeçalho', entrou.botaoNoCab);

  check('abre no claro por padrão',
    (await page.evaluate(() => document.documentElement.getAttribute('data-tema'))) === null);

  const vis = await page.evaluate(() => {
    const b = document.querySelector('[data-botao-tema]');
    if (!b) return { existe: false };
    const r = b.getBoundingClientRect();
    return { existe: true, naTela: r.width > 14 && r.height > 14 && r.top >= 0 && r.left >= 0 && r.right <= innerWidth,
             w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
  });
  check('o botão do tema existe', vis.existe === true);
  check('e está visível e tocável a 390px (a lição do Check-list)', vis.naTela === true);
  if (vis.existe && !vis.naTela) console.log(`      medido: ${vis.w}x${vis.h} no topo ${vis.top}`);

  const t1 = await page.evaluate(() => { gnTrocarTema();
    return { attr: document.documentElement.getAttribute('data-tema'),
             chave: localStorage.getItem('gn_tema'),
             icone: document.querySelector('[data-botao-tema]').textContent.trim(),
             barra: (document.querySelector('meta[name="theme-color"]') || {}).content }; });
  check('o botão liga o escuro', t1.attr === 'escuro');
  check('guardando na chave compartilhada entre os apps', t1.chave === 'escuro');
  check('e o ícone vira o de voltar pro claro', t1.icone === '☀️');
  check('a barra do sistema acompanha', /14171C/i.test(t1.barra || ''));

  check('o tema é aplicado antes do <style> (sem piscar branco na entrada)',
    await page.evaluate(() => {
      const sc = document.head.querySelector('script[src*="gn-tema"]'), st = document.querySelector('style');
      return !!(sc && st && (sc.compareDocumentPosition(st) & Node.DOCUMENT_POSITION_FOLLOWING));
    }));

  const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const lum = (c) => { const n = (c.match(/[\d.]+/g) || []).map(Number);
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return n.length >= 3 ? 0.2126 * f(n[0]) + 0.7152 * f(n[1]) + 0.0722 * f(n[2]) : 1; };
  check('o fundo da página escurece de verdade', lum(fundo) < 0.2);
  if (lum(fundo) >= 0.2) console.log('      fundo medido: ' + fundo);

  // ── Dá pra ler, em cada aba? ─────────────────────────────────────────────────────────
  const varrer = async (pg) => {
    // Esperar a TRANSIÇÃO acabar antes de medir. Vários apps têm
    // `transition:all .15s` nos chips e botões: medir no mesmo instante em que o tema
    // troca pega a cor NO MEIO do caminho, e o teste acusa (ou esconde) um contraste
    // que não existe em tela parada. Duas rodadas seguidas davam números diferentes.
    await pg.waitForTimeout(400);
    const abas = await pg.evaluate((v) => Function('return ' + v)().map(t => t.id), VTABS);
    const achados = [];
    for (const aba of abas) {
      await pg.evaluate((a) => { try { setTab(a); } catch (e) {} window.scrollTo(0, 0); }, aba);
      await pg.waitForTimeout(120);
      const ruins = await pg.evaluate(MEDIDOR);
      if (ruins.length) achados.push({ aba, ruins });
    }
    return achados;
  };

  await page.evaluate(() => gnTema.aplicar('escuro'));
  const escuro = await varrer(page);
  await page.evaluate(() => gnTema.aplicar('claro'));
  const claro = await varrer(page);

  // A base é o arquivo do origin/main: o que JÁ era fraco em produção não é regressão
  // desta mudança, e padrão absoluto reprovaria o app que está no ar.
  const pb = await ctx.newPage();
  pb.on('pageerror', e => erros.push('[base] ' + e));
  await abrir(pb, BASE);
  // A base abre no MESMO contexto e herdaria o gn_tema='escuro' guardado acima.
  await pb.evaluate(() => document.documentElement.removeAttribute('data-tema'));
  const baseR = {};
  for (const a of await varrer(pb)) for (const x of a.ruins) {
    const k = a.aba + '|' + x.txt;
    if (baseR[k] === undefined || x.r < baseR[k]) baseR[k] = x.r;
  }
  await pb.close();

  const pior = (lista) => { const out = [];
    for (const a of lista) for (const x of a.ruins) {
      const antes = baseR[a.aba + '|' + x.txt];
      if (antes === undefined || x.r < antes - 0.01) out.push({ ...x, aba: a.aba, antes: antes === undefined ? 'não existia' : antes });
    } return out; };
  const contar = (lista) => { const s = new Set(); lista.forEach(a => a.ruins.forEach(x => s.add(a.aba + '|' + x.txt))); return s.size; };

  const pe = pior(escuro), pc = pior(claro);
  check(`no tema ESCURO nenhum texto ficou pior do que já é em produção (${Object.keys(baseR).length} caso(s) lá)`, pe.length === 0);
  pe.slice(0, 10).forEach(x => console.log(`      ${x.aba} "${x.txt}": ${x.antes} → ${x.r}:1  (${x.cor} sobre ${x.fundo})`));
  check('no tema CLARO nada piorou', pc.length === 0);
  pc.slice(0, 10).forEach(x => console.log(`      ${x.aba} "${x.txt}": ${x.antes} → ${x.r}:1  (${x.cor} sobre ${x.fundo})`));
  console.log(`      (abaixo de 3:1 — produção: ${Object.keys(baseR).length} · escuro: ${contar(escuro)} · claro: ${contar(claro)})`);

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError/i.test(e));
  check('nenhum erro de JS', reais.length === 0);
  reais.slice(0, 4).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
