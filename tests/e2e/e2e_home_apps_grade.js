// "O que acha de fazer caixa menor e colocar 4 lado a lado" / "Gostei da ideia da bolinha.
//  Pelo que tenho de experiência usando dia a dia as informações não são bem lidas."
//  (07/11/2026)
//
// Os apps da Home viram uma grade de ícones (4 por linha no celular, 6 no computador), com
// o nome embaixo e o status como uma BOLINHA no canto do ícone, na cor que a etiqueta já
// tinha. Status que começa com contagem curta ("2 faltas hoje") põe o número na bolinha.
// O texto inteiro continua no elemento (title / aria-label / textContent).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const abrir = async (browser, largura) => {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-07T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', 'MODULES'], ['renderModules', 'setBadge', 'showHome']); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  await page.evaluate(() => {
    window.gnFetchJson = async (u, h, c, fb) => fb;
    session = { id: 7, nome: 'Teste', cargo: 'gerente', loja: 'BANGU', permissoes: { caixa: true, checklist: true, comissoes: true, lojas: true, pedidos: true, avaliacoes: true } };
    masterLoja = '';
    document.getElementById('home-screen').style.display = 'block';
    renderModules(session, false);
  });
  return { ctx, page, erros };
};
const grade = page => page.evaluate(() => {
  const rows = [...document.querySelectorAll('#mod-list .mod-row')].map(e => e.getBoundingClientRect());
  const tops = [...new Set(rows.map(r => Math.round(r.top)))];
  return { n: rows.length, porLinha: rows.filter(r => Math.round(r.top) === tops[0]).length, linhas: tops.length,
    larga: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    altura: Math.round(document.getElementById('mod-list').getBoundingClientRect().height) };
});
const lum = c => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  // ── 1. Celular: 4 por linha ─────────────────────────────────────────────────────────
  const { ctx, page, erros } = await abrir(browser, 390);
  let g = await grade(page);
  check('celular (390 px): 4 apps por linha', g.porLinha === 4, JSON.stringify(g));
  check('sem rolagem de lado', !g.larga);
  check(`a grade é baixa: ${g.n} apps em ${g.linhas} linhas, ${g.altura} px`, g.altura < g.linhas * 110, JSON.stringify(g));
  const tile = await page.evaluate(() => {
    const r = document.querySelector('#mod-list .mod-row'); const vis = s => { const e = r.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; };
    return { nome: vis('.mod-name'), sub: vis('.mod-sub'), seta: vis('.mod-arrow'), icone: vis('.mod-icon-box'), subTexto: r.querySelector('.mod-sub').textContent };
  });
  check('cada app: ícone e nome à vista; subtítulo e seta escondidos (mas o subtítulo segue no elemento)',
    tile.nome && tile.icone && !tile.sub && !tile.seta && tile.subTexto.length > 0, JSON.stringify(tile));

  // ── 2. A bolinha ────────────────────────────────────────────────────────────────────
  const bol = await page.evaluate(() => {
    const ler = id => { const e = document.getElementById('badge-' + id); const cs = getComputedStyle(e); const depois = getComputedStyle(e, '::after');
      return { vis: cs.display !== 'none', fundo: cs.backgroundColor, cor: cs.color, n: depois.content.replace(/"/g, ''), txt: e.textContent, title: e.title, aria: e.getAttribute('aria-label'), w: Math.round(e.getBoundingClientRect().width) }; };
    const antes = { guia: ler('guia') };
    setBadge('pedidos', '2 faltas hoje', 'o');
    setBadge('checklist', '90% · Hoje ✓', 'g');
    setBadge('comissoes', 'R$ 439 retido', 'o');
    setBadge('caixa', 'Sem turno hoje', 'x');
    setBadge('utensilios', '1234 peças no controle', 'g');
    setBadge('lojas', 'Online', 'g');
    const r = { pedidos: ler('pedidos'), checklist: ler('checklist'), comissoes: ler('comissoes'), caixa: ler('caixa'), utensilios: ler('utensilios'), lojas: ler('lojas') };
    setBadge('caixa', 'Todas as lojas', 'o');
    r.mestre = ler('caixa');
    // A bolinha fica no canto de cima do ícone.
    const ic = document.getElementById('badge-pedidos').closest('.mod-row').querySelector('.mod-icon-box').getBoundingClientRect();
    const bb = document.getElementById('badge-pedidos').getBoundingClientRect();
    r.canto = bb.left > ic.left + ic.width / 2 && bb.top < ic.top + ic.height / 2;
    return Object.assign(antes, r);
  });
  check('contagem curta vai dentro da bolinha ("2 faltas hoje" → 2), laranja', bol.pedidos.vis && bol.pedidos.n === '2' && /234, 88, 12/.test(bol.pedidos.fundo), JSON.stringify(bol.pedidos));
  check('percentual não vira número ("90% · Hoje ✓" → bolinha verde sem número)', bol.checklist.vis && bol.checklist.n === '' && /21, 128, 61/.test(bol.checklist.fundo), JSON.stringify(bol.checklist));
  check('valor em R$ não vira número ("R$ 439 retido" → bolinha laranja sem número)', bol.comissoes.vis && bol.comissoes.n === '', JSON.stringify(bol.comissoes));
  check('sem dado / sem turno → bolinha cinza', bol.caixa.vis && /100, 116, 139/.test(bol.caixa.fundo), JSON.stringify(bol.caixa));
  check('número grande demais não entra (1234 → sem número)', bol.utensilios.n === '', bol.utensilios.n);
  check('"Online" → bolinha verde', bol.lojas.vis && /21, 128, 61/.test(bol.lojas.fundo));
  check('app sem status (Guia, "⋯") não mostra bolinha', !bol.guia.vis, JSON.stringify(bol.guia));
  check('"Todas as lojas" (mestre sem loja) não é status: sem bolinha', !bol.mestre.vis, JSON.stringify(bol.mestre));
  check('o texto inteiro continua no elemento (texto, title e aria-label)',
    bol.pedidos.txt === '2 faltas hoje' && bol.pedidos.title === '2 faltas hoje' && bol.pedidos.aria === '2 faltas hoje', JSON.stringify(bol.pedidos));
  check('a bolinha fica no canto de cima do ícone, à direita', bol.canto);
  check('a bolinha é pequena (até 24 px com número)', bol.pedidos.w <= 24 && bol.checklist.w <= 18, `${bol.pedidos.w} / ${bol.checklist.w}`);
  const piores = ['pedidos', 'checklist', 'caixa'].map(k => contraste(bol[k].cor, bol[k].fundo));
  check('o número branco lê sobre todas as cores (contraste ≥ 3,5:1)', piores.every(c => c >= 3.5), piores.map(c => c.toFixed(2)).join(' · '));
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await ctx.close();

  // ── 3. Computador: 6 por linha ──────────────────────────────────────────────────────
  const pc = await abrir(browser, 1280);
  g = await grade(pc.page);
  check('computador (1280 px): 6 apps por linha', g.porLinha === 6, JSON.stringify(g));
  await pc.ctx.close();
  // Celular pequeno: continua 4, sem rolar de lado.
  const pq = await abrir(browser, 320);
  g = await grade(pq.page);
  check('celular pequeno (320 px): 4 por linha e sem rolagem de lado', g.porLinha === 4 && !g.larga, JSON.stringify(g));
  await pq.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
