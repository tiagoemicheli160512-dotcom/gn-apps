// "Podemos ver no relatório em PDF, pra tentar montar igual temos no relatório das vendas?
//  Fica mais fácil de entender."
//
// O relatório de vendas monta TABELA — gnRelatorioPDF com `html` e `kpis`, cabeçalho da
// marca, título em ouro e régua dourada no topo de cada coluna. A aba Carnes mandava texto
// corrido pelo MESMO helper, e era só isso que separava os dois.
//
// O WhatsApp continua texto, de propósito, e esta suíte cobra isso: o WhatsApp não
// renderiza tabela, e o botão "PDF no Whats" precisa de um Blob feito a partir de texto
// (_textoParaPdfBlob, ver _compartilharPdfWpp). Tabela ali viraria uma pilha de tags.
//
// O fixture tem uma loja SEM contagem de propósito. Ela é o caso que separa um relatório
// que informa de um que engana: some-la deixaria o total menor sem ninguém saber que
// faltou alguém, e contar a venda dela no índice da rede achata o número.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra !== undefined ? ' >> ' + String(extra).slice(0, 240) : '')); c ? ok++ : falhou++; };

const INI = '2026-10-26';
const C = (ini, ent, cont) => ({ inicial: ini, ent_ter: ent, contagem_final: cont });
const LINHAS = [
  { loja: 'Bangu',  semana_inicio: INI, carnes: { carne_sol: C(60,40,30), picanha: C(20,10,8),
      carne_seca: C(15,5,6), camarao: C(8,4,3) }, updated_at: '2026-11-03T11:59:00Z' },
  { loja: 'Caxias', semana_inicio: INI, carnes: { carne_sol: C(80,50,45), picanha: C(30,12,14),
      carne_seca: C(20,8,9), camarao: C(10,5,4) }, updated_at: '2026-11-03T10:50:00Z' },
  // Sem contagem: só `inicial`, que é como a linha nasce na virada da semana.
  { loja: 'Pedreira', semana_inicio: INI, carnes: { carne_sol: { inicial: 50 }, picanha: { inicial: 20 },
      carne_seca: { inicial: 10 }, camarao: { inicial: 5 } }, updated_at: '2026-10-26T12:47:00Z' },
];
const VENDAS = [
  { loja: 'Bangu',    data_operacao: '2026-10-27', venda_salao: 120000, venda_delivery: 0 },
  { loja: 'Caxias',   data_operacao: '2026-10-27', venda_salao: 200000, venda_delivery: 0 },
  { loja: 'Pedreira', data_operacao: '2026-10-27', venda_salao:  90000, venda_delivery: 0 },
];
// Contas tiradas do fixture: início + compras − contagem.
const SAIDA = { Bangu: [70, 22, 14, 9], Caxias: [85, 28, 19, 11] };
const TOT_KG = 115 + 143;                 // 258
const FAT_CONTOU = 120000 + 200000;       // 320 mil — a Pedreira não conta aqui
const RAZAO = (TOT_KG / (FAT_CONTOU / 1000)).toFixed(2).replace('.', ',');  // 0,81

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 900, height: 1000 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-05T12:00:00');
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url());
    const json = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (/checklist_carnes/.test(u)) return json(LINHAS);
    if (/checklist_diario/.test(u)) return json(VENDAS);
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message)));
  await page.goto('file://' + HOME);
  try {
    await page.waitForFunction(() => typeof gerarPDFCarnes === 'function' && typeof _loadCarnesGerencia === 'function',
      { timeout: 25000 });
  } catch (e) { console.log('FALHOU: o Painel não carregou'); console.log('\n0 OK, 16 falhou'); await browser.close(); process.exit(1); }

  const r = await page.evaluate(async () => {
    LOJAS_LISTA = ['BANGU', 'CAXIAS', 'PEDREIRA'];
    window.renderDashboard = () => {};
    await _loadCarnesGerencia();
    let doc = '';
    const real = window.open;
    window.open = () => ({ document: { write: h => { doc = h; }, close: () => {} } });
    gerarPDFCarnes();
    window.open = real;
    // Pelo BOTÃO, não pela função: chamar _carnesRelatorioTexto por fora deixava passar
    // uma mudança no próprio gerarWppCarnes — foi o que a mutação pegou.
    let wppUrl = '';
    window.open = (u) => { wppUrl = u || ''; return null; };
    gerarWppCarnes();
    window.open = real;
    const wpp = decodeURIComponent(String(wppUrl).replace(/^https:\/\/wa\.me\/\?text=/, ''));
    return { doc, wpp };
  });
  if (!r.doc) { console.log('FALHOU: o PDF não foi gerado'); console.log('\n0 OK, 16 falhou'); await browser.close(); process.exit(1); }
  const txt = r.doc.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

  // ── 1. É o mesmo formato do relatório de vendas ───────────────────────────────────────
  check('vira TABELA, não texto corrido', /<table[\s>]/.test(r.doc) && /<thead>/.test(r.doc), r.doc.slice(0, 160));

  // "As colunas estão desalinhadas, nome e número — confunde." O estilo geral do PDF
  // alinhava o TÍTULO à direita e deixava o número à esquerda. Mede na página renderizada:
  // a borda direita do título e a do número da mesma coluna têm que coincidir.
  const alin = await page.evaluate((doc) => {
    const ifr = document.createElement('iframe'); ifr.style.width = '1000px'; ifr.style.height = '1400px';
    document.body.appendChild(ifr);
    ifr.contentDocument.open(); ifr.contentDocument.write(doc.replace(/<script>[\s\S]*?<\/script>/g, '')); ifr.contentDocument.close();
    const d = ifr.contentDocument;
    const medir = (tab) => {
      const ths = Array.from(tab.querySelectorAll('thead th'));
      const tr = Array.from(tab.querySelectorAll('tbody tr')).find(x => x.children.length === ths.length);
      if (!tr) return null;
      return ths.map((th, i) => {
        const td = tr.children[i];
        const rTh = d.createRange(); rTh.selectNodeContents(th.firstChild || th);
        const rTd = d.createRange(); rTd.selectNodeContents(td);
        const a = rTh.getBoundingClientRect(), b2 = rTd.getBoundingClientRect();
        const esq = getComputedStyle(th).textAlign === 'left';
        return Math.round(esq ? Math.abs(a.left - b2.left) : Math.abs(a.right - b2.right));
      });
    };
    const tabs = d.querySelectorAll('table');
    const res = { t1: medir(tabs[0]), t2: medir(tabs[1]), heads: Array.from(tabs[0].querySelectorAll('thead th')).map(th => th.textContent.replace(/\s+/g, ' ').trim()),
                  blocos: tabs[1].querySelectorAll('tbody.bloco-loja').length, faixas: Array.from(tabs[1].querySelectorAll('tr.loja')).map(x => x.textContent.trim()) };
    ifr.remove();
    return res;
  }, r.doc);
  check('tabela por loja: título e número de cada coluna alinhados (≤ 2px)', alin.t1 && alin.t1.every(x => x <= 2), JSON.stringify(alin.t1));
  // A 1ª coluna do detalhe é recuada de propósito: o corte fica "dentro" da faixa da loja.
  check('tabela de onde sai cada número: colunas de número alinhadas ao título (≤ 2px)', alin.t2 && alin.t2.slice(1).every(x => x <= 2), JSON.stringify(alin.t2));
  check('os cortes dizem que é saída ESTIMADA, em kg', alin.heads.filter(h => /saída estimada \(kg\)/.test(h)).length >= 4 && alin.heads.some(h => /^Carne de Sol/.test(h)), JSON.stringify(alin.heads));
  check('no detalhe, cada loja num bloco separado, com faixa própria', alin.blocos >= 1 && alin.blocos === alin.faixas.length, JSON.stringify(alin));
  check('com o cabeçalho da marca GN e o título em ouro',
    /marca-gn/.test(r.doc) && /<h1>/.test(r.doc) && /Controle de Carnes/.test(txt));
  check('com a faixa de KPIs no topo, igual ao de vendas', /kpi-row/.test(r.doc) && /kpi-val/.test(r.doc));
  check('e o rodapé do padrão', /GN Operações/.test(txt));
  check('o nome do arquivo leva o período junto', /<title>[^<]*26\/10 a 01\/11/.test(r.doc),
    (r.doc.match(/<title>[^<]*<\/title>/) || [''])[0]);

  // ── 2. Os números ─────────────────────────────────────────────────────────────────────
  check(`a saída total da rede são ${TOT_KG} kg`, txt.includes(String(TOT_KG) + ',0 kg'), txt.slice(0, 300));
  check('cada loja tem sua linha, com a saída de cada corte',
    SAIDA.Bangu.every(v => new RegExp('>' + v + ',0<').test(r.doc)) &&
    SAIDA.Caxias.every(v => new RegExp('>' + v + ',0<').test(r.doc)));
  check('e o total de kg da loja', />115,0<\/b>/.test(r.doc) && />143,0<\/b>/.test(r.doc));
  check('o kg por R$ mil de cada loja aparece', />0,96</.test(r.doc) && />0,72</.test(r.doc));

  // O índice da rede é sobre quem CONTOU. Com a venda da Pedreira no divisor dava 0,63 —
  // número menor, que parece melhora, por causa de uma loja que não contou.
  check(`o kg por R$ mil da rede é ${RAZAO}, sobre quem contou`, txt.includes(RAZAO), txt.slice(0, 400));
  check('e diz que é só das lojas que contaram', /só as lojas que contaram/.test(txt));
  check('a venda da rede continua sendo a de todas as lojas',
    /R\$ 410\.000,00/.test(txt), txt.slice(0, 400));

  // ── 3. A loja que não contou ──────────────────────────────────────────────────────────
  check('a loja sem contagem aparece na tabela, dita como tal',
    /Pedreira/.test(txt) && /não lançou a contagem/.test(txt));
  check('e tem um aviso dizendo que a saída dela não entra no total',
    /Sem contagem lançada:\s*Pedreira/.test(txt));

  // ── 4. A segunda tabela: de onde sai o número ─────────────────────────────────────────
  check('tem a conta por trás: início, compras, contagem e saída',
    /De onde sai cada número/.test(txt) && /Início \+ compras − contagem/.test(txt));
  check('com uma linha por corte da loja que contou', />Carne de Sol</.test(r.doc) && />Camarão</.test(r.doc));

  // ── 5. O WhatsApp continua texto ──────────────────────────────────────────────────────
  check('o botão do WhatsApp manda texto, não tabela',
    !!r.wpp && !/<table>|<td>|<tr>/.test(r.wpp), r.wpp.slice(0, 160));
  check('e continua trazendo os mesmos números', /70,0 kg/.test(r.wpp), r.wpp.slice(0, 200));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
