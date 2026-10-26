// "Precisava trazer essa aba [Carnes] pro app home painel de gestão (...) mantendo o padrão
// da aba, e ter o padrão de selecionar por loja ou selecionar todas de uma vez, como na
// foto do barril."
//
// E junto: "precisava entender por que algumas lojas sobem certinho a contagem que é feita
// segunda que fecha a semana passada, e outras não."
//
// A resposta está medida no banco e documentada no cabeçalho da aba, em gn-home.html: a
// semana passada só ganha contagem quando a loja faz o fechamento de 2ª no Check-list, que
// PROPAGA o valor pra trás. Não é upload que falha — é fechamento que não foi feito. Por
// isso o que esta suíte mais cobra é que a aba DIGA isso: loja sem contagem tem que
// aparecer com nome, não virar tela vazia (que é o que o app Pedidos fazia e o que criou a
// dúvida).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Semana 19/10 a 25/10 — a mesma do print do dono.
const corte = (ini, ent, fim) => ({ inicial: String(ini), ent_qua: String(ent), contagem_final: fim === null ? '' : String(fim) });
const LINHAS = [
  // Bangu contou: 273,1 + 300 − 352,4 = 220,7 kg (os números do print do app Pedidos).
  { loja: 'Bangu', semana_inicio: '2026-10-19', updated_at: '2026-10-26T14:00:00Z',
    carnes: { carne_sol: corte(273.1, 300, 352.4), picanha: corte(108.2, 169.3, 60.1),
              carne_seca: corte(30.3, 40, 41.2), camarao: corte(10, 0, 4) } },
  // Nova América: chkKey com acento, userKey sem — as duas pontas têm que casar.
  { loja: 'Nova América', semana_inicio: '2026-10-19', updated_at: '2026-10-26T13:00:00Z',
    carnes: { carne_sol: corte(100, 0, 40), picanha: corte(50, 0, 20),
              carne_seca: corte(10, 0, 5), camarao: corte(5, 0, 1) } },
  // Nova Iguaçu grava como "Rancho": sem contagem (só a linha da virada, com inicial).
  { loja: 'Rancho', semana_inicio: '2026-10-19', updated_at: '2026-10-25T21:03:00Z',
    carnes: { carne_sol: corte(80, 0, null), picanha: corte(40, 0, null),
              carne_seca: corte(8, 0, null), camarao: corte(4, 0, null) } },
  // Caxias contou SEM inicial: a venda estimada vira a contagem invertida, e isso tem que
  // aparecer na tela em vez de passar por número bom.
  { loja: 'Caxias', semana_inicio: '2026-10-19', updated_at: '2026-10-26T14:21:00Z',
    carnes: { carne_sol: { inicial: '', ent_qua: '0', contagem_final: '30' },
              picanha: corte(20, 0, 10), carne_seca: corte(5, 0, 2), camarao: corte(2, 0, 1) } },
  // Linha gravada fora da segunda (sábado 24/10) — a busca é por intervalo, tem que achar.
  { loja: 'Guarulhos', semana_inicio: '2026-10-24', updated_at: '2026-10-26T01:01:00Z',
    carnes: { carne_sol: corte(60, 0, 25), picanha: corte(30, 0, 12),
              carne_seca: corte(6, 0, 3), camarao: corte(3, 0, 1) } },
  // Maglia com contagem: não usa a feature, não pode nem aparecer.
  { loja: 'Maglia', semana_inicio: '2026-10-19', updated_at: '2026-10-26T12:00:00Z',
    carnes: { carne_sol: corte(999, 0, 1), picanha: corte(1, 0, 1),
              carne_seca: corte(1, 0, 1), camarao: corte(1, 0, 1) } },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  // Segunda 26/10/2026: "semana passada" = 19/10 a 25/10, igual ao print.
  await CAMINHOS.fixarRelogio(ctx, '2026-10-26T15:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _buildCarnesPanel === 'function' && Array.isArray(LOJAS_LISTA); }
        catch (e) { return false; }
      }, null, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const montar = (opts) => page.evaluate(async ({ LINHAS, opts }) => {
    const orig = window.gnFetchJson;
    const urls = [];
    window.gnFetchJson = async (url, h, c, fallback) => {
      urls.push(url);
      if (opts.falhar) return fallback;
      return /checklist_carnes/.test(url) ? LINHAS : [];
    };
    _carnesGerLoaded = false; _carnesGerData = null; _carnesGerOff = opts.off || 0;
    _carnesRelatorioLojasFiltro = opts.filtro || [];
    try { await _loadCarnesGerencia(); } finally { window.gnFetchJson = orig; }
    const html = _buildCarnesPanel();
    const el = document.createElement('div'); el.innerHTML = html;
    // O bloco de aviso, separado: "não lançaram" aparece no texto inteiro por causa das
    // lojas que não têm linha NENHUMA na fixture, então o texto todo não serve pra provar
    // nada sobre quem tem linha mas não contou. Mutação confirmou que passava à toa.
    const aviso = [...el.querySelectorAll('div')]
      .map(d => d.textContent.replace(/\s+/g, ' ').trim())
      // Os nomes ficam num irmão do título, então filtrar só por "não lançaram" pegava o
      // título e voltava sem nome nenhum. O bloco certo é o que tem as duas coisas.
      .filter(t => /não lançaram a contagem/.test(t) && /A contagem fecha na segunda/.test(t))
      .sort((a, b) => a.length - b.length)[0] || '';
    return { txt: el.textContent.replace(/\s+/g, ' ').trim(), html, urls, aviso,
             wpp: (typeof _carnesRelatorioTexto === 'function' && _carnesRelatorioTexto(true) || {}).msg || null };
  }, { LINHAS, opts: opts || {} });

  const r = await montar({});

  check('a aba 🥩 Carnes existe na barra do Painel',
    await page.evaluate(() => /_setDashTab\('carnes'\)/.test(document.documentElement.innerHTML)));
  check('a aba abre na semana passada: 19/10 – 25/10',
    /19\/10 – 25\/10/.test(r.txt), r.txt.slice(0, 160));
  check('a consulta cobre a semana inteira, não só a segunda',
    r.urls.some(u => /semana_inicio=gte\.2026-10-19/.test(u) && /semana_inicio=lte\.2026-10-25/.test(u)), JSON.stringify(r.urls));

  // ── A conta, com os números do print ────────────────────────────────────────────────
  check('Bangu: 273,1 + 300 − 352,4 = 220,7 kg de Carne de Sol',
    /220,7 kg/.test(r.txt), r.txt.match(/Carne de Sol[^·]{0,90}/));
  check('e mostra a conta por extenso, não só o resultado',
    /início 273,1 \+ compras 300,0 − contagem 352,4/.test(r.txt), r.txt.slice(0, 400));

  // ── Quem não lançou tem NOME, e é o ponto do pedido ─────────────────────────────────
  // Nova Iguaçu TEM linha da semana (com inicial, gravada na virada) e NÃO tem contagem —
  // é o caso exato que o dono descreveu. Tem que estar na lista de cobrança pelo nome.
  check('loja com linha mas sem contagem é cobrada pelo nome',
    /Nova Iguaçu/.test(r.aviso), 'aviso: ' + r.aviso);
  check('e quem contou não entra na lista de cobrança',
    !/Bangu/.test(r.aviso) && !/Caxias/.test(r.aviso), 'aviso: ' + r.aviso);
  check('e o card dela diz "não lançou", não um zero',
    /não lançou/.test(r.txt), r.txt);
  check('diz onde a contagem é feita, pra quem for cobrar',
    /aba Contagem do app Lojas/.test(r.txt), r.txt.slice(-300));

  // ── Inicial ausente não pode passar por número bom ──────────────────────────────────
  check('contagem sem estoque inicial é marcada na tela',
    /sem inicial/.test(r.txt), r.txt);

  // ── Chave divergente e linha fora da segunda ────────────────────────────────────────
  check('Nova América casa "Nova América" com "NOVA AMERICA" e aparece com contagem',
    /Nova América/.test(r.txt) && /60,0 kg/.test(r.txt), r.txt);
  check('linha gravada no sábado (24/10) ainda é achada: Guarulhos contou',
    /Guarulhos/.test(r.txt) && !/Guarulhos[^⚠]{0,40}não lançou/.test(r.txt), r.txt);

  // ── Maglia nem aparece ──────────────────────────────────────────────────────────────
  check('a Maglia não aparece na aba (não usa Carnes)', !/Maglia/.test(r.txt), r.txt);
  check('e os 999 dela não entram em conta nenhuma', !/999/.test(r.txt), r.txt);

  // ── Seleção por loja, padrão do Barris ──────────────────────────────────────────────
  check('tem caixa de seleção por loja, com "nenhuma marcada = todas"',
    /nenhuma marcada = todas/.test(r.txt), r.txt.slice(0, 200));
  check('e os três botões de relatório do padrão',
    /gerarWppCarnes\(\)/.test(r.html) && /gerarPDFCarnes\(\)/.test(r.html) && /enviarPDFCarnesWpp\(\)/.test(r.html));

  const umaLoja = await montar({ filtro: ['BANGU'] });
  check('marcando uma loja, o relatório sai só dela',
    /BANGU|Bangu/.test(umaLoja.wpp || '') && !/Caxias/.test(umaLoja.wpp || ''), (umaLoja.wpp || '').slice(0, 220));
  check('e o título do relatório diz de quem é',
    /CONTROLE DE CARNES — Bangu/.test(umaLoja.wpp || ''), (umaLoja.wpp || '').slice(0, 120));
  check('sem marcar nenhuma, o relatório traz todas',
    /Bangu/.test(r.wpp || '') && /Caxias/.test(r.wpp || '') && /Nova Iguaçu/.test(r.wpp || ''), (r.wpp || '').slice(0, 300));
  check('o relatório também cobra quem não lançou',
    /Não lançou a contagem/.test(r.wpp || '') && /Sem contagem lançada/.test(r.wpp || ''), (r.wpp || '').slice(-260));

  // ── Consulta que falha não mente ────────────────────────────────────────────────────
  const falha = await montar({ falhar: true });
  check('consulta que falha avisa, em vez de mostrar a rede inteira sem contagem',
    /Não deu pra carregar/.test(falha.txt) && !/não lançaram a contagem/.test(falha.txt), falha.txt.slice(0, 200));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
