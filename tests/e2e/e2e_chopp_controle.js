// ETAPA 2 (26/11/2026) — Controle do chopp no Painel de Gestão › Barris.
// "Às vezes o barril está pela metade na linha, ainda não foi finalizado, mas o chopp já
//  foi vendido. Não podemos deixar que essa quantidade seja contabilizada como falta."
// Parâmetros do dono: barril 50 L, caneca 350 ml, teórico 143, perda até 10%, meta 128
// canecas por barril (claro e vinho). A conta usa a CONTAGEM (cheio 1 · na linha cheio 1 ·
// metade ½ · abaixo da metade ¼ · vazio 0), não a finalização do barril.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

// Quinta 03/12/2026: semana fechada 23/11 → 30/11 (com vendidos) e acompanhamento 30/11 → 03/12.
const C = (loja, sem, tipo, status, em) => ({ loja_slug: loja, semana_inicio: sem, tipo, status, criado_em: em });
const CONT = [
  // Pedreira claro: 3 cheios + meio na linha (3,5) → chegaram 2 → fica 1 cheio + meio (1,5): usou 4.
  ...['CHEIO', 'CHEIO', 'CHEIO', 'NA_LINHA_METADE'].map(s => C('pedreira', '2026-11-23', 'CLARO', s, '2026-11-23T13:00:00Z')),
  C('pedreira', '2026-11-23', 'VINHO', 'NA_LINHA_METADE', '2026-11-23T13:00:00Z'),
  ...['CHEIO', 'NA_LINHA_METADE', 'VAZIO', 'VAZIO'].map(s => C('pedreira', '2026-11-30', 'CLARO', s, '2026-11-30T13:00:00Z')),
  C('pedreira', '2026-12-03', 'CLARO', 'NA_LINHA_CHEIO', '2026-12-03T13:00:00Z'),
  // Bangu claro: 1 cheio → 1 na linha cheio, sem entrada, mas vendeu ~1 barril: conferir.
  C('bangu', '2026-11-23', 'CLARO', 'CHEIO', '2026-11-23T12:00:00Z'),
  C('bangu', '2026-11-30', 'CLARO', 'NA_LINHA_CHEIO', '2026-11-30T12:00:00Z'),
];
const ENT = [
  { loja_slug: 'pedreira', catalogo_id: null, produto: 'Barril Chopp claro 50 litros', criado_em: '2026-11-25T15:00:00Z' },
  { loja_slug: 'pedreira', catalogo_id: null, produto: 'Barril Chopp claro 50 litros', criado_em: '2026-11-27T15:00:00Z' },
  // Chegou ANTES da contagem de 23/11: já está nela, não pode somar de novo.
  { loja_slug: 'pedreira', catalogo_id: null, produto: 'Barril Chopp claro 50 litros', criado_em: '2026-11-23T10:00:00Z' },
];
const dias7 = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
const VEND = [
  // Pedreira: 4 barris × 44,8 L = 179,2 L de claro na semana (25,6 L/dia) e nada de vinho.
  ...dias7.map(d => ({ loja: 'PEDREIRA', data: d, totais: { chopp_l_claro: 25.6, chopp_l_vinho: 0 } })),
  // Bangu: 44 L na semana, ~0,98 barril.
  ...dias7.map(d => ({ loja: 'BANGU', data: d, totais: { chopp_l_claro: 44 / 7, chopp_l_vinho: 0 } })),
  // Acompanhamento: só segunda e terça lançadas (quarta faltando).
  { loja: 'PEDREIRA', data: '2026-11-30', totais: { chopp_l_claro: 10, chopp_l_vinho: 0 } },
  { loja: 'PEDREIRA', data: '2026-12-01', totais: { chopp_l_claro: 10, chopp_l_vinho: 0 } },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-12-03T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildBarrisSemanalPanel === 'function' && Array.isArray(LOJAS_LISTA); } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  if (!(await page.evaluate(() => !!window.gnChoppControle && typeof _loadChoppControle === 'function'))) {
    console.log('FALHOU: o controle do chopp não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  // ── A conta, pura ─────────────────────────────────────────────────────────────────
  const m = await page.evaluate(() => {
    const G = window.gnChoppControle;
    return {
      eq: G.equivalente(['CHEIO', 'NA_LINHA_CHEIO', 'NA_LINHA_METADE', 'NA_LINHA_ABAIXO_METADE', 'VAZIO']),
      meio: G.fechar({ ini: ['CHEIO', 'CHEIO'], fim: ['NA_LINHA_METADE'], entradas: 0, litros: 1.5 * 44.8, diasVend: 7, diasTotal: 7 }),
      perda: G.fechar({ ini: ['CHEIO', 'CHEIO', 'CHEIO'], fim: [], entradas: 0, litros: 3 * 44.8 * 0.8, diasVend: 7, diasTotal: 7 }),
      leitura: G.fechar({ ini: ['CHEIO', 'CHEIO', 'CHEIO', 'NA_LINHA_METADE'], fim: ['CHEIO', 'CHEIO', 'NA_LINHA_CHEIO'], entradas: 0, litros: 22.05, diasVend: 3, diasTotal: 3 }),
      parcial: G.fechar({ ini: ['CHEIO'], fim: [], entradas: 0, litros: 10, diasVend: 2, diasTotal: 3 }),
      meta: G.CANECAS_META, caneca: G.CANECA_L,
    };
  });
  check('cada barril vale pela contagem: cheio 1 + na linha cheio 1 + metade ½ + abaixo ¼ + vazio 0 = 2,75', m.eq === 2.75, m.eq);
  check('meio barril ainda na linha NÃO vira falta: 2 cheios → ½ na linha, vendeu 1,5 barril = bate (128 canecas/barril)', m.meio.status === 'ok' && m.meio.consumido === 1.5 && m.meio.rendimento === 128, m.meio);
  check('a cada 128 canecas de 350 ml, 1 barril vendido', m.meta === 128 && m.caneca === 0.35);
  check('vendeu 20% menos do que usou → perda (102 canecas/barril, acima dos 10%)', m.perda.status === 'perda' && m.perda.rendimento === 102 && m.perda.perda > 0.1, m.perda);
  check('diferença dentro de ¼ de barril é precisão da contagem, não perda (caso real da Pedreira, 126 canecas)', m.leitura.status === 'ok' && m.leitura.rendimento === 126, m.leitura);
  check('com dia de vendidos faltando não há veredito', m.parcial.status === 'parcial', m.parcial);

  // ── O painel ──────────────────────────────────────────────────────────────────────
  const p = await page.evaluate(async ({ CONT, ENT, VEND }) => {
    const urls = {};
    window.gnFetchJson = async (url, h, c, fb) => {
      urls[c] = url;
      if (c === 'chopp:contagens') return CONT;
      if (c === 'chopp:entradas') return ENT;
      if (c === 'chopp:vendidos') return VEND;
      return fb === undefined ? [] : fb;
    };
    renderDashboard = () => {};
    session = { nome: 'T', cargo: 'mestre', loja: 'GERAL', permissoes: {} };
    LOJAS_LISTA = ['PEDREIRA', 'BANGU'];
    _choppData = null;
    await _loadBarrisSemanalGerencia();
    await _loadChoppControle();
    const el = document.createElement('div'); el.innerHTML = _buildBarrisSemanalPanel(); document.body.appendChild(el);
    const loja = k => { const b = [...el.querySelectorAll('.chopp-loja')].find(x => x.dataset.loja === k); return b ? b.textContent.replace(/\s+/g, ' ') : ''; };
    const out = { urls, ped: loja('PEDREIRA'), ban: loja('BANGU'), temSecao: !!el.querySelector('.chopp-controle'),
      status: [...el.querySelectorAll('.chopp-loja[data-loja="PEDREIRA"] .chopp-cel')].map(x => x.dataset.status),
      dados: JSON.parse(JSON.stringify(_choppData.porLoja.PEDREIRA)) };
    el.remove(); return out;
  }, { CONT, ENT, VEND });
  check('o painel de Barris ganha a seção do controle do chopp', p.temSecao);
  check('semana fechada 23/11 → 30/11 da Pedreira: 3,5 + 2 chegaram − 1,5 = 4 barris usados, 4 vendidos (512 canecas) → bate',
    /Semana fechada 23\/11 → 30\/11/.test(p.ped) && /usados 4 barril \(3,5 \+ 2 chegaram − 1,5\)/.test(p.ped) && /vendidos 4 \(512 canecas\)/.test(p.ped) && p.dados.fechada.CLARO.status === 'ok', { txt: p.ped, d: p.dados.fechada.CLARO });
  check('o barril que chegou ANTES da contagem de segunda não soma de novo (2 entradas, não 3)', p.dados.fechada.CLARO.entradas === 2, p.dados.fechada.CLARO);
  check('vinho: ½ barril usado sem venda nenhuma → perda', p.dados.fechada.VINHO.status === 'perda', p.dados.fechada.VINHO);
  check('…e o texto diz "dentro da meta" com o rendimento (128)', /✓ bate — 128 canecas\/barril, dentro da meta/.test(p.ped), p.ped);
  check('Bangu: vendeu ~1 barril sem barril usado na contagem → "conferir a contagem ou barril que entrou sem registro"', /vendeu 0,98 barril a mais do que usou/.test(p.ban) && /conferir/.test(p.ban), p.ban);
  check('acompanhamento segunda → quinta com quarta sem vendidos: sem veredito ainda', /Acompanhamento 30\/11 → 03\/12/.test(p.ped) && p.dados.acomp.CLARO.status === 'parcial' && /vendidos incompletos/.test(p.ped), p.dados.acomp);
  check('lê as três contagens (seg passada, seg, qui), só chopp; entradas e vendidos desde a segunda passada',
    /semana_inicio=in\.\(2026-11-23,2026-11-30,2026-12-03\)/.test(p.urls['chopp:contagens']) && /tipo=in\.\(CLARO,VINHO\)/.test(p.urls['chopp:contagens'])
    && /criado_em=gte\.2026-11-23/.test(p.urls['chopp:entradas']) && /data=gte\.2026-11-23&data=lte\.2026-12-02/.test(p.urls['chopp:vendidos']), p.urls);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
