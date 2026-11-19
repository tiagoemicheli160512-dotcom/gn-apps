// Painel de Gestão × vendidos do dia (20/11/2026, pedido do dono):
//  · aba 🥩 Carnes: "pelos vendidos" (pratos × gramatura + rodízios a 250 g na carne de sol)
//    contra a saída real (início + compras − contagem), com a diferença; semana incompleta
//    não compara; a grade dia a dia mostra os kg vendidos de cada dia;
//  · aba 🧾 Vendidos (Operação): quem não lançou ontem, Coca e chopp por dia, chopp × barris
//    finalizados, 11 lojas sem Maglia, sem estourar 360 px, relatório;
//  · cadastro (mestre): editar gramatura grava; sugestão pelas fichas técnicas reais.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T12:00:00');
  const posts = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    if (/gn_vendidos_itens/.test(req.url()) && req.method() === 'POST') { posts.push({ url: req.url(), b: JSON.parse(req.postData()) }); return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  page.on('dialog', d => d.accept());
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildCarnesPanel === 'function' && !!window.gnVendidos && typeof LOJAS_LISTA !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _buildVendidosPanel === 'function'))) {
    console.log('FALHOU: a aba Vendidos do Painel não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  // ── 1. Carnes: semana passada (16–22/11), Bangu completa, Caxias com 3 dias ──
  const c = await page.evaluate(async () => {
    const tot = (cs, cseca) => ({ carne_sol: cs, carne_seca: cseca || 0, picanha: 0, camarao: 0 });
    const vend = [];
    ['16', '17', '18', '19', '20', '21', '22'].forEach((d, i) => vend.push({ loja: 'BANGU', data: '2026-11-' + d, totais: tot(10, i === 0 ? 2 : 0) }));
    ['16', '17', '18'].forEach(d => vend.push({ loja: 'CAXIAS', data: '2026-11-' + d, totais: tot(5) }));
    window.gnFetchJson = async (url, h, nome, fb) => {
      if (nome === 'carnesGerencia') return [
        { loja: 'BANGU', semana_inicio: '2026-11-16', updated_at: '2026-11-23T10:00:00Z', carnes: { carne_sol: { inicial: 100, ent_qua: 50, contagem_final: 60 }, carne_seca: { inicial: 10, contagem_final: 7.9 } } },
        { loja: 'CAXIAS', semana_inicio: '2026-11-16', updated_at: '2026-11-23T10:00:00Z', carnes: { carne_sol: { inicial: 40, contagem_final: 10 } } },
      ];
      if (nome === 'carnesGerencia:fat') return [];
      if (nome === 'carnesGerencia:rodizio') return [{ loja: 'BANGU', data: '2026-11-20', rodizio_inteira: 8, rodizio_meia: 0 }];
      if (nome === 'carnesGerencia:vendidos') return vend;
      return fb === undefined ? [] : fb;
    };
    _carnesGerOff = 0; await _loadCarnesGerencia();
    const el = document.createElement('div'); el.innerHTML = _buildCarnesPanel(); document.body.appendChild(el);
    const loja = n => [...el.querySelectorAll('div')].find(x => x.firstElementChild && x.firstElementChild.firstElementChild && x.firstElementChild.firstElementChild.textContent === n);
    const bangu = loja('Bangu'), caxias = loja('Caxias');
    const linha = (box, k) => { const v = box && box.querySelector(`.carnes-vend[data-corte="${k}"]`); return v ? v.innerText.replace(/\s+/g, ' ') : ''; };
    const out = { bSol: linha(bangu, 'carne_sol'), bSeca: linha(bangu, 'carne_seca'), cSol: linha(caxias, 'carne_sol'),
      grade: [...(bangu ? bangu.querySelectorAll('.carnes-vend-dia') : [])].map(x => x.textContent), rel: _carnesRelatorioTexto(false).msg };
    el.remove();
    return out;
  });
  // Bangu carne de sol: saída real 100 + 50 − 60 = 90; pratos 7 × 10 = 70; rodízio 8 × 0,25 = 2 → devia 72; diferença +18 kg (+25%).
  check('Bangu carne de sol: "pelos vendidos: 72,0 kg (pratos 70,0 + rodízio 2,0)"', /pelos vendidos: 72,0 kg \(pratos 70,0 \+ rodízio 2,0\)/.test(c.bSol), c.bSol);
  check('…e acusa "saíram 18,0 kg a mais que os vendidos explicam (+25%)"', /saíram 18,0 kg a mais que os vendidos explicam \(\+25%\)/.test(c.bSol), c.bSol);
  check('carne seca: real 2,1 kg × vendidos 2,0 kg → dentro da margem, "bate com os vendidos"', /pelos vendidos: 2,0 kg/.test(c.bSeca) && /bate com os vendidos/.test(c.bSeca), c.bSeca);
  check('Caxias com 3/7 dias lançados: mostra o parcial e NÃO calcula diferença', /pelos vendidos: 15,0 kg/.test(c.cSol) && /3\/7 dias lançados/.test(c.cSol) && !/a mais|a menos|bate/.test(c.cSol), c.cSol);
  check('a grade dia a dia mostra o que os pratos levaram (🧾10,0 em cada dia da Bangu)', c.grade.filter(x => x === '🧾10,0').length === 7, c.grade);
  check('o relatório leva o "pelos vendidos" com a diferença', /pelos vendidos: 72,0 kg · diferença \+18,0 kg \(\+25%\)/.test(c.rel) && /pelos vendidos: 15,0 kg \(3\/7 dias lançados\)/.test(c.rel), c.rel);

  // ── 2. Aba Vendidos: semana vigente (23–29/11), hoje quinta 26 às 12h ──────
  const v = await page.evaluate(async () => {
    const t = (coca, cl, vi) => ({ coca_un: coca, chopp_l_claro: cl, chopp_l_vinho: vi || 0 });
    window.gnFetchJson = async (url, h, nome, fb) => {
      if (nome === 'vendidos:diario') return [
        { loja: 'BANGU', data: '2026-11-23', totais: t(40, 35), lancado_por: 'Fernando' },
        { loja: 'BANGU', data: '2026-11-24', totais: t(50, 70, 7), lancado_por: 'Fernando', atrasado: true, liberado_por: 'Tiago' },
        { loja: 'BANGU', data: '2026-11-25', totais: t(60, 35), lancado_por: 'Fernando' },
        { loja: 'CAXIAS', data: '2026-11-23', totais: t(10, 0), lancado_por: 'Ana' },
        { loja: 'MAGLIA', data: '2026-11-25', totais: t(99, 99), lancado_por: 'X' },
      ];
      if (nome === 'vendidos:barris') return [
        { loja_slug: 'bangu', produto: 'Barril Chopp claro 50 litros', finalizado_em: '2026-11-24T20:00:00Z' },
        { loja_slug: 'bangu', produto: 'Barril Chopp claro 50 litros', finalizado_em: '2026-11-25T20:00:00Z' },
        { loja_slug: 'bangu', produto: 'Chopp Vinho Barril c/ 50 litros', finalizado_em: '2026-11-25T21:00:00Z' },
      ];
      if (nome === 'vendidos:cadastro') return [{ id: 'p1', grupo: 'prato', nome: 'Carne de sol GIG P2', gramas: { carne_sol: 400 }, ativo: true, ordem: 1, codigo_pdv: '4013' }, { id: 'coca_lata', grupo: 'coca', nome: 'Coca lata', gramas: {}, ativo: true }];
      return fb === undefined ? [] : fb;
    };
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    _vendGerOff = 1; await _loadVendidosGerencia();
    const el = document.getElementById('dash-section') || document.body.appendChild(document.createElement('div'));
    el.style.display = 'block';
    el.innerHTML = _buildVendidosPanel();
    const loja = k => { const x = el.querySelector(`.vend-loja[data-loja="${k}"]`); return x ? x.innerText.replace(/\s+/g, ' ') : null; };
    return { aviso: (el.querySelector('.vend-aviso') || {}).innerText, rede: (el.querySelector('.vend-rede') || {}).innerText, bangu: loja('BANGU'), caxias: loja('CAXIAS'),
      lojas: [...el.querySelectorAll('.vend-loja')].map(x => x.dataset.loja), maglia: !!el.querySelector('.vend-loja[data-loja="MAGLIA"]'),
      largos: [...el.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > window.innerWidth + 1 && !e.closest('[style*="overflow-x:auto"]'); }).map(e => e.className || e.tagName).slice(0, 5),
      grupoTem: DASH_GRUPOS.find(g => g.g === 'operacao').abas.map(a => a[0]).join(), rel: _vendRelatorioTexto(false).msg };
  });
  check('aba "🧾 Vendidos" no grupo Operação, logo depois de Carnes', /carnes,vendidos/.test(v.grupoTem), v.grupoTem);
  check('aviso: 10 de 11 lojas sem os vendidos de ontem (25/11), já em atraso (passou das 11h)', /10 de 11 lojas sem os vendidos de ontem \(25\/11\) — em atraso/.test(v.aviso || '') && !/Bangu/.test(v.aviso) && /Caxias/.test(v.aviso), v.aviso);
  check('rede: Coca 160 un; claro 140,0 L (2 barris); vinho 7,0 L (1 barril) — Maglia fora', /160 un/.test(v.rede) && /140,0 L/.test(v.rede) && /2 barris finalizados/.test(v.rede) && /7,0 L/.test(v.rede) && /1 barril finalizado/.test(v.rede), v.rede);
  check('Bangu: 3/3 dias lançados, 1 com atraso; claro 140 L × 2 barris (100 L) = 140%', /3\/3 dias lançados · 1 com atraso/.test(v.bangu) && /Claro: vendidos 140,0 L · barris finalizados 2 \(100 L\) · 140% do volume/.test(v.bangu), v.bangu);
  check('Caxias: 1/3 dias, com ✕ nos dias devidos sem lançamento', /1\/3 dias lançados/.test(v.caxias) && (v.caxias.match(/✕/g) || []).length === 6, v.caxias);
  check('11 lojas, sem Maglia', v.lojas.length === 11 && !v.maglia, v.lojas);
  check('nada passa da largura em 360 px (fora das tabelas que rolam de lado)', v.largos.length === 0, v.largos);
  check('relatório: Bangu 3/3, Coca 150 un, e quem tem dia sem lançar', /Bangu — 3\/3 dias lançados/.test(v.rel) && /Coca: 150 un · Chopp claro 140,0 L · vinho 7,0 L/.test(v.rel) && /Com dia sem lançar: .*Caxias/.test(v.rel) && !/Maglia/.test(v.rel), v.rel);

  // ── 3. Cadastro (mestre) ───────────────────────────────────────────────────
  const cad = await page.evaluate(async () => {
    _vendCadAberto = true; renderDashboard = () => { document.getElementById('dash-section').innerHTML = _buildVendidosPanel(); };
    renderDashboard();
    const box = document.querySelector('.vc-item[data-id="p1"]');
    box.querySelector('.vc-g[data-carne="carne_sol"]').value = '450';
    box.querySelector('.vc-g[data-carne="camarao"]').value = '100';
    await _vendCadSalvar(box.querySelector('button'));
    return { pode: _vendPodeEditar(), texto: document.querySelector('.vend-cadastro').innerText.replace(/\s+/g, ' ') };
  });
  const p = (posts[0] || {}).b || [];
  check('mestre edita a gramatura: grava upsert com 450 g carne de sol + 100 g camarão, quem alterou, mantendo o código', cad.pode && p.length === 1 && p[0].id === 'p1' && p[0].gramas.carne_sol === 450 && p[0].gramas.camarao === 100 && p[0].atualizado_por === 'Tiago' && p[0].codigo_pdv === '4013' && /on_conflict=id/.test(posts[0].url), p);
  const naoMestre = await page.evaluate(() => { session = { id: 2, nome: 'Sup', cargo: 'supervisor', loja: 'GERAL', permissoes: {} }; const h = _vendCadastroHtml(); session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; return { temInput: /vc-nome/.test(h), aviso: /Só o mestre altera/.test(h) }; });
  check('supervisor vê o cadastro, mas só o mestre altera', !naoMestre.temInput && naoMestre.aviso, naoMestre);

  // Sugestão pelas fichas técnicas REAIS (fichas-seed.js).
  const sug = await page.evaluate(async () => {
    await _vendCarregarScript('fichas-seed.js');
    const l = _vendSugestoesDasFichas(FICHAS_SEED_ORIG, [{ codigo_pdv: '4013' }]);
    const por = cod => l.find(x => x.cod === cod) || null;
    return { n: l.length, gig4: por('4012'), gig2: por('4013'), inf: por('324'), farofa: por('100015'), capitao: por('60005'), picanha: por('4011'), xique: por('4285'), suina: l.some(x => /SU[IÍ]NA/.test(JSON.stringify(x))) };
  });
  check('fichas: Carne de sol GIG P4 sugerida com 800 g de carne de sol, sem ressalva', sug.gig4 && sug.gig4.gramas.carne_sol === 800 && !sug.gig4.conferir, sug.gig4);
  check('fichas: o que já está no cadastro (GIG P2, cód. 4013) não é sugerido de novo', sug.gig2 === null, sug.gig2);
  check('fichas: Infarto do Gigante = 400 g carne de sol + 250 g carne seca, marcado pra conferir (carne de sol "PRODUÇÃO")', sug.inf && sug.inf.gramas.carne_sol === 400 && sug.inf.gramas.carne_seca === 250 && sug.inf.conferir, sug.inf);
  check('fichas: Picanha de sol P2 = 400 g picanha', sug.picanha && sug.picanha.gramas.picanha === 400, sug.picanha);
  check('fichas: preparo da cozinha (CAPITAO BAIAO PROD) e paçoca (farofa de cuscuz) ficam fora; xique-xique em UN vai pra conferir sem gramatura', !sug.capitao && !sug.farofa && !sug.xique, sug);

  // ── 4. Coca × estoque (semana passada 16–22/11, fechada pela contagem de 23/11) ──
  const e = await page.evaluate(async () => {
    const CAT = { lata: 'cat-lata', ks: 'cat-ks', lataSP: 'cat-lata-sp' };
    const dias = ['16', '17', '18', '19', '20', '21', '22'];
    const vendLata = (loja, qtds) => qtds.map((q, i) => ({ loja, data: '2026-11-' + dias[i], totais: { coca_un: q }, itens: { coca_lata: { q, grupo: 'coca' }, coca_ks: { q: 0, grupo: 'coca' } }, lancado_por: 'X' }));
    window.gnFetchJson = async (url, h, nome, fb) => {
      if (nome === 'vendidos:diario') return [...vendLata('BANGU', [20, 20, 20, 20, 20, 15, 15]), ...vendLata('ITAQUERA', [5, 5, 5, 5, 5, 5, 5]), ...vendLata('CAXIAS', [9, 9, 9]), ...vendLata('CAMPO GRANDE', [1, 1, 1, 1, 1, 1, 1])];
      if (nome === 'vendidos:barris') return [];
      if (nome === 'vendidos:cadastro') return [{ id: 'coca_lata', grupo: 'coca', nome: 'Coca-Cola lata 350 ml', ativo: true, item_estoque: 37 }, { id: 'coca_ks', grupo: 'coca', nome: 'Coca-Cola KS 290 ml', ativo: true, item_estoque: 36 }];
      if (nome === 'vendidos:estoqueCat') return [{ id: CAT.lata, item_id: 37, origem_item_id: null, und_por_caixa: 12 }, { id: CAT.ks, item_id: 36, origem_item_id: null, und_por_caixa: 24 }, { id: CAT.lataSP, item_id: 1037, origem_item_id: 37, und_por_caixa: 12 }];
      if (nome === 'vendidos:estoqueCont') return [
        { loja_slug: 'bangu', catalogo_id: CAT.lata, atual: 126, data_contagem: '2026-11-16', criado_em: '2026-11-16T13:00:00Z' },
        { loja_slug: 'bangu', catalogo_id: CAT.lata, atual: 53, data_contagem: '2026-11-23', criado_em: '2026-11-23T13:00:00Z' },
        { loja_slug: 'bangu', catalogo_id: CAT.ks, atual: 156, data_contagem: '2026-11-16', criado_em: '2026-11-16T13:00:00Z' },
        { loja_slug: 'bangu', catalogo_id: CAT.ks, atual: 156, data_contagem: '2026-11-23', criado_em: '2026-11-23T13:00:00Z' },
        { loja_slug: 'campo_grande', catalogo_id: CAT.lata, atual: 28, data_contagem: '2026-11-16', criado_em: '2026-11-16T13:00:00Z' },
        { loja_slug: 'campo_grande', catalogo_id: CAT.lata, atual: 50, data_contagem: '2026-11-23', criado_em: '2026-11-23T13:00:00Z' },
        { loja_slug: 'caxias', catalogo_id: CAT.lata, atual: 60, data_contagem: '2026-11-17', criado_em: '2026-11-17T13:00:00Z' },   // terça (segunda foi feriado)
        { loja_slug: 'caxias', catalogo_id: CAT.lata, atual: 30, data_contagem: '2026-11-23', criado_em: '2026-11-23T13:00:00Z' },
        { loja_slug: 'itaquera', catalogo_id: CAT.lataSP, atual: 40, data_contagem: '2026-11-16', criado_em: '2026-11-16T13:00:00Z' },
        { loja_slug: 'itaquera', catalogo_id: CAT.lataSP, atual: 29, data_contagem: '2026-11-23', criado_em: '2026-11-23T13:00:00Z' },
      ];
      if (nome === 'vendidos:estoquePend') return [{ loja_slug: 'campo_grande', catalogo_id: CAT.lata, qtd_prevista: 2 }];
      if (nome === 'vendidos:estoqueRec') return [
        { qtd_recebida: 5, validado_em: '2026-11-18T12:32:59Z', gn_provisoes: { loja_slug: 'bangu', catalogo_id: CAT.lata } },
        { qtd_recebida: 2, validado_em: '2026-11-16T10:00:00Z', gn_provisoes: { loja_slug: 'bangu', catalogo_id: CAT.lata } },   // antes da contagem: já está nela
        { qtd_recebida: 1, validado_em: '2026-11-23T15:00:00Z', gn_provisoes: { loja_slug: 'bangu', catalogo_id: CAT.lata } },   // depois da contagem seguinte: é da semana nova
        { qtd_recebida: 5, validado_em: '2026-11-18T12:47:07Z', gn_provisoes: { loja_slug: 'bangu', catalogo_id: CAT.ks } },
        { qtd_recebida: 3, validado_em: '2026-11-19T12:00:00Z', gn_provisoes: { loja_slug: 'itaquera', catalogo_id: CAT.lataSP } },
      ];
      return fb === undefined ? [] : fb;
    };
    _vendGerOff = 0; await _loadVendidosGerencia();
    const el = document.getElementById('dash-section'); el.innerHTML = _buildVendidosPanel();
    const box = k => { const x = el.querySelector(`.vend-loja[data-loja="${k}"] .vend-estoque`); return x ? x.innerText.replace(/\s+/g, ' ') : ''; };
    const est = k => (_vendGerData.porLoja[k] || {}).estoque || {};
    const out = { b: est('BANGU'), cg: est('CAMPO GRANDE'), cx: est('CAXIAS'), it: est('ITAQUERA'), bTxt: box('BANGU'), cgTxt: box('CAMPO GRANDE'), cxTxt: box('CAXIAS'), rel: _vendRelatorioTexto(false).msg,
      largos: [...el.querySelectorAll('*')].filter(x => { const r = x.getBoundingClientRect(); return r.width && r.right > window.innerWidth + 1 && !x.closest('[style*="overflow-x:auto"]'); }).length };
    _vendGerOff = 1; await _loadVendidosGerencia(); el.innerHTML = _buildVendidosPanel();
    out.vigente = box('BANGU');
    return out;
  });
  check('Bangu lata: 126 + 5 cx×12 (60) − 53 = 133 de saída; recebimento antes da contagem e depois da seguinte ficam fora', e.b[37] && e.b[37].ent === 60 && e.b[37].saida === 133, e.b);
  check('…vendido 130 nos 7 dias → diferença +3, dentro da margem (verde)', e.b[37] && e.b[37].vendido === 130 && /lata 350 ml 126 \+60 −53 133 130 \+3/.test(e.bTxt), e.bTxt);
  check('Bangu KS: contagem igual nas duas segundas (156) → aviso "conferir se foi contado de novo"', e.b[36] && e.b[36].repetida && /KS 290 ml: contagem igual à da segunda anterior \(156\)/.test(e.bTxt), e.bTxt);
  check('Campo Grande: estoque subiu 28→50 sem recebimento → saída −22 e o aviso de Coca sem recebimento', e.cg[37] && e.cg[37].saida === -22 && /subiu sem recebimento confirmado/.test(e.cgTxt) && /2 cx pedidas pra esta semana estão "aguardando" no recebimento do app Lojas/.test(e.cgTxt), e.cgTxt);
  check('Caxias: contagem de terça vale como a da semana (feriado); vendido de 3/7 dias não dá diferença', e.cx[37] && e.cx[37].saida === 30 && /\(3\/7\)/.test(e.cxTxt) && /30 27 \(3\/7\) —/.test(e.cxTxt), e.cxTxt);
  check('Itaquera (SP, catálogo próprio ligado pelo item de origem): 40 + 36 − 29 = 47; vendido 35 → +12', e.it[37] && e.it[37].saida === 47 && e.it[37].vendido === 35, e.it);
  check('relatório leva a Coca × estoque com a conta e a diferença', /lata 350 ml: saída 133 \(126 \+ 60 − 53\) · vendido 130 · dif\. \+3/.test(e.rel) && /subiu sem recebimento confirmado/.test(e.rel), e.rel);
  check('semana em andamento: "fecha na segunda, com a contagem"', /fecha na segunda/.test(e.vigente), e.vigente);
  check('a tabela da Coca não estoura 360 px', e.largos === 0, e.largos);

  // ── 5. Aviso de gramatura muito baixa (caso real: Picanha de Sol Executivo com 0,15 g) ──
  const g = await page.evaluate(async () => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    _vendGerData.cadastro = [{ id: 'pe', grupo: 'prato', nome: 'PICANHA DE SOL EXECUTIVO', gramas: { picanha: 0.15 }, ativo: true, codigo_pdv: '100013' },
                             { id: 'p2', grupo: 'prato', nome: 'PICANHA DE SOL P2', gramas: { picanha: 400 }, ativo: true }];
    _vendCadAberto = true; renderDashboard();
    const cadEl = document.querySelector('.vend-cadastro');
    const out = { cab: cadEl.innerText.replace(/\s+/g, ' '), marcas: [...document.querySelectorAll('.vc-item')].map(x => x.dataset.id + ':' + !!x.querySelector('.vc-susp')) };
    const msgs = []; const conf0 = window.confirm;
    window.confirm = m => { msgs.push(m); return false; };
    const nPost = window.__posts0 = 0;
    await _vendCadSalvar(document.querySelector('.vc-item[data-id="pe"] button'));
    out.recusou = msgs[0] || '';
    // Corrigindo pra 150 g salva sem perguntar.
    msgs.length = 0;
    document.querySelector('.vc-item[data-id="pe"] .vc-g[data-carne="picanha"]').value = '150';
    await _vendCadSalvar(document.querySelector('.vc-item[data-id="pe"] button'));
    out.semPergunta = msgs.length === 0;
    // Importar das fichas com 0,15 g também pergunta.
    _vendSugestoes = { lista: [{ cod: '100013', nome: 'PICANHA DE SOL EXECUTIVO', gramas: { picanha: 0.15 }, obs: [], conferir: true }] };
    renderDashboard();
    document.querySelector('.vc-sug input').checked = true;
    await _vendSugAdicionar();
    out.sug = msgs[0] || '';
    window.confirm = conf0;
    return out;
  });
  const postsPe = posts.filter(x => (x.b || []).some(i => i.id === 'pe' || i.id === 'prato_100013'));
  check('cadastro marca o prato com 0,15 g ("gramatura muito baixa") e o cabeçalho conta 1', /⚠ 1 com gramatura muito baixa/.test(g.cab) && g.marcas.join() === 'pe:true,p2:false', g);
  check('salvar com 0,15 g pede confirmação explicando o erro provável; recusando, não grava', /Gramatura muito baixa em "PICANHA DE SOL EXECUTIVO": Picanha 0,15 g/.test(g.recusou) && /0,15 em vez de 150/.test(g.recusou), g.recusou);
  check('com 150 g salva direto (1 gravação, com 150 g)', g.semPergunta && postsPe.length === 1 && postsPe[0].b[0].gramas.picanha === 150, postsPe.map(x => x.b));
  check('importar das fichas com 0,15 g também pede confirmação', /PICANHA DE SOL EXECUTIVO: Picanha 0,15 g/.test(g.sug), g.sug);

  // ── 6. Pratos do cardápio sem gramatura: entram inativos, com aviso pra completar ──
  const pend = await page.evaluate(() => {
    _vendGerData.cadastro = [
      { id: 'card_pastel_camarao', grupo: 'prato', nome: 'PASTEL DE CAMARÃO', gramas: {}, ativo: false, atualizado_por: 'cardápio — falta gramatura' },
      { id: 'card_cabra_bao', grupo: 'prato', nome: 'CABRA BÃO (blend 120 g carne de sol)', gramas: { carne_sol: 120 }, ativo: false, atualizado_por: 'cardápio — conferir se o blend é 100% carne de sol' },
      { id: 'p2', grupo: 'prato', nome: 'PICANHA DE SOL P2', gramas: { picanha: 400 }, ativo: true },
      // Decisão tomada: o dono salvou zerado e inativo (blend não é carne de sol) — não é pendência.
      { id: 'card_rei_cangaco', grupo: 'prato', nome: 'REI DO CANGAÇO', gramas: {}, ativo: false, atualizado_por: 'Tiago' },
    ];
    _vendCadAberto = true; renderDashboard();
    const it = id => { const x = document.querySelector(`.vc-item[data-id="${id}"] .vc-pend`); return x ? x.innerText : ''; };
    return { cab: (document.querySelector('.vc-pend-n') || {}).innerText || '', pastel: it('card_pastel_camarao'), cabra: it('card_cabra_bao'), pic: it('p2'), rei: it('card_rei_cangaco') };
  });
  check('cabeçalho do cadastro conta "⏳ 2 aguardando gramatura"', /2 aguardando gramatura/.test(pend.cab), pend);
  check('prato sem gramatura mostra "Falta a gramatura — preencha as gramas, marque ativo e salve"; o do blend pede pra conferir; o ativo nada', /Falta a gramatura/.test(pend.pastel) && /conferir se o blend é 100% carne de sol — confira/.test(pend.cabra) && pend.pic === '', pend);
  check('prato que o dono já salvou zerado e inativo (decisão tomada) não conta como pendente nem mostra aviso', pend.rei === '' && /^⏳ 2 aguardando/.test(pend.cab.trim()), pend);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
