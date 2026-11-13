// "painel de reincidência" — no Painel › Visitas, por loja, o item que reprovou em mais de
// uma visita e quantas vezes seguidas. Item que volta é plano de ação que não foi cumprido.
//
// Prova: a conta (seguidas da mais recente pra trás, total, o que conta como reprovado em
// cada check-list); a busca (90 dias, registros novos + os FECHADOS do app Check-list de
// antes da mudança, filtrados no servidor); quem aparece (sem Maglia; supervisor só vê a
// rota dele); e a tela.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dias = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const sal = (loja, data, itens) => ({ loja, data, tipo: 'salao', dados: { itens, fechada: true } });

const NOVOS = [
  // Bangu: validade da cozinha 8 → 4 → 5 (2 seguidas); banheiros 6 → 9 → 6 (2 de 3, não seguidas)
  sal('Bangu', dias(30), { validade: { val_cozinha: 8 }, visual: { banheiros: 6 } }),
  sal('Bangu', dias(15), { validade: { val_cozinha: 4 }, visual: { banheiros: 9 } }),
  sal('Bangu', dias(2), { validade: { val_cozinha: 5 }, visual: { banheiros: 6, limpeza_geral: 3 } }),
  // Caxias: cozinha NC, NC, NC → 3 seguidas; auditoria NÃO duas vezes, mas a 2ª não finalizada (não conta)
  { loja: 'Caxias', data: dias(20), tipo: 'cozinha', dados: { itens: { ambientes: { pias: 'NC' } } } },
  { loja: 'Caxias', data: dias(10), tipo: 'cozinha', dados: { itens: { ambientes: { pias: 'NC' } } } },
  { loja: 'Caxias', data: dias(1), tipo: 'cozinha', dados: { itens: { ambientes: { pias: 'NC', lixeiras: 'NA' } } } },
  { loja: 'Caxias', data: dias(9), tipo: 'padrao', dados: { prevencao_perdas: { finalizada: true, itens: { 0: { resp: 'NAO' } } } } },
  { loja: 'Caxias', data: dias(3), tipo: 'padrao', dados: { prevencao_perdas: { finalizada: false, itens: { 0: { resp: 'NAO' } } } } },
  // Itaquera: tudo bem duas vezes → aparece em "sem reincidência"
  sal('Itaquera', dias(12), { validade: { val_cozinha: 10 } }),
  sal('Itaquera', dias(4), { validade: { val_cozinha: 9 } }),
  // Maglia: reprova 2x, mas fica fora (regra do projeto)
  sal('Maglia', dias(8), { validade: { val_cozinha: 2 } }),
  sal('Maglia', dias(3), { validade: { val_cozinha: 2 } }),
];
const ANTIGOS = [
  // App Check-list, fechada: Caxias pias NC → 4 seguidas com as novas
  { loja: 'Caxias', data_operacao: dias(40), supervisao: {}, supervisao_cozinha: { itens: { ambientes: { pias: 'NC' } }, fechada: true }, auditorias_padrao: {} },
  // Prevenção de perdas finalizada lá: junta com a nova → 2 seguidas
  { loja: 'Caxias', data_operacao: dias(50), supervisao: {}, supervisao_cozinha: {}, auditorias_padrao: { prevencao_perdas: { finalizada: true, itens: { 0: { resp: 'NAO' } } } } },
  // Largada no meio (não fechada): mesmo que o servidor devolva, não conta
  { loja: 'Bangu', data_operacao: dias(5), supervisao: { itens: { validade: { val_cozinha: 1 } }, notaFinal: 10 }, supervisao_cozinha: {}, auditorias_padrao: {} },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 380, height: 900 } });
  const pedidos = [];
  await ctx.route('**/rest/v1/**', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (/gn_visita_checklist/.test(url)) { pedidos.push(url); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NOVOS) }); }
    if (/checklist_diario/.test(url) && /auditorias_padrao/.test(url)) { pedidos.push(url); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANTIGOS) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _renderVisitasSupContent === 'function' && !!window.GNVck; } catch (e) { return false; } }, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: o painel não carregou'); await browser.close(); process.exit(1); } }
  }
  const existe = await page.evaluate(() => { try { return typeof _vckReincidencia === 'function' && typeof _renderVisReincidenciaTab === 'function'; } catch (e) { return false; } });
  if (!existe) { console.log('FALHOU: o painel de reincidência não existe neste arquivo (contraprova esperada — é novo)'); await browser.close(); process.exit(1); }

  const carregar = (lista) => page.evaluate(async (lista) => {
    LOJAS_LISTA = lista;
    _visReincData = null; _visReincLoja = '';
    let el = document.getElementById('visitas-sup-content');
    if (!el) { el = document.createElement('div'); el.id = 'visitas-sup-content'; document.body.appendChild(el); }
    _setVisSupView('reincidencia');
    for (let i = 0; i < 50 && (!_visReincData || _visReincCarregando); i++) await new Promise(r => setTimeout(r, 50));
    return { d: JSON.parse(JSON.stringify(_visReincData)), t: el.textContent.replace(/\s+/g, ' ') };
  }, lista);

  const todas = await page.evaluate(() => GN_LOJAS.map(l => l.userKey));
  const R = await carregar(todas);
  const acha = (loja, re) => R.d.itens.find(x => x.loja === loja && re.test(x.label));

  // ── A busca ──
  const qNovo = pedidos.find(u => /gn_visita_checklist/.test(u)) || '';
  const qAnt = pedidos.find(u => /checklist_diario/.test(u)) || '';
  check('busca 90 dias de check-lists finalizados', qNovo.includes('data=gte.' + dias(90)) && /finalizada=eq\.true/.test(qNovo), qNovo);
  check('do app Check-list, só o de antes da mudança e só o fechado (filtrado no servidor)',
    /data_operacao=lt\.2026-11-14/.test(qAnt) && /supervisao->>fechada\.eq\.true/.test(qAnt) && /auditorias_padrao\.neq\.\{\}/.test(qAnt), qAnt);

  // ── A conta ──
  const vc = acha('Bangu', /Validades em dia na cozinha/);
  check('salão: nota abaixo de 7 duas visitas seguidas = 2x seguidas', vc && vc.seguidas === 2 && vc.falhas === 2 && vc.avals.length === 3 && vc.critico, vc);
  const bh = acha('Bangu', /banheiros/);
  check('reprovou 2 de 3 sem ser seguido: entra, com 1 seguida', bh && bh.seguidas === 1 && bh.falhas === 2, bh);
  check('reprovou uma vez só: não é reincidência', !acha('Bangu', /Limpeza geral/));
  check('avaliação largada no meio no app Check-list não conta', vc && vc.avals.every(a => a.data !== dias(5)));
  const pias = acha('Caxias', /Pias exclusivas/);
  check('cozinha: não conforme 3x no Painel + 1x no app Check-list = 4x seguidas', pias && pias.seguidas === 4 && pias.falhas === 4, pias);
  check('N/A não entra na conta', !acha('Caxias', /Lixeiras/));
  const cftv = acha('Caxias', /CFTV/);
  check('auditoria: só a finalizada conta (antiga + nova = 2x seguidas)', cftv && cftv.seguidas === 2 && cftv.falhas === 2 && cftv.critico, cftv);
  check('Maglia fica fora (regra do projeto)', !R.d.itens.some(x => x.loja === 'Maglia') && !R.d.lojas.includes('Maglia'));
  check('ordem: maior sequência primeiro', R.d.itens[0] === undefined ? false : R.d.itens[0].seguidas === 4);

  // ── A tela ──
  check('tela mostra as sequências', /4x seguidas/.test(R.t) && /2x seguidas/.test(R.t), R.t.slice(0, 300));
  check('e o "2 de 3" quando não é seguido', /2 de 3/.test(R.t));
  check('loja sem reincidência aparece como em dia', /Sem reincidência: Itaquera/.test(R.t), R.t.slice(-200));
  const filtro = await page.evaluate(() => { _visReincLoja = 'Caxias'; _renderVisitasSupContent(); return document.getElementById('visitas-sup-content').textContent.replace(/\s+/g, ' '); });
  check('filtrar por loja mostra só ela', /Pias exclusivas/.test(filtro) && !/Validades em dia na cozinha/.test(filtro));

  // ── Supervisor com rota ──
  const S = await carregar(['BANGU']);
  check('supervisor só vê a reincidência das lojas da rota dele', S.d.itens.length > 0 && S.d.itens.every(x => x.loja === 'Bangu'), S.d.itens.map(x => x.loja));

  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
