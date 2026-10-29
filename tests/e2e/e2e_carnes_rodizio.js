// "Quero também relacionar a quantidade de carne de sol com a quantidade de rodízios
//  realizados, utilizando uma média de 250 g de carne de sol por rodízio."
//  + "Manter 250g no meio rodízio também."
//
// MEDIDO no banco antes de escolher como mostrar, e o número muda a leitura:
//
//   Outubro inteiro, rede: 1.089 rodízios → 272 kg a 250 g cada.
//   Só a semana 19/10:     ~1.100 kg de carne de sol de saída real.
//   Bangu, semana 19/10:   61 rodízios = 15,3 kg esperados, 179,2 kg de saída real.
//
// O rodízio responde por volta de 6% da carne de sol: ela é vendida sobretudo fora dele.
// Logo isto NÃO é um desvio — rotular como "+1.075% acima do esperado" daria esse número em
// toda loja, toda semana, e viraria alarme que ninguém olha. É PARTICIPAÇÃO: quanto da saída
// vem do rodízio e quanto vem do resto do cardápio. A conta pedida é a mesma; o que muda é
// o que a tela afirma sobre ela.
//
// A outra regra vem do dono: meia porção conta como um rodízio inteiro na média de 250 g.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const corte = (ini, ent, fim) => ({ inicial: String(ini), ent_qua: String(ent),
  contagem_final: fim === null ? '' : String(fim) });

// Semana fechada 19/10–25/10, com os números reais de Bangu: 92,3 + 179,2 − 92,3 = 179,2 kg
// de saída. (A igualdade entre inicial e contagem_final é o defeito já corrigido no
// Check-list; aqui ela só serve pra reproduzir a saída que o banco tem hoje.)
const LINHAS = [
  { loja: 'Bangu', semana_inicio: '2026-10-19', updated_at: '2026-10-26T14:00:00Z',
    carnes: { carne_sol: corte(92.3, 179.2, 92.3), picanha: corte(20, 0, 10),
              carne_seca: corte(8, 0, 4), camarao: corte(4, 0, 2) } },
  // Caxias contou e NÃO teve rodízio lançado na semana — tem que dizer isso, não calcular 0.
  { loja: 'Caxias', semana_inicio: '2026-10-19', updated_at: '2026-10-26T14:00:00Z',
    carnes: { carne_sol: corte(204.6, 53.06, 140.85), picanha: corte(30, 0, 15),
              carne_seca: corte(6, 0, 3), camarao: corte(3, 0, 1) } },
  // Maglia não entra no buffet (GN_BUFFET_FORA) e nem aparece na aba.
  { loja: 'Maglia', semana_inicio: '2026-10-19', updated_at: '2026-10-26T12:00:00Z',
    carnes: { carne_sol: corte(50, 0, 25), picanha: corte(5, 0, 2),
              carne_seca: corte(2, 0, 1), camarao: corte(1, 0, 0.5) } },
];

// 61 rodízios de Bangu: 40 inteiras + 21 meias. A meia conta como UMA — então 61, não 50,5.
const ROD = [
  { loja: 'BANGU', data: '2026-10-20', rodizio_inteira: 25, rodizio_meia: 11 },
  { loja: 'BANGU', data: '2026-10-22', rodizio_inteira: 15, rodizio_meia: 10 },
  { loja: 'MAGLIA', data: '2026-10-21', rodizio_inteira: 99, rodizio_meia: 99 },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-26T15:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _buildCarnesPanel === 'function' && typeof _carnesRodizioEsperado === 'function'
               && typeof CARNE_SOL_POR_RODIZIO_KG === 'number' && Array.isArray(LOJAS_LISTA); }
        catch (e) { return false; }
      }, null, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const montar = (opts) => page.evaluate(async ({ LINHAS, ROD, opts }) => {
    const orig = window.gnFetchJson;
    const urls = [];
    window.gnFetchJson = async (url, h, c, fallback) => {
      urls.push(url);
      if (/checklist_carnes/.test(url)) return LINHAS;
      if (/gn_caixa_fechamento/.test(url)) return opts.rodFalha ? fallback : (opts.semRodizio ? [] : ROD);
      if (/checklist_diario/.test(url)) return [];
      return [];
    };
    _carnesGerLoaded = false; _carnesGerData = null; _carnesGerOff = 0;
    _carnesRelatorioLojasFiltro = [];
    try { await _loadCarnesGerencia(); } finally { window.gnFetchJson = orig; }
    const html = _buildCarnesPanel();
    const el = document.createElement('div'); el.innerHTML = html;
    const cards = {};
    [...el.querySelectorAll('div')].forEach(dv => {
      if (!/border-left:\s*3px solid/.test(dv.getAttribute('style') || '')) return;
      const t = dv.textContent.replace(/\s+/g, ' ').trim();
      const nome = t.split(/✅|⚠|💰|sem faturamento/)[0].trim();
      if (nome) cards[nome] = t;
    });
    return { txt: el.textContent.replace(/\s+/g, ' ').trim(), urls, cards,
      rodizios: (_carnesGerData.porLoja.BANGU || {}).rodizios,
      wpp: (_carnesRelatorioTexto(true) || {}).msg || null };
  }, { LINHAS, ROD, opts: opts || {} });

  const r = await montar({});

  check('a aba busca os rodízios do fechamento de caixa da semana',
    r.urls.some(u => /gn_caixa_fechamento/.test(u) && /rodizio_inteira/.test(u)
                  && /data=gte\.2026-10-19/.test(u) && /data=lte\.2026-10-25/.test(u)),
    JSON.stringify(r.urls));
  check('a média é 250 g por rodízio',
    await page.evaluate(() => CARNE_SOL_POR_RODIZIO_KG) === 0.25, 'constante');

  // ══ A regra do dono: meia porção conta como UM rodízio ════════════════════════════
  // 40 inteiras + 21 meias. Contando a meia como meia daria 50,5; como uma dá 61.
  check('meia porção conta como um rodízio inteiro: 61, não 50,5',
    r.rodizios === 61, String(r.rodizios));
  const bangu = r.cards['Bangu'] || '';
  check('e o card mostra os 61 rodízios da semana',
    /61 rodízios/.test(bangu), bangu.slice(0, 300));
  check('com os kg que isso dá a 250 g (15,3 kg)',
    /15,3 kg de carne de sol a 250 g cada/.test(bangu), bangu.slice(0, 400));

  // ══ A leitura: participação, não desvio ══════════════════════════════════════════
  // 15,3 de 179,2 = 8,5% → 9% arredondado. E o resto são 163,9 kg.
  check('mostra quanto da saída é rodízio (9%)',
    /9% da saída/.test(bangu), bangu.slice(0, 400));
  // 179,2 − 15,25 = 163,95, que a tela arredonda em 1 decimal: 164,0.
  check('e nomeia o resto como saída dos outros pratos (164,0 kg)',
    /164,0 kg saíram pelos outros pratos/.test(bangu), bangu.slice(0, 600));
  // O ponto da medição: NÃO apresentar como desvio.
  check('não afirma "acima do esperado" — o rodízio não é o consumo todo',
    !/acima do esperado/.test(r.txt), r.txt.slice(0, 300));
  check('e não mostra o percentual de desvio (+1.075%), que seria o número em toda loja',
    !/1\.?075/.test(r.txt), r.txt.slice(0, 300));
  check('a tela explica a faixa de ~6% da rede, pra saber o que é fora do normal',
    /rodízio fica por volta de 6%/.test(r.txt), r.txt.slice(-400));
  check('e diz que meia porção conta como uma',
    /Meia porção conta como um rodízio/.test(bangu), bangu.slice(0, 500));

  // ══ Loja sem rodízio lançado: diz isso, não calcula zero ═════════════════════════
  const caxias = r.cards['Caxias'] || '';
  check('loja sem rodízio lançado é avisada, em vez de aparecer com 0 rodízios',
    /não lançados no fechamento de caixa/.test(caxias), caxias.slice(0, 400));
  check('e não inventa uma participação de 0%',
    !/0% da saída/.test(caxias), caxias.slice(0, 400));

  // ══ Maglia fora do buffet e fora da aba ══════════════════════════════════════════
  check('a Maglia não aparece na aba (não usa Carnes)', !/Maglia/.test(r.txt), r.txt.slice(0, 200));
  check('e os 198 rodízios dela não entram em conta nenhuma', !/198 rodízios/.test(r.txt), r.txt.slice(0, 300));

  // ══ Loja fora do buffet não ganha comparação de rodízio ══════════════════════════
  // A Maglia já está fora da aba inteira, então o guard de GN_BUFFET_FORA não era
  // exercitado por nada — mutação confirmou que tirá-lo passava sem falhar. Aqui a lista
  // é a de verdade do app, com uma loja que ESTÁ na aba, pra o guard ter o que fazer.
  const fora = await page.evaluate(async ({ LINHAS, ROD }) => {
    const origFora = window.GN_BUFFET_FORA;
    window.GN_BUFFET_FORA = ['MAGLIA', 'CAXIAS'];
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url) => {
      if (/checklist_carnes/.test(url)) return LINHAS;
      if (/gn_caixa_fechamento/.test(url)) return ROD.concat([
        { loja: 'CAXIAS', data: '2026-10-21', rodizio_inteira: 70, rodizio_meia: 7 }]);
      return [];
    };
    _carnesGerLoaded = false; _carnesGerData = null; _carnesGerOff = 0;
    try { await _loadCarnesGerencia(); } finally {
      window.gnFetchJson = orig; window.GN_BUFFET_FORA = origFora;
    }
    const el = document.createElement('div'); el.innerHTML = _buildCarnesPanel();
    let caxias = '';
    [...el.querySelectorAll('div')].forEach(dv => {
      if (!/border-left:\s*3px solid/.test(dv.getAttribute('style') || '')) return;
      const t = dv.textContent.replace(/\s+/g, ' ').trim();
      if (/^Caxias/.test(t)) caxias = t;
    });
    return { caxias, rodizios: (_carnesGerData.porLoja.CAXIAS || {}).rodizios,
             banguSegue: (_carnesGerData.porLoja.BANGU || {}).rodizios };
  }, { LINHAS, ROD });
  check('loja fora do buffet não acumula rodízio nenhum',
    fora.rodizios === 0, JSON.stringify(fora));
  check('e o card dela não mostra bloco de rodízio',
    !/rodízio/i.test(fora.caxias), fora.caxias.slice(0, 400));
  check('sem afetar as outras lojas (Bangu segue com 61)',
    fora.banguSegue === 61, JSON.stringify(fora));

  // ══ O relatório leva os mesmos números ═══════════════════════════════════════════
  check('o relatório traz os rodízios e os kg a 250 g',
    /61 rodízios · 15,3 kg de carne de sol a 250 g cada/.test(r.wpp || ''), (r.wpp || '').slice(0, 500));
  check('e a participação, não um desvio',
    /9% da saída de 179,2 kg/.test(r.wpp || '') && !/acima/.test(r.wpp || ''), (r.wpp || '').slice(0, 500));

  // ══ Rodízio é complemento: cair não leva os kg embora ════════════════════════════
  const falha = await montar({ rodFalha: true });
  check('se a consulta de rodízio falhar, os kg continuam na tela',
    /179,2 kg/.test(falha.txt), falha.txt.slice(0, 300));
  check('e a tela avisa que a comparação ficou de fora',
    /comparação com os 250 g por rodízio fica de fora/.test(falha.txt.replace(/ /g, ' ')),
    falha.txt.slice(0, 400));
  check('sem inventar rodízio nenhum', !/61 rodízios/.test(falha.txt), falha.txt.slice(0, 300));

  const semRod = await montar({ semRodizio: true });
  check('semana sem nenhum rodízio lançado na rede não mostra participação',
    !/% da saída/.test(semRod.txt), semRod.txt.slice(0, 300));
  check('e os kg seguem lá', /179,2 kg/.test(semRod.txt), semRod.txt.slice(0, 300));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
