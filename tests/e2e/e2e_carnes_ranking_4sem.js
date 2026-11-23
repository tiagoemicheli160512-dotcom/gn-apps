// Ranking de controle das ÚLTIMAS 4 SEMANAS (aba Carnes do Painel), 23/11/2026.
// Fixture: as 4 semanas reais de 26/10 a 22/11 (checklist_carnes + checklist_diario).
// Resultado esperado calculado À PARTE, direto no banco (SQL), somando Σ(início + compras −
// contagem) e Σ venda das 4 semanas: Nova Iguaçu 1,60 · São Gonçalo 1,91 · Pedreira 1,95 ·
// Norte Shopping 2,03 · Boulevard 2,06 · Nova América 2,18 · Caxias 2,28 · Bangu 2,32.
// Fora: Campo Grande, Guarulhos e Itaquera (semana sem contagem).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const path = require('path');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const FX = require(path.join(__dirname, '..', 'fixtures', 'carnes_4semanas_2026-10-26.json'));
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };
const faixa = (u, campo) => { const a = (u.match(new RegExp(campo + '=gte\\.([\\d-]+)')) || [])[1], b = (u.match(new RegExp(campo + '=lte\\.([\\d-]+)')) || [])[1]; return [a, b]; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-23T15:00:00-03:00');
  let chamadasCarnes = 0, falharCarnes = false;
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url());
    let body = [];
    if (/checklist_carnes/.test(u)) {
      chamadasCarnes++;
      if (falharCarnes) return r.abort('internetdisconnected');
      const [a, b] = faixa(u, 'semana_inicio'); body = FX.carnes.filter(x => x.semana_inicio >= a && x.semana_inicio <= b);
    } else if (/checklist_diario\?data_operacao/.test(u) && /venda_salao/.test(u)) {
      const [a, b] = faixa(u, 'data_operacao'); body = FX.fat.filter(x => x.data_operacao >= a && x.data_operacao <= b);
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _loadCarnesGerencia === 'function' && typeof LOJAS_LISTA !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 25000 });

  const ler = () => page.evaluate(() => {
    const h = document.createElement('div'); h.innerHTML = _buildCarnesPanel();
    const box = h.querySelector('.carnes-rank'); if (!box) return { semRanking: true };
    return {
      per: box.getAttribute('data-per'), modo: box.getAttribute('data-modo'),
      chipOn: (box.querySelector('.carnes-rank-per.on') || {}).textContent,
      ordem: [...box.querySelectorAll('.carnes-rank-linha')].map(l => LOJA_DISPLAY[l.getAttribute('data-loja')] || l.getAttribute('data-loja')),
      valores: [...box.querySelectorAll('.carnes-rank-valor')].map(v => v.textContent.trim()),
      trend: [...box.querySelectorAll('.carnes-rank-trend')].map(v => v.textContent.replace(/\s+/g, ' ').trim()),
      fora: ((box.querySelector('.carnes-rank-fora') || {}).textContent || '').replace(/\s+/g, ' '),
      txt: box.textContent.replace(/\s+/g, ' '),
    };
  });
  const esperar4 = () => page.waitForFunction(() => _carnesRank4 && !_carnesRank4.carregando, null, { timeout: 15000 });

  await page.evaluate(async () => { LOJAS_LISTA = LOJAS_TODAS.slice(); _carnesGerOff = 0; _carnesRankPer = 'sem'; _carnesRank4 = null; await _loadCarnesGerencia(); });
  const s = await ler();
  check('abre em "Esta semana" (o que já existia), com a opção de 4 semanas', s.per === 'sem' && /Esta semana/.test(s.chipOn) && /Últimas 4 semanas/.test(s.txt), s);
  const antes = chamadasCarnes;

  // ── Troca pra 4 semanas ──
  await page.evaluate(() => _carnesRankTrocar('4sem'));
  await esperar4();
  const q = await ler();
  check('busca as 4 semanas (4 consultas de contagem)', chamadasCarnes - antes === 4, chamadasCarnes - antes);
  check('o card mostra o período: 26/10 a 22/11', q.per === '4sem' && /últimas 4 semanas \(26\/10 a 22\/11\)/.test(q.txt), q.txt.slice(0, 300));
  check('critério diz que soma as 4 semanas e que é provisório', /somando as 4 semanas/.test(q.txt) && /PROVISÓRIO/.test(q.txt), q.txt.slice(0, 300));
  const esperado = ['Nova Iguaçu', 'São Gonçalo', 'Pedreira', 'Norte Shopping', 'Boulevard', 'Nova América', 'Caxias', 'Bangu'];
  check('ordem igual à do cálculo feito direto no banco', JSON.stringify(q.ordem) === JSON.stringify(esperado), q.ordem);
  check('valores batem com o banco (1º 1,60 · último 2,32)', /^1,60 kg\/R\$ mil/.test(q.valores[0] || '') && /^2,32 kg\/R\$ mil/.test(q.valores[7] || ''), q.valores);
  check('fora: Campo Grande, Guarulhos e Itaquera, por semana sem contagem',
    /Campo Grande: sem contagem na semana de/.test(q.fora) && /Guarulhos: sem contagem na semana de/.test(q.fora) && /Itaquera: sem contagem na semana de/.test(q.fora), q.fora);
  check('cada loja mostra a posição semana a semana', q.trend.length === 8 && q.trend.every(t => /^semana a semana: (\d+º|—) · (\d+º|—) · (\d+º|—) · (\d+º|—)/.test(t)), q.trend);
  const ni = q.trend[0] || '';
  check('Nova Iguaçu: semana negativa (02/11) entra na soma e aparece como aviso, sem tirar do ranking', /— · /.test(ni) && /saída negativa em 02\/11 \(compensada na soma\)/.test(ni), ni);
  check('Nova Iguaçu era a última na semana 16/11 e é a 1ª nas 4 semanas (por isso a visão existe)', /· 7º$|· 7º ·/.test(ni.replace(/ · ⚠.*/, '')), ni);

  check('Boulevard, colado na média, aparece como "na média da rede" (não "−0%")', /^2,06 kg\/R\$ mil \(na média da rede\)$/.test(q.valores[4] || ''), q.valores);
  // ── Relatórios seguem a escolha ──
  const rel = await page.evaluate(() => ({ w: _carnesRelatorioTexto(true).msg, p: _carnesPdfHtml().html }));
  check('WhatsApp: ranking das 4 semanas com a tendência', /RANKING DE CONTROLE — da melhor pra pior\* — últimas 4 semanas \(26\/10 a 22\/11\)/.test(rel.w) && /1º Nova Iguaçu — 1,60 .*\(semanas: /.test(rel.w), rel.w.slice(0, 600));
  check('PDF: título com o período e a tendência por loja', /últimas 4 semanas \(26\/10 a 22\/11\)/.test(rel.p) && /semanas: /.test(rel.p), rel.p.slice(0, 300));
  const relF = await page.evaluate(() => { _carnesRelatorioLojasFiltro = ['BANGU']; const w = _carnesRelatorioTexto(true).msg; _carnesRelatorioLojasFiltro = []; return w; });
  check('filtrado pra Bangu: só a posição dela nas 4 semanas (8º de 8)', /Bangu: 8º de 8 — 2,32/.test(relF) && !/Nova Iguaçu|São Gonçalo/.test(relF), relF.slice(0, 400));

  // ── Navegar de semana recarrega as 4 do novo ponto; voltar pra semana volta ao de antes ──
  await page.evaluate(async () => { _carnesNavSemana(-1); await new Promise(r => setTimeout(r, 50)); });
  await page.waitForFunction(() => _carnesGerLoaded && _carnesRank4 && _carnesRank4.base === -1 && !_carnesRank4.carregando, null, { timeout: 15000 });
  const n = await ler();
  check('voltando uma semana, o período anda junto (19/10 a 15/11)', /19\/10 a 15\/11/.test(n.txt), n.txt.slice(0, 200));
  await page.evaluate(async () => { _carnesGerOff = 0; await _loadCarnesGerencia(); _carnesRankTrocar('sem'); });
  const v = await ler();
  check('"Esta semana" volta ao ranking semanal de antes (1º São Gonçalo)', v.per === 'sem' && v.ordem[0] === 'São Gonçalo', v.ordem);

  // ── Semana vigente: o semanal não existe, mas as 4 fechadas sim ──
  await page.evaluate(async () => { _carnesGerOff = 1; await _loadCarnesGerencia(); _carnesRankTrocar('4sem'); });
  await esperar4();
  const vg = await ler();
  check('na semana vigente, "4 semanas" mostra as 4 fechadas (26/10 a 22/11)', vg.per === '4sem' && /26\/10 a 22\/11/.test(vg.txt) && vg.ordem[0] === 'Nova Iguaçu', vg.txt.slice(0, 200));

  // ── Critério por vendidos nas 4 semanas ──
  const vd = await page.evaluate(() => {
    const sems = JSON.parse(JSON.stringify(_carnesRank4.semanas));
    // devia = saída real ÷ fator → desvio conhecido. Pedreira: tudo bate. Norte: +20% na carne de sol.
    // São Gonçalo: vendidos em só 3 das 4 semanas → fica fora dizendo isso.
    const monta = (w, k, fator) => { const d = w.porLoja[k]; const tot = {}; CARNES_DEF_HOME.forEach(c => { tot[c.key] = _carnesDoCorte(d.carnes, c.key).venda / (fator[c.key] || 1) / 7; }); d.vendDia = [0,1,2,3,4,5,6].map(() => ({ ...tot })); d.rodizioLancado = false; };
    sems.forEach((w, i) => { monta(w, 'PEDREIRA', {}); monta(w, 'NORTE SHOPPING', { carne_sol: 1.2 }); if (i > 0) monta(w, 'SÃO GONÇALO', {}); });
    const rk = _carnesRanking4(sems);
    return { modo: rk.modo, ordem: rk.ranq.map(x => x.nome), sg: (rk.fora.find(x => x.k === 'SÃO GONÇALO') || {}).motivo, p: _carnesRankValorTxt(rk, rk.ranq[0]) };
  });
  check('4 semanas com vendidos: critério vira o desvio, Pedreira (0%) antes do Norte', vd.modo === 'vendidos' && JSON.stringify(vd.ordem) === JSON.stringify(['Pedreira', 'Norte Shopping']) && /^desvio 0%$/.test(vd.p), vd);
  check('quem tem vendidos em só 3 das 4 semanas fica fora, dizendo isso', vd.sg === 'vendidos completos em só 3 das 4 semanas', vd);

  // ── Falha de rede: diz e oferece tentar de novo; não inventa ranking ──
  falharCarnes = true;
  await page.evaluate(async () => { _carnesRank4 = null; _carnesGerOff = 0; _carnesRankPer = '4sem'; await _carnesCarregar4(); });
  const f = await ler();
  check('sem rede pras 4 semanas: avisa e oferece "Tentar de novo"', f.modo === 'erro' && /Tentar de novo/.test(f.txt), f);
  falharCarnes = false;

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
