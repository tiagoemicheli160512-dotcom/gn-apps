// "Na mini DRE queria acrescentar os cancelamentos do mês e transferências, totais; nas
//  transferências quantas foram feitas; valor das notas sem serviço; banco de horas saldo
//  negativo e positivo; couvert resultado; e colocar opção de relatório em PDF, com um padrão
//  bem organizado. E subir o card pra cima das datas de validade, mostrando o resultado."
//  (06/11/2026). Decisões do dono: banco = o que entrou NO MÊS; card fechado, resultado no título.
//
// Fixture: Boulevard, outubro/2026 (hoje fixo em 06/11).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 500)); };

// Caixas de outubro: 3 cancelamentos (R$ 320), 4 transferências, 2 notas sem 10% (R$ 450).
const CAIXA = [
  { data: '2026-10-03', gn_caixa_despesa: [], gn_caixa_cancelamento: [{ valor: 100 }, { valor: 150 }], gn_caixa_transferencia: [{ id: 1 }, { id: 2 }, { id: 3 }], gn_caixa_gorjeta: [{ valor: 200 }] },
  { data: '2026-10-10', gn_caixa_despesa: [], gn_caixa_cancelamento: [{ valor: 70 }], gn_caixa_transferencia: [{ id: 4 }], gn_caixa_gorjeta: [{ valor: 250 }] },
  { data: '2026-10-11', gn_caixa_despesa: [], gn_caixa_cancelamento: [], gn_caixa_transferencia: [], gn_caixa_gorjeta: [] },
];
// Banco: salário 2200 = R$ 10/h. Ana -12h e +2h no mês = -10h; Bruno +6h (R$ 90 com +50%).
const BANCO = [
  { mes: 'CONFIG', registros: { periodo_inicio: '2026-06-26', salariosSetor: { 'Salão': 2200, 'Cozinha': 2200 } } },
  { mes: '2026-10', registros: [{ nome: 'Ana Paula', horas: -12 }, { nome: 'Ana Paula', horas: 2 }, { nome: 'Bruno Dias', horas: 6 }, { nome: 'Caio', horas: 0 }] },
];
const COMISSOES = [{ all_data: { '40': { funcs: [{ nome: 'Ana Paula', setor: 'Salão', dias: [] }, { nome: 'Bruno Dias', setor: 'Cozinha', dias: [] }] } } }];
// Trios: 2 shows com couvert lançado. Couvert 1.330 + 616 = 1.946; cachê 800 + 700 = 1.500 → +446.
const trio = (data, cache, couver) => ({ data, loja: 'boulevard', artista: 'Trio', cache, couver_qtd: couver / 7, couver_valor: couver,
  couver_lancado_em: data + 'T23:00:00Z', presenca_confirmada: true, banda_nao_veio: false, banda_nao_veio_motivo: null, horario_inicio: '13:00' });
const TRIOS = [trio('2026-10-04', 800, 1330), trio('2026-10-05', 700, 616)];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
  const urls = [];
  let falhaCaixa = false;
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url(); urls.push(u);
    const j = (b, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('checklist_diario')) return j(/2026-10-01/.test(u) ? [{ venda_salao: 400000, venda_delivery: 0 }] : [{ venda_salao: 380000, venda_delivery: 0 }]);
    if (u.includes('gn_caixa_fechamento')) return falhaCaixa ? j({ message: 'x' }, 500) : j(CAIXA);
    if (u.includes('gn_banco_horas')) return j(BANCO);
    if (u.includes('gn_comissoes')) return j(COMISSOES);
    if (u.includes('gn_trios_agenda')) return j(TRIOS);
    if (u.includes('DRE_CONFIG')) return j([{ all_data: { real: { 'BOULEVARD|2026-10': { cmv_pct: 33.9, folha_pct: 22, agua: 5000, gas: 5000, luz: 6000 } } } }]);
    return j([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', 'COMISSOES_CAL'], ['_renderMesAnteriorHome', '_mesAnteriorLinhasOperacao', '_relatorioMesAnteriorPDF']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  const abrir = (loja) => page.evaluate(async (loja) => {
    masterLoja = null; _dreAllData = null;
    await _renderMesAnteriorHome(true, { loja: loja || 'BOULEVARD', cargo: 'gerente' }, false);
    const el = document.getElementById('mes-anterior-home-card');
    return { html: el.innerHTML, txt: el.textContent.replace(/\s+/g, ' '),
             resumo: (el.querySelector('.mes-ant-resumo') || {}).textContent || '',
             ops: [...el.querySelectorAll('.mes-ant-op')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
             d: _mesAnteriorHomeData };
  }, loja);

  // ── Posição do card ──────────────────────────────────────────────────────────────────
  const ordem = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id$="-home-card"]')].map(e => e.id);
    return { mes: ids.indexOf('mes-anterior-home-card'), val: ids.indexOf('validades-home-card') };
  });
  check('o card do mês fechado fica ACIMA das validades', ordem.mes >= 0 && ordem.mes < ordem.val, JSON.stringify(ordem));

  const r = await abrir();
  const op = rot => r.ops.find(x => x.includes(rot)) || '';
  // ── Caixa ───────────────────────────────────────────────────────────────────────────
  check('cancelamentos do mês: 3 notas, R$ 320,00 — 0,08% do faturamento',
    /3 · R\$ 320,00/.test(op('Cancelamentos')) && /0,08% do faturamento/.test(op('Cancelamentos')), op('Cancelamentos'));
  check('transferências: quantas foram feitas (4) — o registro não tem valor', /4 feitas/.test(op('Transferências')), op('Transferências'));
  check('notas sem 10%: 2 notas, R$ 450,00, e o serviço que não entrou (R$ 45,00)',
    /2 · R\$ 450,00/.test(op('sem 10%')) && /R\$ 45,00 de serviço/.test(op('sem 10%')), op('sem 10%'));
  // ── Banco do mês ────────────────────────────────────────────────────────────────────
  check('banco do mês, negativo: Ana -12h +2h = -10h, R$ 100,00 já pagos',
    /-10h/.test(op('Saldo negativo')) && /1 pessoa/.test(op('Saldo negativo')) && /R\$ 100,00/.test(op('Saldo negativo')), op('Saldo negativo'));
  check('banco do mês, positivo: Bruno +6h, R$ 90,00 com +50%',
    /\+6h/.test(op('Saldo positivo')) && /R\$ 90,00 com \+50%/.test(op('Saldo positivo')), op('Saldo positivo'));
  check('a consulta do banco pede só a CONFIG e o mês fechado', urls.some(u => /gn_banco_horas\?loja=eq\.Boulevard&mes=in\.\(CONFIG,2026-10\)/.test(u)));
  // ── Couvert ─────────────────────────────────────────────────────────────────────────
  check('couvert do mês: 1.946 − 1.500 = +R$ 446,00, em verde',
    /\+R\$ 446,00/.test(op('couvert')) && /couvert R\$ 1\.946,00 − cachê R\$ 1\.500,00/.test(op('couvert')), op('couvert'));
  // ── Título ──────────────────────────────────────────────────────────────────────────
  check('o título já mostra o resultado: faturamento e variação (+5,3%)', /R\$ 400\.000,00/.test(r.resumo) && /▲ 5,3%/.test(r.resumo), r.resumo);
  check('e quais contas da DRE ficaram acima do ideal (CMV 33,9% > 29%)', /DRE: CMV acima do ideal/.test(r.resumo) && !/Folha/.test(r.resumo), r.resumo);
  check('o card continua fechado (a confirmação de leitura exige abrir)', /<details(?![^>]*\bopen\b)/.test(r.html));
  // ── DRE no celular ──────────────────────────────────────────────────────────────────
  const corte = await page.evaluate(() => {
    const el = document.getElementById('mes-anterior-home-card');
    el.querySelector('details').open = true;
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll('span')].filter(x => x.textContent.trim() && x.getBoundingClientRect().right > box.right + 1).map(x => x.textContent.trim()).slice(0, 5);
  });
  check('nada da DRE sai pela borda na tela do celular (o "Desvio" era cortado)', corte.length === 0, JSON.stringify(corte));

  // ── PDF ─────────────────────────────────────────────────────────────────────────────
  const pdf = await page.evaluate(() => {
    let o = null; const orig = window.gnRelatorioPDF;
    window.gnRelatorioPDF = x => { o = x; };
    try { _relatorioMesAnteriorPDF(); } finally { window.gnRelatorioPDF = orig; }
    return o;
  });
  const ptxt = pdf ? pdf.html.replace(/<style[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '';
  check('o PDF sai pelo padrão de relatório (gnRelatorioPDF), com loja e mês no título',
    pdf && /Desempenho de Outubro — Boulevard/.test(pdf.titulo) && /01\/10 a 31\/10\/2026/.test(pdf.subtitulo), pdf && pdf.titulo);
  const secoes = pdf ? [...pdf.html.matchAll(/<h2 class="mr-sec">([^<]+)<\/h2>/g)].map(m => m[1]) : [];
  check('seções na ordem: Faturamento, DRE, Caixa, Banco de horas, Couvert, Pessoas e perdas',
    secoes.join('|') === 'Faturamento|Mini DRE — ideal × real|Caixa|Banco de horas|Couvert|Pessoas e perdas', secoes.join('|'));
  check('o PDF traz os mesmos números do card', /3 · R\$ 320,00/.test(ptxt) && /4 feitas/.test(ptxt) && /2 · R\$ 450,00/.test(ptxt) &&
    /-10h/.test(ptxt) && /\+6h/.test(ptxt) && /\+R\$ 446,00/.test(ptxt) && /33,90%/.test(ptxt), ptxt.slice(0, 600));
  check('e nenhuma linha de lucro', !/[Ll]ucro/.test(ptxt));

  // ── WhatsApp ────────────────────────────────────────────────────────────────────────
  const whats = await page.evaluate(() => { let t = ''; const o = window._abrirWhats; window._abrirWhats = x => { t = x; }; try { _relatorioMesAnteriorWhats(); } finally { window._abrirWhats = o; } return t; });
  check('o WhatsApp leva as mesmas linhas', /Cancelamentos: \*3 · R\$ 320,00\*/.test(whats) && /Transferências: \*4 feitas\*/.test(whats) && /Resultado do couvert: \*\+R\$ 446,00\*/.test(whats), whats.slice(0, 500));

  // ── Falha e lojas fora ──────────────────────────────────────────────────────────────
  falhaCaixa = true;
  const f = await abrir();
  falhaCaixa = false;
  check('se o caixa não carregar, diz isso em vez de mostrar zero cancelamento', f.ops.some(x => /não carregou/.test(x)) && !f.ops.some(x => /0 · R\$ 0,00/.test(x)), JSON.stringify(f.ops));
  const mg = await abrir('MAGLIA');
  check('Maglia: sem linha de banco de horas nem de couvert (ela não usa)', !mg.ops.some(x => /Saldo negativo|couvert/i.test(x)), JSON.stringify(mg.ops));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
