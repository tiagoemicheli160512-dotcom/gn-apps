// ETAPA 1 (26/11/2026) — Painel de Gestão › Carnes:
//  1. "Visualização igual à dos vendidos, na parte de bebidas, onde aparece a previsão de
//     entrega" → saldo agora (última contagem + chegou − vendido) e o que está a chegar.
//  2. "Comparativo automático entre a contagem anterior e as vendas: seg 100 kg, vendeu 20,
//     esperado 80, contou 75 → divergência negativa de 5 kg."
//  3. "Editar o estoque inicial e os valores das entregas" — só MESTRE, gravando na raiz.
// Regras do dono (25/11): a contagem é de toda a carne da casa (inclusive a da salga), então
// a carne entra na PRIMEIRA contagem depois que chegou — conferida antes das 11h, no mesmo
// dia; depois, no seguinte. A da segunda sempre fica pra terça. Perda na salga 6% (sol) e 30%
// (carne seca); margem de 1 kg.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

// Semana vigente 23/11–29/11/2026, relógio na quinta 26/11 ao meio-dia.
const LINHAS = [{ loja: 'Boulevard', semana_inicio: '2026-11-23', updated_at: '2026-11-26T12:00:00Z', carnes: {
  // Picanha: seg 100 (+10 que chegou na segunda e ficou FORA da contagem), vendeu 20 na seg
  //   → esperado ter = 100 + 10 − 20 = 90; contou 85 → −5 (falta).
  //   ter vendeu 10 → esperado qua = 75; contou 74 → −1 (dentro da margem: ✓).
  //   qua sem vendidos lançados → qui não é comparada ("s/ vend.").
  picanha: { inicial: '100', ent_seg: '10', ter: '85', qua: '74', qui: '60' },
  // Carne seca: chegou 100 na terça, conferida às 9h (antes da contagem) → já está na
  //   contagem de terça, como 70 líquido (−30% salga). 50 + 70 − 5 = 115 ✓.
  //   ter sem carne seca nos vendidos (0) → esperado qua 115; contou 118 → +3 (sobra).
  carne_seca: { inicial: '50', ent_ter: '100', ter: '115', qua: '118' },
  // Carne de sol: seg pratos 18 + 8 rodízios × 250 g = 20 → 200 − 20 = 180 ✓.
  //   ter: pratos 12 → esperado qua 168; contou 170 → +2 (sobra).
  //   qui chegou 30 → 28,2 líquido (−6%); qua sem vendidos → deve ter agora fica parcial.
  carne_sol: { inicial: '200', ter: '180', qua: '170', ent_qui: '30' },
  // Camarão: chegou 12 na terça À TARDE (sem hora antes das 11h) → não está na contagem de
  //   terça (20 = 20 ✓) e aparece na de quarta (20 + 12 = 32 ✓). É o caso real de 26/11.
  camarao: { inicial: '20', ent_ter: '12', ter: '20', qua: '32' },
} }];
const VEND = [
  { loja: 'Boulevard', data: '2026-11-23', totais: { picanha: 20, carne_seca: 5, carne_sol: 18 } },
  { loja: 'Boulevard', data: '2026-11-24', totais: { picanha: 10, carne_sol: 12 } },
];
const ROD = [{ loja: 'Boulevard', data: '2026-11-23', rodizio_inteira: 8, rodizio_meia: 0 }];
const CAT = [
  { id: 'c-sol', item_id: 207, origem_item_id: null, regiao: 'RJ' }, { id: 'c-sec', item_id: 209, origem_item_id: null, regiao: 'RJ' },
  { id: 'c-pic', item_id: 392, origem_item_id: null, regiao: 'RJ' }, { id: 'c-cam', item_id: 237, origem_item_id: null, regiao: 'RJ' },
  { id: 's-pic', item_id: 1392, origem_item_id: 392, regiao: 'SP' },
];
const PROV = [
  { id: 'p1', loja_slug: 'boulevard', catalogo_id: 'c-pic', data_entrega: '2026-11-24', data_entrega_fim: null, qtd_prevista: 15, fornecedor: 'FRIGO' },
  { id: 'p2', loja_slug: 'boulevard', catalogo_id: 'c-cam', data_entrega: '2026-11-28', data_entrega_fim: null, qtd_prevista: 10, fornecedor: 'MAR' },
];
const HORA = [{ loja_slug: 'boulevard', catalogo_id: 'c-sec', gn_recebimentos: [{ qtd_recebida: 100, validado_em: '2026-11-24T12:00:00Z' }] }];   // 9h em Brasília
const RECEB = [{ id: 'pv1', catalogo_id: 'c-sec', data_entrega: '2026-11-23', fornecedor: 'FRIGO', qtd_prevista: 100, status: 'RECEBIDO_OK',
  gn_recebimentos: [{ id: 'r1', qtd_recebida: 100, validado_em: '2026-11-24T15:00:00Z', validado_por: 'João', nota_numero: '123' }] }];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T12:00:00');
  const rpcs = [];
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (/\/rpc\/gn_carnes_mestre_/.test(u)) { rpcs.push({ fn: u.split('/rpc/')[1], body: JSON.parse(r.request().postData() || '{}') });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, chk_manual: false }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildCarnesPanel === 'function' && Array.isArray(LOJAS_LISTA); } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  if (!(await page.evaluate(() => !!window.gnCarnesDiario && typeof _carnesDiarioHtml === 'function'))) {
    console.log('FALHOU: o esperado × contado não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const montar = (cargo) => page.evaluate(async ({ LINHAS, VEND, ROD, CAT, PROV, RECEB, HORA, cargo }) => {
    window.gnFetchJson = async (url, h, c) => {
      if (c === 'carnesGerencia') return LINHAS;
      if (c === 'carnesGerencia:fat') return [];
      if (c === 'carnesGerencia:rodizio') return ROD;
      if (c === 'carnesGerencia:vendidos') return VEND;
      if (c === 'carnesGerencia:cat') return CAT;
      if (c === 'carnesGerencia:provAg') { window.__provUrl = url; return PROV; }
      if (c === 'carnesEdit:receb') return RECEB;
      if (c === 'carnesGerencia:recebHora') { window.__horaUrl = url; return HORA; }
      return [];
    };
    session = { nome: 'Tiago', cargo, loja: 'GERAL', permissoes: {} };
    renderDashboard = () => {};
    LOJAS_LISTA = ['BOULEVARD'];
    _carnesGerOff = 1; _carnesCatCache = null; _carnesEditLoja = null;
    await _loadCarnesGerencia();
    const el = document.createElement('div'); el.innerHTML = _buildCarnesPanel(); document.body.appendChild(el);
    const linha = corte => [...el.querySelectorAll(`.carnes-dd-linha[data-corte="${corte}"] td.carnes-dd`)].map(td => ({ st: td.dataset.status, txt: td.textContent.replace(/\s+/g, ' ').trim(), tip: td.title }));
    const prev = corte => { const tr = el.querySelector(`.carnes-prev-linha[data-corte="${corte}"]`); return tr ? tr.textContent.replace(/\s+/g, ' ').trim() : null; };
    const out = { pic: linha('picanha'), sec: linha('carne_seca'), sol: linha('carne_sol'), cam: linha('camarao'), horaUrl: window.__horaUrl || '',
      prevPic: prev('picanha'), prevSol: prev('carne_sol'), prevTxt: (el.querySelector('.carnes-previsao') || {}).textContent || '',
      botao: !!el.querySelector('.carnes-edit-btn'), provUrl: window.__provUrl || '' };
    el.remove(); return out;
  }, { LINHAS, VEND, ROD, CAT, PROV, RECEB, HORA, cargo });

  // ══ 1. Comparativo dia a dia ═════════════════════════════════════════════════════════
  const m = await montar('mestre');
  check('exemplo do dono: seg 100 (+10 de segunda fora da contagem) − 20 vendidos → esperado 90; contou 85 → −5,0 (falta)',
    m.pic[0].st === 'falta' && /85,0\s*-5,0/.test(m.pic[0].txt) && /esperado 90,0/.test(m.pic[0].tip), m.pic[0]);
  check('diferença de 1 kg fica dentro da margem (✓)', m.pic[1].st === 'ok' && /✓/.test(m.pic[1].txt), m.pic[1]);
  check('dia sem vendidos lançados não é comparado ("s/ vend.", nunca divergência)', m.pic[2].st === 'sem_dado' && /s\/ vend/.test(m.pic[2].txt) && /sem vendidos de Qua/.test(m.pic[2].tip), m.pic[2]);
  check('carne seca: 100 kg que chegaram entram como 70 (−30% salga) → 50 + 70 − 5 = 115 ✓', m.sec[0].st === 'ok' && /chegou 70,0 \(100,0 − salga\)/.test(m.sec[0].tip), m.sec[0]);
  check('sobra aparece com + (carne seca +3,0)', m.sec[1].st === 'sobra' && /\+3,0/.test(m.sec[1].txt), m.sec[1]);
  check('carne de sol: rodízio do dia entra no vendido (18 pratos + 8 × 250 g = 20) → 180 ✓', m.sol[0].st === 'ok' && /vendido 20,0/.test(m.sol[0].tip), m.sol[0]);
  check('sete colunas: terça a domingo e o fechamento (segunda seguinte)', m.pic.length === 7);
  check('semana em andamento: dia que ainda não chegou (sexta em diante) fica em branco, não "sem dado"', m.pic.slice(3).every(x => x.st === 'futuro'), m.pic.slice(3).map(x => x.st));
  const fmt = await page.evaluate(() => [_carnesEditNum('23.100'), _carnesEditNum(140.275), _carnesEditNum('')]);
  check('campo de edição mostra "23,1" (não "23,100", que se lê vinte e três mil)', fmt[0] === '23,1' && fmt[1] === '140,275' && fmt[2] === '', fmt);
  check('entrega conferida À TARDE não está na contagem do dia: terça 20 ✓ e aparece na de quarta (20 + 12 = 32 ✓)',
    m.cam[0].st === 'ok' && !/chegou/.test(m.cam[0].tip) && m.cam[1].st === 'ok' && /chegou 12,0/.test(m.cam[1].tip), m.cam.slice(0, 2));
  const comp = await page.evaluate(() => {
    // Caso real de São Gonçalo (26/11): 98,8 kg conferidos de manhã, mas só contados na quarta.
    const l = window.gnCarnesDiario.dias('carne_sol', { inicial: 137, ent_ter: 98.8, ter: '127.3', qua: '220' }, [8.55, 4.34], [0, 98.8]);
    return { a: l[0], b: l[1], r: window.gnCarnesDiario.resumo(l) };
  });
  check('falta −94 na terça e sobra +97 na quarta se compensam: marcadas (↔), fora do total de falta/sobra',
    comp.a.compensa === 'Qua' && comp.b.compensa === 'Ter' && comp.r.falta === 0 && comp.r.sobra === 0 && comp.r.compensados === 2, comp);
  check('a hora da conferência vem dos recebimentos das carnes da semana', /gn_recebimentos!inner\(qtd_recebida,validado_em\)/.test(m.horaUrl) && /c-sec/.test(m.horaUrl), m.horaUrl);

  // ══ 2. Saldo agora + o que está a chegar ═════════════════════════════════════════════
  // 26/11/2026: nada depois da contagem de hoje sai "—" (era "+0,0 −0,0", que parecia entrega
  // sumida), com a nota de que as entregas da semana já estão dentro da contagem.
  check('saldo agora da picanha: última contagem quinta 60 → deve ter 60 (chegou/vendido "—")', /60,0 \(Qui\)/.test(m.prevPic || '') && /\(Qui\) — — 60,0/.test(m.prevPic), m.prevPic);
  check('…e a nota explica que as entregas da semana já estão na contagem de hoje', /já estão dentro dela/.test(m.prevTxt), m.prevTxt.slice(-500));
  check('carne de sol: quarta 170 + 28,2 (30 − 6%) − vendido (quarta sem lançamento avisada)', /170,0 \(Qua\) \+28,2/.test(m.prevSol || '') && /sem Qua/.test(m.prevSol), m.prevSol);
  check('a chegar: pedido de picanha com data passada aparece como atrasado; camarão com a data', /15,0 kg · 24\/11 ⚠ atrasada/.test(m.prevTxt) && /10,0 kg · 28\/11/.test(m.prevTxt) && /falta confirmar na aba Entrega/.test(m.prevTxt), m.prevTxt.slice(0, 500));
  // 27/11/2026 — caso real de Bangu: a NF de 24 kg de camarão foi lançada nas Entradas (a
  // entrada automática pôs +24 na segunda) e o pedido de 24 kg ficou "aguardando" na Entrega.
  const nf = await page.evaluate(() => {
    const base = { inicial: 10, ter: 9.85, qua: 30.65, qui: 39.25 };
    const html = (recebSem, extraProv) => { const d = { carnes: { camarao: Object.assign({ ent_seg: 24 }, base), carne_sol: { inicial: 157, ter: 145, qua: 134, qui: 128 }, picanha: { inicial: 30, qui: 65 }, carne_seca: { inicial: 20, qui: 19.7 } },
        recebSem, provAg: [{ corte: 'camarao', data_entrega: '2026-11-24', qtd_prevista: '24.000' }, { corte: 'carne_sol', data_entrega: '2026-11-24', qtd_prevista: '100.000' }].concat(extraProv || []) };
      const el = document.createElement('div'); el.innerHTML = _carnesPrevisaoHtml('BANGU', d, true); document.body.appendChild(el);
      const t = el.innerText.replace(/\s+/g, ' '); el.remove(); return t; };
    return { soNF: html({}), confirmada: html({ camarao: 24 }), futuro: html({}, [{ corte: 'camarao', data_entrega: '2026-11-30', qtd_prevista: '20' }]) };
  });
  check('Bangu: carne entrou pela NF e o pedido segue "aguardando" → "chegou pela NF — falta confirmar na Entrega", não "atrasada"',
    /24,0 kg · 24\/11 📄 chegou pela NF falta confirmar na Entrega/.test(nf.soNF) && !/24,0 kg · 24\/11 ⚠ atrasada/.test(nf.soNF) && /Chegou pela nota/.test(nf.soNF), nf.soNF);
  check('…a carne de sol sem nota nem entrega continua "atrasada" (não chegou mesmo)', /100,0 kg · 24\/11 ⚠ atrasada/.test(nf.soNF), nf.soNF);
  check('…se a entrada veio de entrega confirmada, ela não cobre outro pedido aguardando (segue atrasado)', /24,0 kg · 24\/11 ⚠ atrasada/.test(nf.confirmada) && !/chegou pela NF/.test(nf.confirmada), nf.confirmada);
  check('…pedido de data futura continua "a chegar", mesmo com sobra de nota', /20,0 kg · 30\/11/.test(nf.futuro) && !/20,0 kg · 30\/11 📄/.test(nf.futuro), nf.futuro);
  check('a previsão lê só o que está "aguardando", dos itens de carne', /status=eq\.AGUARDANDO/.test(m.provUrl) && /c-pic/.test(m.provUrl) && /s-pic/.test(m.provUrl), m.provUrl);

  // ══ 3. Correção só do mestre ═════════════════════════════════════════════════════════
  const sup = await montar('supervisor');
  check('supervisor não vê o ✏️ Corrigir; mestre vê', m.botao && !sup.botao, { m: m.botao, sup: sup.botao });
  const ed = await page.evaluate(async () => {
    session = { nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: {} };
    window.confirm = () => true; window.alert = x => { window.__alert = x; };
    renderDashboard = () => {};
    _carnesEditAbrir('BOULEVARD');
    await new Promise(r => setTimeout(r, 50));
    const box = document.createElement('div'); box.innerHTML = _carnesEditHtml('BOULEVARD', _carnesGerData.porLoja.BOULEVARD); document.body.appendChild(box);
    const txt = box.textContent.replace(/\s+/g, ' ');
    box.querySelector('.carnes-edit-ini[data-corte="picanha"]').value = '98,5';
    await _carnesEditSalvarIni('BOULEVARD', 'picanha');
    box.innerHTML = _carnesEditHtml('BOULEVARD', _carnesGerData.porLoja.BOULEVARD);
    const rec = box.querySelector('.carnes-edit-rec[data-id="r1"]');
    const temRec = !!rec; if (rec) rec.value = '96';
    await _carnesEditSalvarRec('BOULEVARD', 'r1');
    box.remove();
    // Supervisor chamando direto não grava.
    session = { nome: 'Sup', cargo: 'supervisor', loja: 'GERAL', permissoes: {} };
    await _carnesEditSalvarIni('BOULEVARD', 'picanha');
    return { txt, temRec };
  });
  const ini = rpcs.find(r => r.fn === 'gn_carnes_mestre_inicial'), ent = rpcs.find(r => r.fn === 'gn_carnes_mestre_entrega');
  check('editor do mestre: estoque inicial e as entregas confirmadas da semana', /Estoque inicial/.test(ed.txt) && /Entregas recebidas/.test(ed.txt) && ed.temRec && /NF 123/.test(ed.txt), ed.txt.slice(0, 300));
  check('salvar o inicial chama a RPC com loja, item do catálogo da região, semana e o valor (98,5)',
    ini && ini.body.p_loja_slug === 'boulevard' && ini.body.p_loja_chk === 'Boulevard' && ini.body.p_catalogo_id === 'c-pic' && ini.body.p_semana === '2026-11-23' && ini.body.p_valor === 98.5 && ini.body.p_por === 'Tiago', ini);
  check('salvar a entrega chama a RPC com o recebimento, o dia da conferência (terça) e o valor',
    ent && ent.body.p_recebimento_id === 'r1' && ent.body.p_valor === 96 && ent.body.p_dia === 'ter' && ent.body.p_corte === 'carne_seca', ent);
  check('supervisor chamando a gravação direto não gera RPC', rpcs.filter(r => r.fn === 'gn_carnes_mestre_inicial').length === 1, rpcs.length);
  await ctx.close();

  // ══ 4. Check-list: a correção do mestre não é desfeita por aparelho aberto + aviso ════
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx2.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx2.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const chk = await ctx2.newPage();
  chk.on('pageerror', e => erros.push('chk: ' + String(e.message || e)));
  for (let t = 1; ; t++) {
    await chk.goto('file://' + CHK);
    try { await chk.waitForFunction(() => { try { return typeof _mesclarCarnesAntesDeSalvar === 'function' && typeof CARNES_DEF !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) throw new Error('o Check-list não carregou'); }
  }
  const mc = await chk.evaluate(() => {
    stateWeek.carnes = { picanha: { inicial: 100, ter: '85' }, carne_sol: { inicial: 200 } };
    const serv = { picanha: { inicial: 98.5, inicialMestreEm: '2026-11-26T12:00:00.000Z', inicialMestrePor: 'Tiago' }, carne_sol: { inicial: 190 } };
    const m = _mesclarCarnesAntesDeSalvar(serv);
    const avisos = {};
    ['diario', 'contagem', 'entradas'].forEach(t => { carneTabAtiva = t; _carnesAvisoContagem(); avisos[t] = document.getElementById('carnes-aviso-contagem').textContent; });
    return { pic: m.picanha.inicial, picTer: m.picanha.ter, marca: m.picanha.inicialMestrePor, sol: m.carne_sol.inicial, avisos };
  });
  check('Check-list: valor corrigido pelo mestre vence o número antigo do aparelho aberto (98,5, não 100)', mc.pic === 98.5 && mc.marca === 'Tiago' && mc.picTer === '85', mc);
  check('…sem a marca do mestre a regra de sempre continua (local preenchido vence: 200)', mc.sol === 200, mc);
  check('aviso na contagem diária: contar toda a carne, inclusive a da salga; exceto a de segunda', /TODA a carne da casa/.test(mc.avisos.diario) && /salga/.test(mc.avisos.diario) && /segunda/.test(mc.avisos.diario), mc.avisos);
  check('aviso na contagem de segunda: NÃO contar a carne que chegou hoje', /NÃO conte a carne que chegou hoje/.test(mc.avisos.contagem) && !mc.avisos.entradas, mc.avisos);
  await ctx2.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
