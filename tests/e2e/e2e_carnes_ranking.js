// 23/11/2026: "No painel de gestão na aba carne, tem como ter um relatório de desempenho,
// pras lojas terem a visão de como está o controle, da melhor pra pior loja? Vai ficar
// melhor agora que vai começar a ser lançado os que estão vendendo de fato."
//
// Fixture: a semana 16–22/11 REAL (checklist_carnes + checklist_diario do banco em 23/11).
// Medido nela: as lojas válidas ficam entre 2,10 e 2,52 kg por R$ mil; Campo Grande e
// Caxias têm saída negativa (Campo Grande daria −0,31 e ficaria em 1º por erro de
// contagem); Itaquera e Guarulhos não lançaram a contagem final.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const path = require('path');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const FX = require(path.join(__dirname, '..', 'fixtures', 'carnes_semana_2026-11-16.json'));
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-23T15:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url());
    const body = /checklist_carnes/.test(u) ? FX.carnes : /checklist_diario\?data_operacao/.test(u) && /venda_salao/.test(u) ? FX.fat : [];
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _loadCarnesGerencia === 'function' && typeof LOJAS_LISTA !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 25000 });

  const ler = () => page.evaluate(() => {
    const h = document.createElement('div'); h.innerHTML = _buildCarnesPanel();
    const box = h.querySelector('.carnes-rank');
    if (!box) return { semRanking: true };
    return {
      modo: box.getAttribute('data-modo'),
      ordem: [...box.querySelectorAll('.carnes-rank-linha')].map(l => LOJA_DISPLAY[l.getAttribute('data-loja')] || l.getAttribute('data-loja')),
      valores: [...box.querySelectorAll('.carnes-rank-valor')].map(v => v.textContent.trim()),
      fora: ((box.querySelector('.carnes-rank-fora') || {}).textContent || '').replace(/\s+/g, ' '),
      txt: box.textContent.replace(/\s+/g, ' '),
      antesDosCards: h.innerHTML.indexOf('carnes-rank') < h.innerHTML.indexOf('✅ contou'),
    };
  });

  // ── 1. Semana passada, sem vendidos: critério provisório kg por R$ mil ──
  await page.evaluate(async () => { LOJAS_LISTA = LOJAS_TODAS.slice(); _carnesGerOff = 0; await _loadCarnesGerencia(); });
  const a = await ler();
  check('o ranking aparece na aba Carnes, antes dos cards das lojas', !a.semRanking && a.antesDosCards, a);
  check('sem vendidos ainda: critério é kg por R$ mil, dito como PROVISÓRIO', a.modo === 'razao' && /PROVISÓRIO/.test(a.txt), a.txt && a.txt.slice(0, 300));
  check('ordem da melhor pra pior: São Gonçalo, Pedreira, Norte Shopping, Bangu, Nova América, Boulevard, Nova Iguaçu',
    JSON.stringify(a.ordem) === JSON.stringify(['São Gonçalo', 'Pedreira', 'Norte Shopping', 'Bangu', 'Nova América', 'Boulevard', 'Nova Iguaçu']), a.ordem);
  check('1º lugar mostra 2,10 kg/R$ mil e a distância da média', /^2,10 kg\/R\$ mil \(−?-?\d+% vs rede\)$/.test(a.valores[0] || ''), a.valores);
  check('Campo Grande NÃO ganha por erro: fica fora, por saída negativa', !a.ordem.includes('Campo Grande') && /Campo Grande: saída negativa em Carne de Sol, Carne Seca/.test(a.fora), a.fora);
  check('Caxias fora por saída negativa no camarão', /Caxias: saída negativa em Camarão/.test(a.fora), a.fora);
  check('Itaquera e Guarulhos fora por não lançarem a contagem', /Guarulhos: (não lançou a contagem|sem contagem)/.test(a.fora) && /Itaquera: (não lançou a contagem|sem contagem)/.test(a.fora), a.fora);
  check('Maglia não entra (nem no ranking nem fora)', !/Maglia/.test(a.txt), a.txt.slice(0, 200));
  check('média da rede aparece', /Média da rede: 2,\d\d kg por R\$ mil/.test(a.txt), a.txt);

  // ── 2. WhatsApp e PDF levam o ranking ──
  const rel = await page.evaluate(() => ({ w: (_carnesRelatorioTexto(true) || {}).msg || '', p: (_carnesPdfHtml() || {}).html || '' }));
  check('WhatsApp: traz o ranking com 1º São Gonçalo e os fora', /RANKING DE CONTROLE/.test(rel.w) && /1º São Gonçalo — 2,10/.test(rel.w) && /Fora do ranking\*: .*Campo Grande/.test(rel.w), rel.w.slice(0, 500));
  check('PDF: abre com a tabela do ranking', /Ranking de controle/.test(rel.p) && rel.p.indexOf('Ranking de controle') < rel.p.indexOf('Saída da semana, por loja'), rel.p.slice(0, 200));
  const relFiltro = await page.evaluate(() => { _carnesRelatorioLojasFiltro = ['BANGU']; const w = _carnesRelatorioTexto(true).msg; _carnesRelatorioLojasFiltro = []; return w; });
  check('relatório filtrado pra Bangu: só a posição dela (4º de 7), sem nome de outra loja', /Bangu: 4º de 7 — 2,29/.test(relFiltro) && !/São Gonçalo|Pedreira|Campo Grande/.test(relFiltro), relFiltro.slice(0, 400));
  const pdfFiltro = await page.evaluate(() => { _carnesRelatorioLojasFiltro = ['CAMPO GRANDE']; const h = _carnesPdfHtml().html; _carnesRelatorioLojasFiltro = []; return h; });
  check('PDF filtrado pra Campo Grande: diz que está fora e por quê, sem expor as outras', /Campo Grande \(saída negativa/.test(pdfFiltro) && !/São Gonçalo/.test(pdfFiltro), pdfFiltro.slice(0, 300));

  // ── 3. Com vendidos de 7 dias: o critério passa a ser o desvio ──
  const b = await page.evaluate(() => {
    const P = _carnesGerData.porLoja;
    // devia = saída real × fator por corte → desvio conhecido. Bangu: tudo bate (0%).
    // Pedreira: 10% a mais em todo corte. São Gonçalo: carne de sol 30% a mais.
    const monta = (k, fator) => {
      const tot = {}; CARNES_DEF_HOME.forEach(c => { const r = _carnesDoCorte(P[k].carnes, c.key); tot[c.key] = r.venda / (fator[c.key] || 1) / 7; });
      P[k].vendDia = [0, 1, 2, 3, 4, 5, 6].map(() => ({ ...tot })); P[k].rodizioLancado = false;
    };
    monta('BANGU', {}); monta('PEDREIRA', { carne_sol: 1.1, picanha: 1.1, carne_seca: 1.1, camarao: 1.1 }); monta('SÃO GONÇALO', { carne_sol: 1.3 });
    P['NORTE SHOPPING'].vendDia = [{ carne_sol: 1 }, { carne_sol: 1 }, { carne_sol: 1 }, null, null, null, null];
    return true;
  });
  const c = await ler();
  check('com vendidos completos o critério vira o desvio (o controle de verdade)', c.modo === 'vendidos' && /pratos vendidos explicam/.test(c.txt), c.txt && c.txt.slice(0, 200));
  check('ordem por desvio: Bangu (0%), Pedreira (10%), São Gonçalo', JSON.stringify(c.ordem) === JSON.stringify(['Bangu', 'Pedreira', 'São Gonçalo']), c.ordem);
  check('Bangu mostra desvio 0%, sem "+0,0 kg" de resíduo', /^desvio 0%$/.test(c.valores[0] || ''), c.valores);
  check('Pedreira mostra o desvio em % e em kg a mais', /^desvio 10% \(\+\d+,\d kg\)$/.test(c.valores[1] || ''), c.valores);
  check('quem não tem 7/7 de vendidos sai do ranking dizendo quantos dias lançou', /Norte Shopping: vendidos incompletos \(3\/7 dias lançados\)/.test(c.fora) && /Nova América: vendidos incompletos \(0\/7/.test(c.fora), c.fora);
  check('saída negativa continua fora mesmo com vendidos', /Campo Grande: saída negativa/.test(c.fora), c.fora);

  // ── 4. Semana vigente: sem contagem de fechamento, sem ranking (e diz isso) ──
  const v = await page.evaluate(async () => { _carnesGerOff = 1; await _loadCarnesGerencia(); const h = document.createElement('div'); h.innerHTML = _buildCarnesPanel(); const r = h.querySelector('.carnes-rank'); return { modo: r && r.getAttribute('data-modo'), txt: r ? r.textContent : '', w: (_carnesRelatorioTexto(true) || {}).msg || '' }; });
  check('semana vigente: avisa que o ranking sai com a semana fechada', v.modo === 'vigente' && /semana fechada/.test(v.txt), v);
  check('…e o WhatsApp da semana vigente não inventa ranking', !/RANKING/.test(v.w), v.w.slice(0, 200));

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
