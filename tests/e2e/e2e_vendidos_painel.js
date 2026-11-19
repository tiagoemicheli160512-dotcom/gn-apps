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

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
