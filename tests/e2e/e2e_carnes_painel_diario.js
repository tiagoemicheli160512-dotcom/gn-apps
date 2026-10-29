// "No app home na aba carne no painel de gestão, quero trazer para essa aba a contagem de
//  carne dia a dia, referente à semana vigente, para que seja possível acompanhar as
//  informações no painel de gestão e identificar inconsistências. Essa contagem deverá
//  mostrar também a quantidade que entrou, aproveitando as informações que já são lançadas
//  automaticamente pelo app Lojas, na aba Entrega."
//
// Duas regras vêm da FORMA do dado e não dá pra adivinhar olhando a tela:
//
//  1. A coluna de SEGUNDA é o estoque inicial, não uma contagem. Medido no banco: o campo
//     `seg` está preenchido em 0 de 648 linhas, porque segunda é o dia da pesagem que fecha
//     a semana anterior e abre esta. A contagem diária começa na terça.
//  2. A contagem de cada dia é uma LEITURA DE ESTOQUE, não um consumo. Somar os dias não
//     significa nada — a soma dos dias da Nova América numa semana dá 2.597 kg. O que se lê
//     é a curva: cair é consumo, subir sem entrada do lado é erro de contagem.
//
// E na semana VIGENTE a cobrança muda de natureza: o fechamento só chega na segunda
// seguinte, então cobrar "não lançou a contagem" durante a semana seria cobrança falsa. O
// que se cobra é a pesagem do dia.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Semana vigente 26/10–01/11, com o relógio na QUINTA 29/10: ter/qua/qui são os dias que
// já podem ter pesagem, então o esperado é 3.
const corteDia = (ini, dias, ent) => Object.assign(
  { inicial: String(ini) },
  dias,                                    // { ter:'...', qua:'...', ... }
  ent || {});                              // { ent_ter:'...', ... }

const LINHAS = [
  // Pedreira: pesou os 3 dias e recebeu 120 kg na quarta (a entrega real da semana).
  { loja: 'Pedreira', semana_inicio: '2026-10-26', updated_at: '2026-10-29T12:00:00Z',
    carnes: { carne_sol: corteDia(121.6, { ter:'180.4', qua:'270.2', qui:'210.5' }, { ent_qua:'120' }),
              picanha: corteDia(40, { ter:'35', qua:'30', qui:'25' }),
              carne_seca: corteDia(10, { ter:'9', qua:'8', qui:'7' }),
              camarao: corteDia(5, { ter:'4', qua:'3', qui:'2' }) } },
  // Bangu: parou de pesar na terça — é o atraso que o Painel tem que apontar.
  { loja: 'Bangu', semana_inicio: '2026-10-26', updated_at: '2026-10-27T12:00:00Z',
    carnes: { carne_sol: corteDia(92.3, { ter:'140.0' }, { ent_ter:'89.6' }),
              picanha: corteDia(20, { ter:'18' }),
              carne_seca: corteDia(8, { ter:'7' }),
              camarao: corteDia(4, { ter:'3' }) } },
  // Caxias: não pesou nenhum dia.
  { loja: 'Caxias', semana_inicio: '2026-10-26', updated_at: '2026-10-26T12:00:00Z',
    carnes: { carne_sol: corteDia(140.85, {}), picanha: corteDia(30, {}),
              carne_seca: corteDia(6, {}), camarao: corteDia(3, {}) } },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  // Quinta 29/10/2026: a semana vigente é 26/10–01/11 e 3 dias já podem ter pesagem.
  await CAMINHOS.fixarRelogio(ctx, '2026-10-29T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _buildCarnesPanel === 'function' && typeof _carnesGradeDia === 'function'
               && typeof _carnesNavSemana === 'function' && Array.isArray(LOJAS_LISTA); }
        catch (e) { return false; }
      }, null, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const montar = (off) => page.evaluate(async ({ LINHAS, off }) => {
    const orig = window.gnFetchJson;
    const urls = [];
    window.gnFetchJson = async (url) => {
      urls.push(url);
      if (/checklist_carnes/.test(url)) return LINHAS;
      if (/checklist_diario/.test(url)) return [];
      return [];
    };
    _carnesGerLoaded = false; _carnesGerData = null; _carnesGerOff = off;
    _carnesRelatorioLojasFiltro = [];
    try { await _loadCarnesGerencia(); } finally { window.gnFetchJson = orig; }
    const html = _buildCarnesPanel();
    const el = document.createElement('div'); el.innerHTML = html;
    const cards = {};
    [...el.querySelectorAll('div')].forEach(dv => {
      if (!/border-left:\s*3px solid/.test(dv.getAttribute('style') || '')) return;
      const t = dv.textContent.replace(/\s+/g, ' ').trim();
      const nome = t.split(/✅|⚠|💰|sem faturamento/)[0].trim();
      if (nome) cards[nome] = { txt: t, html: dv.innerHTML };
    });
    return { txt: el.textContent.replace(/\s+/g, ' ').trim(), html, urls, cards, off: _carnesGerOff };
  }, { LINHAS, off });

  // ══ 1. A semana vigente é alcançável e se identifica ══════════════════════════════
  // Pela FUNÇÃO, não atribuindo _carnesGerOff: a trava vive dentro dela. Atribuindo
  // direto, a verificação passava até com a trava velha (`novo > 0`) no lugar — mutação
  // confirmou que ela não cobria nada.
  const nav = await page.evaluate(async ({ LINHAS }) => {
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url) => (/checklist_carnes/.test(url) ? LINHAS : []);
    try {
      _carnesGerOff = 0;
      _carnesNavSemana(1);                   // 0 → +1: a semana vigente
      const umaAdiante = _carnesGerOff;
      _carnesNavSemana(1);                   // tentar passar dela
      const depois = _carnesGerOff;
      _carnesNavSemana(-1);                  // e voltar
      return { umaAdiante, depois, voltou: _carnesGerOff };
    } finally { window.gnFetchJson = orig; }
  }, { LINHAS });
  check('a navegação chega na semana vigente (+1)', nav.umaAdiante === 1, JSON.stringify(nav));
  check('e não passa dela — semana futura não existe', nav.depois === 1, JSON.stringify(nav));
  check('e volta pra semana fechada sem travar', nav.voltou === 0, JSON.stringify(nav));

  const r = await montar(1);
  check('a aba busca a semana 26/10 a 01/11',
    r.urls.some(u => /semana_inicio=gte\.2026-10-26/.test(u) && /semana_inicio=lte\.2026-11-01/.test(u)),
    JSON.stringify(r.urls));
  check('e o cabeçalho diz que a semana está em andamento',
    /semana vigente — em andamento/.test(r.txt), r.txt.slice(0, 200));

  // ══ 2. A grade dia a dia ══════════════════════════════════════════════════════════
  const ped = (r.cards['Pedreira'] || {}).txt || '';
  check('o card tem a grade de contagem dia a dia',
    /CONTAGEM DIA A DIA/.test(ped), ped.slice(0, 200));
  check('com os sete dias nomeados',
    ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].every(d => ped.includes(d)), ped.slice(0, 300));
  check('a contagem de cada dia aparece (Pedreira: 180,4 / 270,2 / 210,5)',
    /180,4/.test(ped) && /270,2/.test(ped) && /210,5/.test(ped), ped.slice(0, 400));
  // A regra que não se adivinha: segunda é o estoque inicial.
  check('a coluna de segunda mostra o estoque inicial, não uma contagem',
    /121,6/.test(ped) && /segunda é o estoque inicial/.test(ped), ped.slice(0, 400));
  check('e o dia sem pesagem sai como travessão, não como zero',
    (ped.match(/—/g) || []).length > 0, ped.slice(0, 400));

  // ══ 3. A entrada vinda da Entrega, no dia em que chegou ═══════════════════════════
  check('o que entrou aparece no dia, com +',
    /\+120,0/.test(ped), ped.slice(0, 400));
  check('e a legenda diz que o +N é a entrada',
    /\+N<\/span> é o que entrou|é o que entrou/.test(r.html), ped.slice(0, 300));
  const bangu = (r.cards['Bangu'] || {}).txt || '';
  check('a entrada da outra loja cai no dia dela (Bangu, terça: +89,6)',
    /\+89,6/.test(bangu), bangu.slice(0, 400));
  check('e não aparece no card de quem não recebeu',
    !/\+89,6/.test(ped) && !/\+120,0/.test(bangu), 'ped: ' + ped.slice(0,150) + ' || bangu: ' + bangu.slice(0,150));

  // ══ 4. A soma dos dias NÃO é apresentada — ela não significa nada ═════════════════
  // 180,4 + 270,2 + 210,5 = 661,1. Se esse número aparecer, alguém somou leitura de
  // estoque como se fosse consumo.
  check('a soma das contagens diárias não é mostrada em lugar nenhum',
    !/661,1|661\.1/.test(r.txt), r.txt.slice(0, 300));

  // ══ 5. Na semana vigente cobra-se a pesagem do dia, não o fechamento ═════════════
  check('a cobrança da semana vigente é sobre a contagem diária',
    /atrasadas na contagem diária/.test(r.txt), r.txt.slice(0, 400));
  check('e NÃO sobre o fechamento, que só vem na segunda',
    !/não lançaram a contagem/.test(r.txt), r.txt.slice(0, 400));
  check('quem pesou 1 de 3 dias é apontado com o número (Bangu)',
    /Bangu \(1\/3\)/.test(r.txt), r.txt.slice(0, 500));
  check('e quem não pesou nenhum também (Caxias)',
    /Caxias \(0\/3\)/.test(r.txt), r.txt.slice(0, 500));
  check('quem está em dia não entra na cobrança',
    !/Pedreira \(/.test(r.txt), r.txt.slice(0, 500));
  check('o aviso diz quantos dias são esperados até hoje',
    /Esperado: 3 dias pesados até hoje/.test(r.txt), r.txt.slice(0, 600));

  // ══ 6. A semana fechada continua como era ════════════════════════════════════════
  const fechada = await montar(0);
  check('na semana fechada a cobrança volta a ser do fechamento',
    /não lançaram a contagem/.test(fechada.txt) || /lançaram a contagem desta semana/.test(fechada.txt),
    fechada.txt.slice(0, 300));
  check('e a grade dia a dia também aparece lá',
    /CONTAGEM DIA A DIA/.test(fechada.txt), fechada.txt.slice(0, 300));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
