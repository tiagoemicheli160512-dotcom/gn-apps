// "No painel de gestão, na aba visita, ao selecionar a loja da visita, ter um panorama da
//  loja [...] muito cancelamento, muitas notas sem 10%, algo assim [...] ao selecionar a
//  visita ter a visão de onde agir lá já." (15/11/2026)
//
// 🎯 Onde agir: posição da loja na rede (últimos 30 dias) em cada indicador, semáforo pelo
// terço, o pior primeiro, o que está bem recolhido, e "leve pra conversa".
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

// 11 lojas, faturamento 100 mil cada (um dia). Bangu é a pior em nota sem 10% e em
// cancelamento; a melhor em transferência (nenhuma).
const LOJAS = ['BANGU', 'CAXIAS', 'SAO_GONCALO', 'NORTE SHOPPING', 'BOULEVARD', 'RANCHO', 'PEDREIRA', 'Nova América', 'CAMPO GRANDE', 'ITAQUERA', 'GUARULHOS'];
const FAT = LOJAS.map(l => ({ loja: l, data_operacao: '2026-11-10', venda_salao: 100000, venda_delivery: 0 }));
const canc = (n, v, quem) => Array.from({ length: n }, () => ({ valor: v, autorizado_por: quem }));
const FECH = LOJAS.map((l, i) => ({
  loja: l, data: '2026-11-10', status: 'FECHADO', sem_cancelamento_por: null, sem_nota10_por: null,
  gn_caixa_cancelamento: l === 'BANGU' ? canc(8, 300, 'Carol').concat(canc(3, 200, 'Fernando')) : canc(1, 100 + i * 10, 'X'),
  gn_caixa_gorjeta: l === 'BANGU' ? Array.from({ length: 37 }, (_, j) => ({ valor: 180, garcom: j < 21 ? 'Júlio' : 'Ana' })) : [{ valor: 100 + i * 50, garcom: 'Y' }],
  gn_caixa_transferencia: l === 'BANGU' ? [] : Array.from({ length: i }, () => ({ id: 't', autorizado_por: 'Z' })),
}));
// MAGLIA também tem caixa — não pode entrar na rede.
FECH.push({ loja: 'MAGLIA', data: '2026-11-10', status: 'FECHADO', gn_caixa_cancelamento: canc(50, 1000, 'M'), gn_caixa_gorjeta: [], gn_caixa_transferencia: [] });
const TRIOS = [
  { data: '2026-11-07', loja: 'bangu', cache: 800, couver_valor: 1400, couver_lancado_em: '2026-11-07T23:00:00Z', presenca_confirmada: true, banda_nao_veio: false, horario_inicio: '13:00' },
  { data: '2026-11-07', loja: 'caxias', cache: 800, couver_valor: 500, couver_lancado_em: '2026-11-07T23:00:00Z', presenca_confirmada: true, banda_nao_veio: false, horario_inicio: '13:00' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-15T10:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', 'LOJAS_TODAS'], ['_vckBotoesHtml', '_triosAgregar'], 25000); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _ondeAgirAbrir === 'function'))) {
    console.log('FALHOU: o painel "Onde agir" não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const abrir = (loja, falhar) => page.evaluate(async ({ loja, FAT, FECH, TRIOS, falhar }) => {
    const urls = [];
    window.gnFetchJson = async (url) => {
      urls.push(url);
      if (/checklist_diario/.test(url)) return FAT;
      if (/gn_caixa_fechamento/.test(url)) return FECH;
      if (/gn_trios_agenda/.test(url)) return falhar === 'trios' ? null : TRIOS;
      return null;   // escala e visitas não carregam neste teste: o painel segue sem elas
    };
    _ondeAgirCache = null;
    document.getElementById('_onde-agir-modal')?.remove();
    await _ondeAgirAbrir(loja);
    const m = document.getElementById('_onde-agir-modal');
    const linhas = m ? [...m.querySelectorAll('.onde-agir-linha')].map(e => ({ id: e.dataset.id, sem: e.dataset.sem, txt: e.textContent.replace(/\s+/g, ' ').trim(), visivel: !e.closest('details') })) : [];
    return { aberto: !!m, z: m ? getComputedStyle(m).zIndex : null, txt: m ? m.textContent.replace(/\s+/g, ' ') : '', linhas, urls };
  }, { loja, FAT, FECH, TRIOS, falhar });

  const r = await abrir('BANGU');
  check('abre o painel "Onde agir" da loja, acima da tela de Visitas (z-index 100050)', r.aberto && r.z === '100050' && /Bangu · onde agir/.test(r.txt), r.txt.slice(0, 200));
  check('período: últimos 30 dias (17/10 a 15/11, contando hoje), contra as 11 lojas da rede', /Últimos 30 dias \(17\/10 a 15\/11\)/.test(r.txt) && /entre as 11 lojas/.test(r.txt), r.txt.slice(0, 300));
  const cancel = r.linhas.find(l => l.id === 'cancel'), sem10 = r.linhas.find(l => l.id === 'sem10'), transf = r.linhas.find(l => l.id === 'transf');
  check('nota sem 10%: Bangu R$ 666,00 perdidos (37 notas), 11º de 11, vermelho', sem10 && sem10.sem === 'vermelho' && /R\$\s?666,00/.test(sem10.txt) && /37 notas/.test(sem10.txt) && /11º de 11/.test(sem10.txt), sem10);
  check('cancelamento: 3,00% do faturamento, 11º de 11, vermelho — a Maglia não entra na conta', cancel && cancel.sem === 'vermelho' && /3,00%/.test(cancel.txt) && /11º de 11/.test(cancel.txt), cancel);
  check('"leve pra conversa": quem mais autorizou (Carol 8, Fernando 3) e os garçons (Júlio 21, Ana 16)',
    /quem mais autorizou: Carol 8, Fernando 3/.test(cancel.txt) && /garçons com mais notas: Júlio 21, Ana 16/.test(sem10.txt), [cancel.txt, sem10.txt]);
  check('o pior vem primeiro (vermelhos no topo)', r.linhas[0].sem === 'vermelho' && r.linhas[1].sem === 'vermelho', r.linhas.map(l => l.id + ':' + l.sem));
  check('o que está bem (transferência: 0, 1º) fica recolhido em "Tudo certo em"', transf && transf.sem === 'verde' && !transf.visivel && /Tudo certo em: Transferências/.test(r.txt), transf);
  check('couvert do fim de semana fechado (+R$ 600, 1º de 2)', r.linhas.some(l => l.id === 'couver' && /\+R\$\s?600,00/.test(l.txt) && /1º de 2/.test(l.txt)), r.linhas.find(l => l.id === 'couver'));
  check('o que não carregou (escala, visitas) é dito, não fingido', /Não carregou agora: escala, visitas/.test(r.txt), r.txt.slice(-300));
  check('uma leitura da rede só (sem consulta por loja)', r.urls.filter(u => /gn_caixa_fechamento/.test(u)).length === 1 && !r.urls.some(u => /loja=eq/.test(u)), r.urls);

  // Loja com tudo bem em cancelamento: Caxias (o segundo menor cancelamento).
  const c = await abrir('CAXIAS');
  const cc = c.linhas.find(l => l.id === 'cancel');
  check('Caxias: cancelamento no terço de cima fica verde, recolhido', cc && cc.sem === 'verde' && !cc.visivel, cc);

  // Trios fora do ar: o resto aparece.
  const f = await abrir('BANGU', 'trios');
  check('trios não carregou: some só o couvert, o resto do painel continua', f.linhas.some(l => l.id === 'sem10') && !f.linhas.some(l => l.id === 'couver') && /Não carregou agora: trios/.test(f.txt), f.linhas.map(l => l.id));

  // Maglia: fora (CLAUDE.md).
  const mg = await page.evaluate(() => ({ botao: _ondeAgirBotaoHtml('MAGLIA', 'x()'), botaoBangu: _ondeAgirBotaoHtml('BANGU', 'x()') }));
  const mgAbre = await abrir('MAGLIA');
  check('Maglia não tem o botão nem abre o painel; Bangu tem', mg.botao === '' && /Onde agir nesta loja/.test(mg.botaoBangu) && !mgAbre.aberto, mg);

  // Entradas: card da visita e "Registrar chegada".
  const ent = await page.evaluate(() => {
    window.GNVck = window.GNVck || {};
    const card = _vckBotoesHtml({ id: 'v1', loja: 'Bangu', data: '2026-11-15', tipo_visita: 'checklist' });
    return { card: /_ondeAgirAbrir\('Bangu'\)/.test(card), destino: typeof _ondeAgirDoDestino === 'function' };
  }).catch(e => ({ erro: String(e) }));
  check('o card da visita tem o botão "🎯 Onde agir nesta loja"', ent.card === true, ent);
  check('o "Registrar chegada" abre pela loja escolhida no Destino', ent.destino === true, ent);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
