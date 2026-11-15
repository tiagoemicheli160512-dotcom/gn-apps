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
  // Bangu: "Júlio" digitado de 3 jeitos (15 + 4 + 2 = 21) — tem que contar como uma pessoa.
  gn_caixa_gorjeta: l === 'BANGU' ? Array.from({ length: 37 }, (_, j) => ({ valor: 180, garcom: j < 15 ? 'Júlio' : j < 19 ? 'julio' : j < 21 ? ' JÚLIO ' : 'Ana' })) : [{ valor: 100 + i * 50, garcom: 'Y' }],
  gn_caixa_transferencia: l === 'BANGU' ? [] : Array.from({ length: i }, () => ({ id: 't', autorizado_por: 'Z' })),
  // Extra (pedido de 15/11: "também o valor de extras pago"). Bangu R$ 2.500 (2,5% da venda):
  // Talita 4x, 1 sem nome, e 1 lançado em "Outros" como "dobra Talita" (conta, como na aba
  // Extra); "mercado" em Outros não conta. As outras lojas, R$ 100 a R$ 1.100.
  gn_caixa_despesa: l === 'BANGU'
    ? [1, 2, 3].map(() => ({ categoria: 'funcionario_extra', valor: 400, nome: 'Talita', justificativa: 'cobriu falta no salão' }))
        .concat([{ categoria: 'funcionario_extra', valor: 500, nome: '', justificativa: 'reforço sábado' },
                 { categoria: 'outros', valor: 800, nome: 'dobra Talita', justificativa: 'dobra no domingo' },
                 { categoria: 'outros', valor: 300, nome: 'mercado', justificativa: 'compra de gelo' }])
    : [{ categoria: 'funcionario_extra', valor: 100 + i * 100, nome: 'W', justificativa: 'reforço do turno' }],
}));
// MAGLIA também tem caixa — não pode entrar na rede.
FECH.push({ loja: 'MAGLIA', data: '2026-11-10', status: 'FECHADO', gn_caixa_cancelamento: canc(50, 1000, 'M'), gn_caixa_gorjeta: [], gn_caixa_transferencia: [] });
// Banco de horas (pedido de 15/11: "queria ter a visão também do valor do banco de horas").
// Ciclo como o real do Bangu (CONFIG 26/03–25/09 → vigente 26/09–25/03). Bangu −40h +10h,
// Caxias −2h, Pedreira −10h +5h. Sem a escala carregada, a régua é o total de horas.
const cfgBH = { periodo_inicio: '2026-03-26', periodo_fim: '2026-09-25', salariosSetor: { 'Salão': 1620 } };
const BANCO = [
  { loja: 'Bangu', mes: 'CONFIG', registros: cfgBH },
  { loja: 'Bangu', mes: '2026-10', registros: [{ nome: 'ALEX SANDRO', horas: -30 }, { nome: 'ROSELI Martins', horas: 10 }] },
  { loja: 'Bangu', mes: '2026-11', registros: [{ nome: 'THAYNÁ LIMA', horas: -10 }] },
  { loja: 'Caxias', mes: 'CONFIG', registros: cfgBH },
  { loja: 'Caxias', mes: '2026-10', registros: [{ nome: 'FULANO', horas: -2 }] },
  { loja: 'Pedreira', mes: 'CONFIG', registros: cfgBH },
  { loja: 'Pedreira', mes: '2026-10', registros: [{ nome: 'BELTRANO', horas: -10 }, { nome: 'CICRANO', horas: 5 }] },
];
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

  const abrir = (loja, falhar) => page.evaluate(async ({ loja, FAT, FECH, TRIOS, BANCO, falhar }) => {
    const urls = [];
    window.gnFetchJson = async (url) => {
      urls.push(url);
      if (/checklist_diario/.test(url)) return FAT;
      if (/gn_caixa_fechamento/.test(url)) return FECH;
      if (/gn_trios_agenda/.test(url)) return falhar === 'trios' ? null : TRIOS;
      if (/gn_banco_horas/.test(url)) return falhar === 'banco' ? null : BANCO;
      if (/gn_comissoes\?loja=eq/.test(url)) return [];   // escala completa da loja aberta (R$ exato)
      return null;   // escala e visitas não carregam neste teste: o painel segue sem elas
    };
    _ondeAgirCache = null;
    document.getElementById('_onde-agir-modal')?.remove();
    await _ondeAgirAbrir(loja);
    const m = document.getElementById('_onde-agir-modal');
    const linhas = m ? [...m.querySelectorAll('.onde-agir-linha')].map(e => ({ id: e.dataset.id, sem: e.dataset.sem, txt: e.textContent.replace(/\s+/g, ' ').trim(), visivel: !e.closest('details') })) : [];
    return { aberto: !!m, z: m ? getComputedStyle(m).zIndex : null, txt: m ? m.textContent.replace(/\s+/g, ' ') : '', linhas, urls };
  }, { loja, FAT, FECH, TRIOS, BANCO, falhar });

  const r = await abrir('BANGU');
  check('abre o painel "Onde agir" da loja, acima da tela de Visitas (z-index 100050)', r.aberto && r.z === '100050' && /Bangu · onde agir/.test(r.txt), r.txt.slice(0, 200));
  check('período: últimos 30 dias (17/10 a 15/11, contando hoje), contra as 11 lojas da rede', /Últimos 30 dias \(17\/10 a 15\/11\)/.test(r.txt) && /entre as 11 lojas/.test(r.txt), r.txt.slice(0, 300));
  const cancel = r.linhas.find(l => l.id === 'cancel'), sem10 = r.linhas.find(l => l.id === 'sem10'), transf = r.linhas.find(l => l.id === 'transf');
  check('nota sem 10%: Bangu R$ 666,00 perdidos (37 notas), 11º de 11, vermelho', sem10 && sem10.sem === 'vermelho' && /R\$\s?666,00/.test(sem10.txt) && /37 notas/.test(sem10.txt) && /11º de 11/.test(sem10.txt), sem10);
  check('cancelamento: 3,00% do faturamento, 11º de 11, vermelho — a Maglia não entra na conta', cancel && cancel.sem === 'vermelho' && /3,00%/.test(cancel.txt) && /11º de 11/.test(cancel.txt), cancel);
  check('"leve pra conversa": quem mais autorizou (Carol 8, Fernando 3) e os garçons (Júlio 21 — juntando "julio" e " JÚLIO ", Ana 16)',
    /quem mais autorizou: Carol 8, Fernando 3/.test(cancel.txt) && /garçons com mais notas: Júlio 21, Ana 16/.test(sem10.txt), [cancel.txt, sem10.txt]);
  check('o pior vem primeiro (vermelhos no topo)', r.linhas[0].sem === 'vermelho' && r.linhas[1].sem === 'vermelho', r.linhas.map(l => l.id + ':' + l.sem));
  check('o que está bem (transferência: 0, 1º) fica recolhido em "Tudo certo em"', transf && transf.sem === 'verde' && !transf.visivel && /Tudo certo em: Transferências/.test(r.txt), transf);
  check('couvert do fim de semana fechado (+R$ 600, 1º de 2)', r.linhas.some(l => l.id === 'couver' && /\+R\$\s?600,00/.test(l.txt) && /1º de 2/.test(l.txt)), r.linhas.find(l => l.id === 'couver'));
  check('o que não carregou (escala, visitas) é dito, não fingido', /Não carregou agora: escala, visitas/.test(r.txt), r.txt.slice(-300));
  check('uma leitura da rede só (a única por loja é a escala do banco da loja aberta)', r.urls.filter(u => /gn_caixa_fechamento/.test(u)).length === 1 && !r.urls.some(u => /loja=eq/.test(u) && !/gn_comissoes/.test(u)), r.urls);

  // ── Funcionário extra pago ──
  const ex = r.linhas.find(l => l.id === 'extra');
  check('extra pago: Bangu R$ 2.500,00 em 5 lançamentos (o "mercado" em Outros não entra; a "dobra" entra)', ex && /R\$\s?2\.500,00/.test(ex.txt) && /5 lançamentos/.test(ex.txt), ex && ex.txt);
  check('…em % da venda (2,50%), com a média da rede, e 11º de 11 em vermelho', ex && /2,50% da venda/.test(ex.txt) && /rede \d/.test(ex.txt) && /11º de 11/.test(ex.txt) && ex.sem === 'vermelho', ex);
  check('…e quem mais recebeu (Talita 3x, dobra Talita 1x) e quantos sem nome', ex && /quem mais recebeu: Talita 3x/.test(ex.txt) && /1 sem nome/.test(ex.txt), ex && ex.txt);
  check('a consulta traz só as despesas de extra e "outros" (não o caixa inteiro)', r.urls.some(u => /gn_caixa_despesa\.categoria=in\.\(funcionario_extra,outros\)/.test(decodeURIComponent(u))), r.urls.filter(u => /fechamento/.test(u)));

  // ── Banco de horas ──
  const bh = r.linhas.find(l => l.id === 'banco');
  check('banco de horas: Bangu −40h +10h, 3º de 3 (o maior banco em aberto), vermelho', bh && bh.sem === 'vermelho' && /−40h \+10h/.test(bh.txt) && /3º de 3/.test(bh.txt), bh);
  check('…com os R$ a compensar e a pagar (+50%) e o prazo do ciclo', bh && /a compensar · R\$\s?[\d.,]+ a pagar \(\+50%\)/.test(bh.txt) && /ciclo fecha em \d+ dias/.test(bh.txt), bh && bh.txt);
  check('…e quem tem os maiores saldos pra conversa (Alex −30h, Roseli +10h, Thayná −10h)', bh && /maiores saldos: ALEX SANDRO −30h, (ROSELI Martins \+10h, THAYNÁ LIMA −10h|THAYNÁ LIMA −10h, ROSELI Martins \+10h)/.test(bh.txt), bh && bh.txt);
  check('o banco usa a escala completa só da loja aberta (uma consulta), não das 11', r.urls.filter(u => /gn_comissoes\?loja=eq/.test(u)).length === 1, r.urls.filter(u => /gn_comissoes/.test(u)));
  const cx = await abrir('CAXIAS');
  const bhc = cx.linhas.find(l => l.id === 'banco');
  check('Caxias (−2h) fica em 1º no banco, verde', bhc && bhc.sem === 'verde' && /1º de 3/.test(bhc.txt), bhc);
  const sb = await abrir('BANGU', 'banco');
  check('banco de horas fora do ar: some só ele, e o painel diz', !sb.linhas.some(l => l.id === 'banco') && /Não carregou agora:.*banco de horas/.test(sb.txt) && sb.linhas.some(l => l.id === 'sem10'), sb.linhas.map(l => l.id));

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
