// Aba Dados, fase 3 (12/11/2026): a lista de funcionários.
//
// Medido em Campo Grande (16 pessoas, 390 px): o cartão tinha 1.667 px, ~93 px por pessoa, e
// os 16 nomes saíam cortados ("Adysson C", "Fabio de A") porque o campo do nome dividia a
// linha com até cinco selos. Agora o nome ocupa a primeira linha inteira e os selos descem
// pra segunda; o setor (amarelo-claro sobre branco, ~1,3:1) ficou legível; e entrou um
// filtro por setor.
//
// A lista é onde a loja lança falta, folga e horário — o que vira pagamento. Esta suíte cobra
// primeiro o que NÃO pode mudar:
//   1. o nome continua sendo o campo editável da própria linha, e cada linha continua
//      apontando pra SUA pessoa (índice) em todos os handlers;
//   2. o filtro só esconde linhas da tela: não mexe em comissoesWD nem dispara salvamento;
//   3. vaga recém-criada e card aberto nunca somem por causa do filtro;
//   4. quem rola até uma linha escondida pelo filtro (completar cadastro) tira o filtro;
//   5. setor legível, 320 px sem rolagem de lado, e o cartão ficou menor.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const PESSOAS = [['Zuleica Alves', 'Salão'], ['Adysson Oliveira Bringel', 'Salão'], ['Driele Silva de Mello', 'Cozinha'],
  ['Fabio Santos Barbosa', 'Cozinha'], ['Israel Silva dos Santos', 'Sub Gerente'], ['Maria Francisca Silva', 'Salão'], ['Luiz Claudio da Costa Salviano Silva', 'Estoque']];
const mk = ([nome, setor], i) => ({ id: i, nome, setor, tipo: 'CLT / MENSALISTA', turno: 'NOITE', horario: '16:00-00:00',
  inicio_contrato: '2025-01-01', dias: i === 2 ? ['FALTA', 'PRESENTE', 'PRESENTE', 'FOLGA', 'PRESENTE', 'PRESENTE', 'PRESENTE'] : Array(7).fill('PRESENTE'), turnos: Array(7).fill(null) });

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-11T15:00:00');
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); localStorage.setItem('gn_chk_dados_grupos', JSON.stringify({ equipe: true })); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try { return typeof renderComissoesFuncs === 'function' && typeof _funcFiltroAplicar === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  const vazias = Array.from({ length: 10 }, (_, k) => ({ id: 7 + k, nome: '', tipo: 'CLT / MENSALISTA', dias: Array(7).fill('PRESENTE') }));
  await page.evaluate(({ funcs }) => {
    hideLogin(); LOJA = 'Campo Grande'; state.data = '2026-11-11';
    usuarioLogado = { id: 1, nome: 'Thalyta', cargo: 'sub_gerente', loja: 'CAMPO GRANDE' };
    document.querySelectorAll('body > div').forEach(d => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && parseInt(cs.zIndex) >= 900) d.style.display = 'none'; });
    initAllStates(); restoreUI();
    comissoesLoadErr = false; comissoesWeekIdx = 44;
    comissoesWD = { brutos: Array(7).fill(0), funcs, dist: 'SIM' };
    comissoesVisibleSlots = {}; comissoesExpanded = {};
    funcs.forEach((f, i) => { if (f.nome) comissoesVisibleSlots[i] = true; });
    window.__ops = 0; const orig = scheduleComissoesOp; scheduleComissoesOp = m => { window.__ops++; };
    renderComissoesFuncs();
  }, { funcs: PESSOAS.map(mk).concat(vazias) });

  // ══ 1. Nome editável na linha, cada linha da sua pessoa ═══════════════════════════
  const linhas = await page.evaluate(() => [...document.querySelectorAll('#func-lista > .cf-card')].map(el => {
    const inp = el.querySelector('.cf-linha > input.cf-nome');
    const idxs = new Set([...(el.innerHTML || '').matchAll(/\b(?:upd\w*|toggle\w*|remove\w*)\((\d+)\s*[,)]/g)].map(m => +m[1]));
    return { id: el.id, nome: inp ? inp.value : null, editavel: !!inp && !inp.readOnly && !inp.disabled, blur: inp ? inp.getAttribute('onblur') : '', idxs: [...idxs] };
  }));
  check('cada linha continua com o campo do nome, editável, na própria linha', linhas.length === 7 && linhas.every(l => l.editavel), JSON.stringify(linhas.map(l => [l.nome, l.editavel])));
  check('cada linha aponta pra uma pessoa só, a dela (índice = o do id cf-N)',
    linhas.every(l => l.idxs.length === 1 && l.id === 'cf-' + l.idxs[0] && new RegExp('updComissoesNome\\(' + l.idxs[0] + ',').test(l.blur)), JSON.stringify(linhas.map(l => [l.id, l.idxs])));
  check('a ordem continua alfabética', JSON.stringify(linhas.map(l => l.nome)) === JSON.stringify(PESSOAS.map(p => p[0]).sort((a, b) => a.localeCompare(b, 'pt-BR'))), linhas.map(l => l.nome).join(' | '));
  const ren = await page.evaluate(() => { const inp = document.querySelector('#cf-1 .cf-nome'); inp.focus(); inp.value = 'Adysson Bringel'; inp.blur(); return comissoesWD.funcs[1].nome; });
  check('editar o nome na linha grava na pessoa certa', ren === 'Adysson Bringel', ren);
  const cortados = await page.evaluate(() => [...document.querySelectorAll('#func-lista .cf-nome')].filter(i => i.scrollWidth > i.clientWidth + 1).map(i => i.value));
  check('em 320 px, nome comum não sai cortado (só o muito longo)', cortados.length <= 1 && cortados.every(n => /Luiz Claudio/.test(n)), cortados.join(' | '));

  // ══ 2. Filtro ═════════════════════════════════════════════════════════════════════
  const chips = await page.evaluate(() => [...document.querySelectorAll('#func-filtro .func-filtro-chip')].map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  check('o filtro mostra Todos e cada setor com a contagem, do maior pro menor', JSON.stringify(chips) === JSON.stringify(['Todos 7', 'Salão 3', 'Cozinha 2', 'Estoque 1', 'Sub Gerente 1']), JSON.stringify(chips));
  const antes = await page.evaluate(() => JSON.stringify(comissoesWD));
  const f1 = await page.evaluate(() => { _funcFiltroEscolher('Cozinha'); return [...document.querySelectorAll('#func-lista > .cf-card')].filter(e => e.style.display !== 'none').map(e => e.querySelector('.cf-nome').value); });
  check('escolher Cozinha mostra só quem é da cozinha', JSON.stringify(f1) === JSON.stringify(['Driele Silva de Mello', 'Fabio Santos Barbosa']), JSON.stringify(f1));
  check('o chip escolhido fica marcado', await page.evaluate(() => { const a = document.querySelector('.func-filtro-chip.ativo'); return !!a && /Cozinha/.test(a.textContent) && a.getAttribute('aria-pressed') === 'true'; }));
  check('o filtro não mexe nos dados nem dispara salvamento', await page.evaluate(a => JSON.stringify(comissoesWD) === a && window.__ops === 1, antes));
  const re = await page.evaluate(() => { renderComissoesFuncs(); return [...document.querySelectorAll('#func-lista > .cf-card')].filter(e => e.style.display !== 'none').length; });
  check('o filtro continua valendo depois de a lista se redesenhar (sync, edição)', re === 2, re);
  const tg = await page.evaluate(() => { _funcFiltroEscolher('Cozinha'); return [...document.querySelectorAll('#func-lista > .cf-card')].filter(e => e.style.display !== 'none').length; });
  check('tocar de novo no mesmo setor volta pra Todos', tg === 7, tg);

  // ══ 3. Vaga nova e card aberto nunca somem ════════════════════════════════════════
  const nova = await page.evaluate(() => { _funcFiltroEscolher('Salão'); addComissoesFunc();
    const idx = comissoesWD.funcs.findIndex((f, i) => comissoesVisibleSlots[i] && !f.nome.trim());
    const el = document.getElementById('cf-' + idx); return { idx, visivel: !!el && el.style.display !== 'none' }; });
  check('"+ Adicionar" com filtro ligado: a vaga nova aparece', nova.visivel, JSON.stringify(nova));
  const aberto = await page.evaluate(() => { comissoesExpanded[2] = true; _funcFiltroSetor = 'Estoque'; renderComissoesFuncs(); return document.getElementById('cf-2').style.display !== 'none'; });
  check('card aberto continua na tela mesmo fora do setor filtrado', aberto);

  // ══ 4. Rolar até linha escondida tira o filtro ════════════════════════════════════
  const rola = await page.evaluate(() => { comissoesExpanded = {}; _funcFiltroSetor = 'Estoque'; renderComissoesFuncs();
    const alvo = document.getElementById('cf-3'); const antes = alvo.style.display; alvo.scrollIntoView({ block: 'center' });
    return { antes, depois: document.getElementById('cf-3').style.display, filtro: _funcFiltroSetor }; });
  check('completar cadastro de alguém escondido pelo filtro tira o filtro e mostra a pessoa', rola.antes === 'none' && rola.depois === '' && rola.filtro === '', JSON.stringify(rola));

  // ══ 5. Legível, sem rolagem lateral, um setor só ══════════════════════════════════
  const contraste = await page.evaluate(() => {
    const num = c => (String(c).match(/[\d.]+/g) || []).map(Number);
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    const el = document.querySelector('.cf-setor'); const cs = getComputedStyle(el);
    const a = lum(num(cs.color)), b = lum(num(cs.backgroundColor)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); });
  check('o setor na linha é legível (≥ 4,5:1)', contraste >= 4.5, contraste.toFixed(2));
  check('sem rolagem de lado em 320 px (o filtro rola dentro dele)', await page.evaluate(() => document.documentElement.scrollWidth <= 320), await page.evaluate(() => document.documentElement.scrollWidth));
  const um = await page.evaluate(() => { comissoesWD.funcs.forEach(f => { if (f.nome) f.setor = 'Salão'; }); _funcFiltroSetor = ''; renderComissoesFuncs();
    const b = document.getElementById('func-filtro'); return { vis: b.style.display, chips: b.children.length }; });
  check('com um setor só, o filtro nem aparece', um.vis === 'none' && um.chips === 0, JSON.stringify(um));
  await page.setViewportSize({ width: 390, height: 800 });
  const alt = await page.evaluate(() => { const ls = [...document.querySelectorAll('#func-lista > .cf-card')].filter(e => e.style.display !== 'none');
    return Math.round(ls.reduce((s, e) => s + e.getBoundingClientRect().height, 0) / ls.length); });
  check('em 390 px cada pessoa ocupa até 80 px (eram ~93)', alt <= 80, alt);

  check('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
