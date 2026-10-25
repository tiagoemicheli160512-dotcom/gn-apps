// "Esse padrão do PDF está maravilhoso, a gente consegue fazer esse padrão em todos os
//  relatórios? Ficou limpo e intuitivo. Com a marca do GN."
//
// Antes: nove cópias de gerarPDF espalhadas pelos apps, já divergidas em três variantes,
// jogando o texto cru num <pre> monoespaçado. Agora todas apontam pro mesmo
// gnRelatorioPDF em gn-lojas-config.js.
//
// O que este teste tem que provar, e é onde a mudança pode quebrar de verdade:
//   1. nos NOVE apps a função existe e o app carrega o config antes de precisar dela —
//      se um ficar de fora, o botão de PDF daquele app morre calado;
//   2. o PDF sai com a marca, o título e o rodapé;
//   3. texto vindo do banco não vira HTML.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const APPS = ['gn-caixa','gn-checklist','gn-comissoes','gn-home','gn-inventario',
              'gn-lojas','gn-manutencao','gn-pedidos','gn-rh'];
let ok = 0, falhou = 0;
const check = (n, c, extra) => {
  console.log((c ? 'OK: ' : 'FALHOU: ') + n);
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300));
  c ? ok++ : falhou++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  const htmls = {};
  for (const app of APPS) {
    const page = await ctx.newPage();
    for (let t = 1; ; t++) {
      await page.goto(('file://' + CAMINHOS.PUBLICO + '/') + app + '.html');
      try {
        await page.waitForFunction(() => document.readyState === 'complete' && !!window.gnRelatorioPDF, { timeout: 30000 });
        break;
      } catch (e) { if (t >= 4) { htmls[app] = { erro: 'config não carregou' }; break; } }
    }
    if (htmls[app] && htmls[app].erro) { await page.close(); continue; }
    htmls[app] = await page.evaluate(() => {
      const r = { temLocal: typeof gerarPDF === 'function' };
      let out = '';
      const o = window.open;
      window.open = () => ({ document: { write: h => { out = h; }, close: () => {} } });
      try {
        // Chama a função LOCAL do app, que é o que os 25 pontos de chamada usam.
        gerarPDF('Total: R$ 466,48\n\nPor loja:\n   Bangu — R$ 300,00\n\n<b>vindo do banco</b>', 'Teste — Semanal');
      } catch (e) { r.erro = String(e.message || e); }
      finally { window.open = o; }
      r.html = out;
      return r;
    });
    await page.close();
  }

  // ── 1. Os nove apps ─────────────────────────────────────────────────────────
  APPS.forEach(app => {
    const r = htmls[app] || {};
    check(`${app}: o gerador compartilhado está disponível e gerarPDF funciona`,
      !r.erro && r.temLocal && !!r.html && r.html.length > 200, r.erro || ('html=' + (r.html || '').length));
  });

  // ── 2. O padrão ─────────────────────────────────────────────────────────────
  const h = (htmls['gn-home'] || {}).html || '';
  check('traz a marca GN', /class="marca-gn">GN</.test(h), h.slice(0, 400));
  check('com a tagline do app', /Sistema de Gest[aã]o/.test(h));
  check('o título em ouro, como no modelo aprovado',
    /<h1>Teste — Semanal<\/h1>/.test(h) && /#CA8A04/.test(h));
  check('a linha de "gerado em"', /class="sub">gerado em \d{2}\/\d{2} \d{2}:\d{2}</.test(h), h.match(/class="sub"[^<]*</));
  check('e o rodapé', /class="footer">GN Operações/.test(h));
  check('não usa mais fonte monoespaçada no corpo todo',
    !/body\{font-family:monospace/.test(h) && /-apple-system/.test(h));

  // ── 3. Estrutura a partir do texto, sem inventar dado ───────────────────────
  check('linha terminada em ":" vira título de seção',
    /<div class="sec">Por loja:<\/div>/.test(h), h.match(/Por loja[\s\S]{0,60}/));
  check('linha recuada vira detalhe', /<div class="det">   Bangu — R\$ 300,00<\/div>/.test(h),
    h.match(/Bangu[\s\S]{0,60}/));
  check('linha comum fica como está', /<div class="lin">Total: R\$ 466,48<\/div>/.test(h));
  check('linha em branco vira espaço, não some', /<div class="gap"><\/div>/.test(h));

  // ── 4. Texto do banco não vira HTML ─────────────────────────────────────────
  check('tag vinda do texto sai escapada',
    /&lt;b&gt;vindo do banco&lt;\/b&gt;/.test(h) && !/<b>vindo do banco<\/b>/.test(h),
    h.match(/vindo do banco[\s\S]{0,40}/));
  const comAspas = await (async () => {
    const page = await ctx.newPage();
    await page.goto(('file://' + CAMINHOS.pub('gn-home.html')));
    await page.waitForFunction(() => !!window.gnRelatorioPDF, { timeout: 30000 });
    const r = await page.evaluate(() => {
      let out = ''; const o = window.open;
      window.open = () => ({ document: { write: h => { out = h; }, close: () => {} } });
      try { gerarPDF('x', '"><script>alert(1)</script>'); } finally { window.open = o; }
      return out;
    });
    await page.close();
    return r;
  })();
  check('título com aspas e tag não escapa do documento',
    !/<script>alert\(1\)<\/script>/.test(comAspas.replace(/window\.print/g, '')) && /&lt;script&gt;/.test(comAspas),
    comAspas.match(/<h1>[\s\S]{0,90}/));

  // ── 5. Título e rodapé não podem sair duas vezes ────────────────────────────
  // Os 25 relatórios já escrevem o próprio título na 1ª linha e "GN Operações" na última.
  const dup = await (async () => {
    const page = await ctx.newPage();
    await page.goto(('file://' + CAMINHOS.pub('gn-home.html')));
    await page.waitForFunction(() => !!window.gnRelatorioPDF, { timeout: 30000 });
    const r = await page.evaluate(() => {
      const chamar = (texto, titulo) => {
        let out = ''; const o = window.open;
        window.open = () => ({ document: { write: h => { out = h; }, close: () => {} } });
        try { gerarPDF(texto, titulo); } finally { window.open = o; }
        return out;
      };
      return {
        repetido: chamar('NOTAS CANCELADAS — 12/10\n\nTotal: R$ 10,00\n\nGN Operações · 16/10 10:30',
                         'Notas canceladas — 12/10'),
        parecido: chamar('Notas canceladas do mês\n\nTotal: R$ 10,00', 'Notas canceladas — 12/10'),
        semRodape: chamar('Total: R$ 10,00', 'Relatório X'),
      };
    });
    await page.close();
    return r;
  })();
  check('título repetido na 1ª linha do texto não aparece duas vezes',
    (dup.repetido.match(/12\/10/g) || []).length >= 1
    && !/class="(lin|sec)">NOTAS CANCELADAS/.test(dup.repetido),
    dup.repetido.match(/<h1>[\s\S]{0,220}/));
  check('e o rodapé do próprio texto vira o rodapé do documento, em vez de duplicar',
    /class="footer">GN Operações · 16\/10 10:30</.test(dup.repetido)
    && !/class="(lin|det)">GN Operações/.test(dup.repetido),
    dup.repetido.match(/footer[\s\S]{0,120}/));
  check('linha só PARECIDA com o título não é removida (seria perder conteúdo)',
    /class="lin">Notas canceladas do mês</.test(dup.parecido), dup.parecido.match(/do mês[\s\S]{0,40}/));
  check('relatório sem rodapé próprio ganha o genérico',
    /class="footer">GN Operações · Relatório X</.test(dup.semRodape));

  // ── 6. KPIs opcionais, pra quem tiver número de topo ────────────────────────
  const comKpi = await (async () => {
    const page = await ctx.newPage();
    await page.goto(('file://' + CAMINHOS.pub('gn-home.html')));
    await page.waitForFunction(() => !!window.gnRelatorioPDF, { timeout: 30000 });
    const r = await page.evaluate(() => {
      let out = ''; const o = window.open;
      window.open = () => ({ document: { write: h => { out = h; }, close: () => {} } });
      try {
        gnRelatorioPDF({ titulo: 'Com KPI', texto: 'corpo',
          kpis: [{ label: 'Total', valor: 'R$ 1,00', sub: 'no período' }, { label: 'Lojas', valor: '11/11' }] });
      } finally { window.open = o; }
      return out;
    });
    await page.close();
    return r;
  })();
  check('relatório pode levar KPIs no topo, como o do Painel',
    /class="kpi-label">Total</.test(comKpi) && /class="kpi-val">R\$ 1,00</.test(comKpi)
    && /class="kpi-sub">no período</.test(comKpi), comKpi.match(/kpi-row[\s\S]{0,260}/));
  check('e o grid acompanha quantos KPIs são (2, não 3)',
    /grid-template-columns:repeat\(2,1fr\)/.test(comKpi), comKpi.match(/kpi-row[^>]*>/));
  check('sem KPIs, nenhuma caixa vazia aparece', !/class="kpi-row"/.test(h));

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
