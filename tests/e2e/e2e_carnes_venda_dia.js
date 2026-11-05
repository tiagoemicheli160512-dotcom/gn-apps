// "No app home painel de gestão, queria uma mudança se possível, colocar a venda por dia,
//  pra ter uma visão melhor se a saída de carne bate com a venda, pode ser ao lado de seg,
//  ter, qua e etc."
//
// A grade dia a dia já mostrava a curva da carne. O que faltava era contra o quê ler essa
// curva: uma queda de 30 kg num dia que vendeu R$ 3 mil e a mesma queda num dia que vendeu
// R$ 9 mil são dois casos diferentes, e só o segundo é normal.
//
// DUAS armadilhas, as duas medidas no banco antes de escrever a tela:
//
//  1. ZERO NÃO É VENDA ZERO. A linha do dia nasce na ABERTURA e a venda só é lançada no
//     fechamento, então o dia de hoje chega com 0,00 em toda loja que já abriu — medido
//     em 30/10: 9 lojas, todas com venda_salao e venda_delivery em 0,00. Pintar isso como
//     "vendeu R$ 0" ao lado da carne que saiu inventaria um rombo todo santo dia. Em 920
//     dias de semanas já FECHADAS, 20 (2,2%) ficaram em zero, e todos são lançamento que
//     faltou. O travessão é a leitura honesta dos dois casos.
//
//  2. O FUSO. `data_operacao` é uma data pura ("2026-10-29"); montar um Date a partir dela
//     a lê como meia-noite UTC, e em São Paulo isso é 21h do dia ANTERIOR. Um getDay() em
//     cima disso joga a venda de segunda na coluna de domingo — sem erro nenhum na tela, e
//     a conta que o dono quer fazer passa a comparar o dia errado. Por isso esta suíte roda
//     com o contexto em America/Sao_Paulo e cobra a POSIÇÃO de cada número, não a presença.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const corte = (ini, dias) => Object.assign({ inicial: String(ini) }, dias);
const CARNES = [
  { loja: 'Pedreira', semana_inicio: '2026-10-26', updated_at: '2026-10-29T12:00:00Z',
    carnes: { carne_sol: corte(121.6, { ter:'180.4', qua:'270.2', qui:'210.5' }),
              picanha: corte(40, { ter:'35', qua:'30', qui:'25' }),
              carne_seca: corte(10, { ter:'9', qua:'8', qui:'7' }),
              camarao: corte(5, { ter:'4', qua:'3', qui:'2' }) } },
  { loja: 'Bangu', semana_inicio: '2026-10-26', updated_at: '2026-10-27T12:00:00Z',
    carnes: { carne_sol: corte(92.3, { ter:'140.0' }), picanha: corte(20, { ter:'18' }),
              carne_seca: corte(8, { ter:'7' }), camarao: corte(4, { ter:'3' }) } },
  { loja: 'Caxias', semana_inicio: '2026-10-26', updated_at: '2026-10-26T12:00:00Z',
    carnes: { carne_sol: corte(140.85, {}), picanha: corte(30, {}),
              carne_seca: corte(6, {}), camarao: corte(3, {}) } },
];

// A venda, do jeito que o banco entrega: uma linha por loja por dia (0 duplicatas em 2026).
//   · Pedreira vendeu seg/ter/qua e tem a linha de QUINTA ainda em zero — o dia aberto.
//   · Bangu vendeu seg e ter; 1234,56 arredonda pra 1.235, pra cobrar o arredondamento.
//   · Caxias não tem linha nenhuma: a loja inteira fica sem a faixa de venda.
const DIARIO = [
  { loja: 'Pedreira', data_operacao: '2026-10-26', venda_salao: '4000.00', venda_delivery: '1123.45' },
  { loja: 'Pedreira', data_operacao: '2026-10-27', venda_salao: '4201.00', venda_delivery: '0.00'    },
  { loja: 'Pedreira', data_operacao: '2026-10-28', venda_salao: '3000.00', venda_delivery: '987.60'  },
  { loja: 'Pedreira', data_operacao: '2026-10-29', venda_salao: '0.00',    venda_delivery: '0.00'    },
  { loja: 'Bangu',    data_operacao: '2026-10-26', venda_salao: '2000.40', venda_delivery: '0.00'    },
  { loja: 'Bangu',    data_operacao: '2026-10-27', venda_salao: '1234.56', venda_delivery: '0.00'    },
];
const PEDREIRA_SEMANA = 4000 + 1123.45 + 4201 + 3000 + 987.60;   // 13.312,05
const ESPERADO_PEDREIRA = ['5.123', '4.201', '3.988', '—', '—', '—', '—'];
const ESPERADO_BANGU    = ['2.000', '1.235', '—', '—', '—', '—', '—'];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  // O fuso é parte da verificação, não cenário: em UTC a armadilha do Date não acontece e
  // a suíte passaria com a coluna errada.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 },
                                         timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-29T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'],
        ['_buildCarnesPanel', '_loadCarnesGerencia', '_carnesGradeDia'], 20000);
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const fusoDaPagina = await page.evaluate(() => new Date('2026-10-26').getDay());
  check('o navegador do teste está a oeste de UTC — a armadilha do fuso está em pé',
    fusoDaPagina === 0, 'getDay de 2026-10-26 (segunda): ' + fusoDaPagina);

  const r = await page.evaluate(async ({ CARNES, DIARIO }) => {
    const orig = window.gnFetchJson;
    const urls = [];
    window.gnFetchJson = async (url) => {
      urls.push(url);
      if (/checklist_carnes/.test(url)) return CARNES;
      if (/checklist_diario/.test(url)) return DIARIO;
      return [];
    };
    _carnesGerLoaded = false; _carnesGerData = null; _carnesGerOff = 1;
    _carnesRelatorioLojasFiltro = [];
    try { await _loadCarnesGerencia(); } finally { window.gnFetchJson = orig; }
    const el = document.createElement('div');
    el.innerHTML = _buildCarnesPanel();
    // Uma loja por card, e dentro de cada card a LINHA da venda lida célula a célula —
    // é a posição que importa, não o número aparecer em algum lugar da tela.
    const cards = {};
    [...el.querySelectorAll('div')].forEach(dv => {
      if (!/border-left:\s*3px solid/.test(dv.getAttribute('style') || '')) return;
      const txt = dv.textContent.replace(/\s+/g, ' ').trim();
      const nome = txt.split(/✅|⚠|💰|sem faturamento/)[0].trim();
      if (!nome) return;
      const linhas = [...dv.querySelectorAll('tr')];
      const tr = linhas.find(t => /Venda \(R\$\)/.test(t.textContent));
      const cabecalho = linhas.length ? [...linhas[0].children].map(c => c.textContent.trim()) : [];
      cards[nome] = {
        txt,
        temLinha: !!tr,
        celulas: tr ? [...tr.children].slice(1).map(c => c.textContent.trim()) : null,
        // Em que posição da tabela a linha da venda está (0 = logo abaixo do cabeçalho).
        posicao: tr ? linhas.indexOf(tr) : -1,
        cabecalho,
        cortes: linhas.filter(t => !/Venda \(R\$\)/.test(t.textContent) && t !== linhas[0])
                      .map(t => t.children[0] ? t.children[0].textContent.trim() : ''),
      };
    });
    const pl = (_carnesGerData || {}).porLoja || {};
    return { urls, cards, txt: el.textContent.replace(/\s+/g, ' ').trim(),
             html: el.innerHTML,
             dados: { PEDREIRA: pl.PEDREIRA ? { fat: pl.PEDREIRA.fat, fatDia: pl.PEDREIRA.fatDia } : null,
                      BANGU: pl.BANGU ? { fat: pl.BANGU.fat, fatDia: pl.BANGU.fatDia } : null,
                      CAXIAS: pl.CAXIAS ? { fat: pl.CAXIAS.fat, fatDia: pl.CAXIAS.fatDia } : null } };
  }, { CARNES, DIARIO });

  // ══ 1. A CONSULTA PRECISA PEDIR O DIA ═══════════════════════════════════════════
  // Sem data_operacao no select a faixa inteira é impossível, e é o tipo de campo que
  // some num ajuste de consulta sem quebrar nada visível.
  const urlFat = r.urls.find(u => /checklist_diario/.test(u)) || '';
  check('a consulta da venda pede o dia, não só a loja',
    /select=[^&]*data_operacao/.test(urlFat), urlFat);
  check('e continua pedindo salão e delivery',
    /venda_salao/.test(urlFat) && /venda_delivery/.test(urlFat), urlFat);

  // ══ 2. CADA VENDA NA SUA COLUNA ═════════════════════════════════════════════════
  const ped = r.cards['Pedreira'] || {};
  check('o card da loja tem a faixa de venda por dia', ped.temLinha === true, JSON.stringify(ped.celulas));
  check('ela fica logo abaixo dos dias, antes dos cortes',
    ped.posicao === 1, 'posição: ' + ped.posicao);
  check('o cabeçalho continua sendo os sete dias',
    JSON.stringify(ped.cabecalho) === JSON.stringify(['Corte','Seg','Ter','Qua','Qui','Sex','Sáb','Dom']),
    JSON.stringify(ped.cabecalho));
  check('a venda de cada dia cai na coluna daquele dia (Pedreira)',
    JSON.stringify(ped.celulas) === JSON.stringify(ESPERADO_PEDREIRA),
    'veio: ' + JSON.stringify(ped.celulas) + ' · esperado: ' + JSON.stringify(ESPERADO_PEDREIRA));

  // ══ 3. ZERO É DIA ABERTO, NÃO VENDA ZERO ════════════════════════════════════════
  // A quinta da Pedreira TEM linha no banco, com 0,00 nos dois campos — é o dia de hoje,
  // que só fecha à noite. Sai como travessão; "0" ali seria uma loja que vendeu nada ao
  // lado de 60 kg de carne que saiu.
  check('o dia que ainda não fechou sai como travessão, não como zero',
    ped.celulas && ped.celulas[3] === '—', JSON.stringify(ped.celulas));
  check('e nenhum dia da semana mostra um zero solto',
    ped.celulas && !ped.celulas.some(c => /^0+$/.test(c)), JSON.stringify(ped.celulas));
  check('a tela explica que o travessão é dia não fechado, não venda zero',
    /não fechou aparece como —, não como zero/.test(r.txt), r.txt.slice(0, 200));

  // ══ 4. A SOMA DOS SETE DIAS É A SEMANA ══════════════════════════════════════════
  // Se a faixa e o total do cabeçalho divergirem, o painel passa a mostrar dois números
  // que se contradizem — e aí nenhum dos dois serve pra decidir nada.
  const dp = r.dados.PEDREIRA || {};
  const somaDias = (dp.fatDia || []).reduce((a, v) => a + (v || 0), 0);
  check('os sete dias somam exatamente a venda da semana',
    Math.abs(somaDias - dp.fat) < 0.005 && Math.abs(dp.fat - PEDREIRA_SEMANA) < 0.005,
    JSON.stringify({ somaDias, fat: dp.fat, esperado: PEDREIRA_SEMANA }));
  check('e o cabeçalho do card mostra esse mesmo total',
    /Vendeu R\$ 13\.312,05 na semana/.test(ped.txt || ''), (ped.txt || '').slice(0, 160));

  // ══ 5. ARREDONDAMENTO E SEPARADOR ═══════════════════════════════════════════════
  // Reais inteiros com ponto de milhar: "R$ 4,4k" apagaria a diferença entre dois dias
  // que separam R$ 300, que é justamente a comparação que o painel existe pra permitir.
  const ban = r.cards['Bangu'] || {};
  check('a venda da outra loja cai nos dias dela, arredondada ao real',
    JSON.stringify(ban.celulas) === JSON.stringify(ESPERADO_BANGU),
    'veio: ' + JSON.stringify(ban.celulas) + ' · esperado: ' + JSON.stringify(ESPERADO_BANGU));
  check('e não vira milhar abreviado, que apagaria a diferença entre os dias',
    !/\bR\$ ?\d+,\dk\b/.test(ban.txt || ''), (ban.txt || '').slice(0, 200));

  // ══ 6. UMA LOJA NÃO VÊ A VENDA DA OUTRA ═════════════════════════════════════════
  // As duas ausências abaixo só provam alguma coisa com a faixa DE PÉ: numa tela que não
  // mostra venda nenhuma elas passam sozinhas, e foi o que a contraprova contra o main
  // mostrou. Por isso cada uma exige a faixa existir antes de cobrar a ausência.
  check('a venda da Pedreira não aparece no card da Bangu',
    ban.temLinha === true && !/5\.123|4\.201|3\.988/.test(ban.txt || ''), (ban.txt || '').slice(0, 300));
  check('nem a da Bangu no da Pedreira',
    ped.temLinha === true && !/2\.000|1\.235/.test(ped.txt || ''), (ped.txt || '').slice(0, 300));

  // ══ 7. SEM VENDA LANÇADA, SEM FAIXA ═════════════════════════════════════════════
  // Uma fileira de sete travessões não informa nada e empurra a carne pra baixo. Mesma
  // armadilha: sem exigir a faixa na loja que TEM venda, "a Caxias não tem faixa" é só a
  // tela antiga passando.
  const cax = r.cards['Caxias'] || {};
  check('a loja sem nenhuma venda lançada não ganha uma faixa de travessões',
    ped.temLinha === true && cax.temLinha === false, JSON.stringify(cax.celulas));
  check('e o card dela diz que não há faturamento lançado',
    /sem faturamento lançado na semana/.test(cax.txt || ''), (cax.txt || '').slice(0, 200));
  check('a nota de rodapé também some junto com a faixa',
    /não fechou aparece como/.test(ped.txt || '') && !/não fechou aparece como/.test(cax.txt || ''),
    (cax.txt || '').slice(0, 300));

  // ══ 8. A GRADE DA CARNE CONTINUA INTEIRA ════════════════════════════════════════
  // A faixa nova é uma linha a mais na mesma tabela: fácil de, ao inserir, derrubar um
  // corte ou passar a contar a venda como se fosse um deles.
  check('os quatro cortes continuam na grade, e só eles',
    JSON.stringify(ped.cortes) === JSON.stringify(['Carne de Sol','Picanha','Carne Seca','Camarão']),
    JSON.stringify(ped.cortes));
  check('a contagem de cada dia continua onde estava',
    /180,4/.test(ped.txt || '') && /270,2/.test(ped.txt || '') && /210,5/.test(ped.txt || ''),
    (ped.txt || '').slice(0, 300));
  check('e a legenda passou a citar a venda do dia',
    /é a venda daquele dia/.test(r.txt) && /é o que entrou/.test(r.txt), r.txt.slice(0, 300));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
