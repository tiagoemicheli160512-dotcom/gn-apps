// Acompanhamento diário de carnes e bebidas (25–26/11/2026).
// "Painel de Gestão (acompanhamento gerencial) e App Lojas Home (gerentes e subgerentes da
//  própria unidade)." — a "home das lojas" é a Home da loja no Painel (print do dono, 26/11). Mesmas informações nos dois ambientes; estoque inicial, entradas,
//  saídas e saldo; fechamento após a segunda contagem; faltas e sobras visíveis; sem
//  lançamento. Os dois ambientes consultam a mesma base." + "num olhar".
// O banco é o mesmo nos dois apps (gnFetchJson simulado por nome de consulta), e a prova
// principal é que as duas telas mostram os MESMOS quadradinhos.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };

// Semana de 23/11 (seg) — hoje quinta 26/11, 14h.
const AGORA = '2026-11-26T14:00:00';
const BANCO_JS = `
  const CAT_CS = 'cat-cs-rj', CAT_LATA = 'cat-lata';
  const carnesPed = { carne_sol: { inicial: 50, ter: 40, qua: 42, ent_ter: 10 }, picanha: { inicial: 20, ter: 17, qua: 15.2 }, carne_seca: { inicial: 10, ter: 10 }, camarao: { inicial: 8, ter: 4, qua: 4 } };
  const tot = (cs, pc, cam) => ({ carne_sol: cs, picanha: pc, carne_seca: 0, camarao: cam, coca_un: 10, chopp_l_claro: 0, chopp_l_vinho: 0 });
  window.__BANCO = {
    'acomp:carnes': [{ loja: 'Pedreira', semana_inicio: '2026-11-23', carnes: carnesPed, updated_at: '2026-11-25T14:00:00Z' }],
    'acomp:vendidos': [
      { loja: 'PEDREIRA', data: '2026-11-23', totais: tot(10, 3, 4), itens: { coca_lata: { q: 10 } } },
      { loja: 'PEDREIRA', data: '2026-11-24', totais: tot(6, 1.8, 0), itens: { coca_lata: { q: 10 } } },
      { loja: 'PEDREIRA', data: '2026-11-25', totais: tot(5, 1, 0), itens: { coca_lata: { q: 10 } } },
    ],
    'acomp:rodizio': [],
    'acomp:cadastro': [{ id: 'coca_lata', grupo: 'coca', nome: 'Coca-Cola lata 350 ml', item_estoque: 37, ativo: true }],
    'acomp:choppCont': [], 'acomp:choppEnt': [],
    'acomp:carnesCat': [{ id: CAT_CS, item_id: 207, origem_item_id: null, regiao: 'RJ' }],
    'acomp:carnesRec': [],
    'acomp:estoqueCat': [{ id: CAT_LATA, item_id: 37, origem_item_id: null, und_por_caixa: 12 }],
    'acomp:estoqueCont': [{ loja_slug: 'pedreira', catalogo_id: CAT_LATA, atual: 100, data_contagem: '2026-11-23', criado_em: '2026-11-23T13:00:00Z' }],
    'acomp:estoqueRec': [], 'acomp:estoquePend': [],
  };
  window.gnFetchJson = async (url, h, nome, fb) => { (window.__CONSULTAS = window.__CONSULTAS || []).push(nome); return nome in window.__BANCO ? JSON.parse(JSON.stringify(window.__BANCO[nome])) : (fb === undefined ? [] : fb); };
`;

async function abrir(browser, arq, pronto, semCdn) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, AGORA);
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  if (semCdn) await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  page.__erros = []; page.on('pageerror', e => page.__erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + arq);
    try { await page.waitForFunction(pronto, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('não carregou: ' + arq); }
  }
  return { ctx, page };
}
const lerGrade = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel + ' .acomp-cel')].map(b => ({ k: b.dataset.k, i: +b.dataset.i, st: b.dataset.status, t: b.innerText.replace(/\s+/g, ' ').trim() })), sel);

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const erros = [];

  // ── Painel ──
  let { ctx, page } = await abrir(browser, HOME, () => { try { return typeof renderDashboard === 'function'; } catch (e) { return false; } });
  if (!(await page.evaluate(() => !!window.gnAcomp && typeof _buildAcompPanel === 'function'))) {
    console.log('FALHOU: a aba de acompanhamento não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  await page.evaluate(BANCO_JS);
  const painel = await page.evaluate(async () => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    _setDashTab('acomp');
    for (let i = 0; i < 40 && !document.querySelector('#acomp-painel .acomp-cel'); i++) await new Promise(r => setTimeout(r, 100));
    const grupo = (document.querySelector('.dash-grupo.on') || {}).dataset || {};
    const nLojas = new Set([...document.querySelectorAll('#acomp-painel .acomp-cel')].map(b => b.dataset.k)).size;
    // Redesenho do Painel não recarrega do banco nem perde o bloco.
    const antes = (window.__CONSULTAS || []).length;
    renderDashboard(); await new Promise(r => setTimeout(r, 300));
    const depois = (window.__CONSULTAS || []).length;
    return { grupo: grupo.grupo, nLojas, recarregou: depois !== antes, aindaLa: !!document.querySelector('#acomp-painel .acomp-cel'),
      // As caixinhas de lojas do relatório (26/11) só escolhem o que entra no WhatsApp/PDF — não
      // alteram dado nenhum; qualquer outro campo continua proibido.
      semInput: !document.querySelector('#acomp-painel input:not(.acomp-rel-loja), #acomp-painel select, #acomp-painel textarea') };
  });
  check('Painel › Operação › 📊 Acompanhamento: grade com as 11 lojas (Maglia fora)', painel.grupo === 'operacao' && painel.nLojas === 11, painel);
  check('só consulta: nenhum campo editável', painel.semInput);
  check('redesenho do Painel não vai ao banco de novo nem apaga a grade', !painel.recarregou && painel.aindaLa, painel);
  const gP = (await lerGrade(page, '#acomp-painel')).filter(c => c.k === 'PEDREIRA');
  const cel = (g, i) => g.find(c => c.i === i) || {};
  // Carne de sol: seg 50 → ter esperado 50 − 10 vendidos = 40, contou 40 ✓; qua: 40 + 10 que chegou
  // na terça menos 6% da salga (9,4) − 6 vendidos = 43,4, contou 42 → −1,4.
  check('carne de sol: falta de 1,4 kg na quarta (40 + 9,4 que chegou, já sem a salga − 6 vendidos = 43,4; contou 42) → vermelho "−1,4 kg"', cel(gP, 0).st === 'falta' && /−1,4 kg/.test(cel(gP, 0).t), cel(gP, 0));
  // Picanha: ter 20−3=17 ✓; qua 17−1,8=15,2 ✓.
  check('picanha batendo nos dois dias → verde ✓', cel(gP, 1).st === 'ok' && /✓/.test(cel(gP, 1).t), cel(gP, 1));
  // Camarão: ter 8−4=4 ✓ ; qua 4−0=4 ✓.
  check('camarão batendo → ✓; carne seca sem vendidos de terça → cinza (não vira falta)', cel(gP, 3).st === 'ok' && cel(gP, 2).st !== 'falta', [cel(gP, 2), cel(gP, 3)]);
  check('Coca na semana em curso: "em curso" (fecha na segunda, com a contagem nova)', cel(gP, 6).st === 'futuro' && /em curso/.test(cel(gP, 6).t), cel(gP, 6));
  check('loja sem lançamento nenhum aparece cinza (sem dado), nunca como falta', (await lerGrade(page, '#acomp-painel')).filter(c => c.k === 'BANGU').every(c => c.st === 'sem_dado' || c.st === 'futuro'));
  // Detalhe do quadradinho.
  const det = await page.evaluate(async () => {
    document.querySelector('#acomp-painel .acomp-cel[data-k="PEDREIRA"][data-i="0"]').click();
    await new Promise(r => setTimeout(r, 100));
    const d = document.querySelector('#acomp-painel .acomp-detalhe');
    return { t: d.innerText.replace(/\s+/g, ' '), linhas: [...d.querySelectorAll('tr[data-status]')].map(tr => tr.dataset.status) };
  });
  check('toque abre o dia a dia: estoque inicial, anterior, entrou, vendido, teórico, físico, diferença',
    /Estoque inicial \(contagem de segunda\): 50,0 kg/.test(det.t) && /Anterior Entrou Vendido Teórico Físico Diferença/.test(det.t) && /Qua 40,0 \+9,4 −6,0 43,4 42,0 −1,4/.test(det.t), det.t);
  check('dias que ainda não chegaram ficam em branco (·), não "sem dado"', det.linhas.filter(s => s === 'futuro').length === 4 && det.linhas[0] === 'ok' && det.linhas[1] === 'falta', det.linhas);

  // ── Home da loja no Painel (a "home das lojas" — print do dono, 26/11) ──
  const home = (cargo, lojaK, mestre) => page.evaluate(async ({ cargo, lojaK, mestre }) => {
    const sess = mestre ? { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true }, ts: Date.now() }
                        : { id: 7, nome: 'Ana', cargo, loja: lojaK, permissoes: {}, ts: Date.now() };
    session = sess; masterLoja = mestre ? lojaK : '';
    try { showHome(sess); } catch (e) { window.__errShow = String(e); }
    for (let i = 0; i < 40 && !document.querySelector('#acomp-home-loja .acomp-cel'); i++) await new Promise(r => setTimeout(r, 100));
    const el = document.getElementById('acomp-home-loja');
    return { tem: !!el && el.style.display !== 'none' && !!el.querySelector('.acomp-cel'), uma: !!(el && el.querySelector('.acomp-uma')),
      lojas: el ? [...new Set([...el.querySelectorAll('.acomp-cel')].map(b => b.dataset.k))] : [],
      depoisDoResultado: !!el && !!document.getElementById('home-sec-resultado') && !!(document.getElementById('home-sec-resultado').compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) };
  }, { cargo, lojaK, mestre });
  const ger = await home('gerente', 'PEDREIRA');
  check('Home da loja (Painel), gerente: o acompanhamento só da própria loja, em quadrados que cabem na tela, logo depois de "Como a loja está"', ger.tem && ger.uma && ger.lojas.join() === 'PEDREIRA' && ger.depoisDoResultado, ger);
  const gL = await lerGrade(page, '#acomp-home-loja');
  check('MESMOS quadradinhos da aba Operação › Acompanhamento (mesma leitura, mesma conta)', JSON.stringify(gL.map(c => [c.i, c.st])) === JSON.stringify(gP.map(c => [c.i, c.st])) &&
    gL.every(c => { const p = cel(gP, c.i); return c.t.replace(/^\S+ /, '').includes(p.t.split(' ')[0]); }), { home: gL, painel: gP });
  check('sub-gerente também vê', (await home('sub_gerente', 'PEDREIRA')).tem);
  check('mestre navegando na loja também vê (a da loja escolhida)', (await home(null, 'PEDREIRA', true)).lojas.join() === 'PEDREIRA');
  const est = await home('estoquista', 'PEDREIRA');
  check('estoquista não vê (pedido: gerentes e subgerentes)', !est.tem, est);
  const mag = await home('gerente', 'MAGLIA');
  check('Maglia não tem o acompanhamento (não foi citada)', !mag.tem, mag);
  erros.push(...page.__erros); await ctx.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
