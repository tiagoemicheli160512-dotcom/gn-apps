// "Criar uma aba no painel de gestão para apresentar as informações das notas sem 10% que
//  estão no app Caixa (...) seguindo o mesmo modelo utilizado nas abas de cancelamentos e
//  transferências. IMPORTANTE: verificar os problemas relatados e corrigir as informações
//  que não estão batendo."
//
// A nota sem 10% é a mesa que não pagou a taxa de serviço; o que a rede perde é o 10%
// dela. Por isso o número em destaque é o 10% — o valor das notas sozinho não diz o que
// se deixou de receber.
//
// MEDIDO na base antes de montar (2.053 notas, 10/07 a 29/10, R$ 424.611 em notas):
//
//  · Maglia NÃO USA o app Caixa — zero fechamentos. Fica fora, e isso não esconde lacuna.
//  · Caxias fechou 95 caixas e nunca lançou UMA nota; Boulevard parou de lançar em 27/07;
//    Nova Iguaçu lançou 4 notas num único dia. Por isso "sem nota" aqui não é uma coisa
//    só — e, diferente do cancelamento, o app NÃO tem assinatura de "não houve", então a
//    tela não pode dizer que não teve: só pode dizer que fechou caixa e não lançou.
//  · 1 nota de R$ 20.396 (Bangu 12/09, mesa 57) num dia cuja venda inteira foi R$ 22.906
//    — 89% do dia numa mesa só, contra média de R$ 206 e percentil 99 de R$ 684.
//  · 62 fechamentos sem total_sistema: nesses não há com o que comparar.
//  · E um achado que separa as duas causas: `total_sistema` gravado como `10.389` quando
//    a venda foi R$ 10.389,00 — separador de milhar lido como decimal (3 casos).
//
// O QUE TORNA ISTO DIFÍCIL, e é metade desta suíte: uma nota grande demais pro dia pode
// ser a NOTA errada ou o TOTAL DO DIA errado, e as duas acontecem na base. A tela marca o
// par pra conferência em vez de escolher um culpado — escolher seria inventar.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Linhas no formato que a consulta do Painel devolve: fechamento com as notas aninhadas.
const fech = (loja, data, totalSistema, notas, extra) => Object.assign({
  loja, data, turno: 'NOITE', status: 'FECHADO', total_sistema: totalSistema,
  gn_caixa_cancelamento: [], gn_caixa_transferencia: [],
  gn_caixa_gorjeta: (notas || []).map(([mesa, garcom, valor]) => ({ mesa, garcom, valor })),
}, extra || {});

const LINHAS = [
  // Itaquera: o caso normal, três notas num dia de venda grande.
  fech('ITAQUERA', '2026-10-20', 18000, [['12', 'Ana', 300], ['14', 'Bia', 200], ['9', 'Ana', 100]]),
  // Bangu: a nota que é 89% da venda do dia — o caso real de 12/09.
  fech('BANGU', '2026-10-21', 22906.23, [['57', 'Raphael', 20396], ['50', 'Raphael', 352.89]]),
  // Pedreira: dia SEM total do sistema lançado — não dá pra comparar.
  fech('PEDREIRA', '2026-10-22', null, [['3', 'Caio', 500]]),
  // Caxias: fechou caixa e não lançou nenhuma nota. É o caso real dela na base.
  fech('CAXIAS', '2026-10-20', 9000, []),
  fech('CAXIAS', '2026-10-21', 9500, []),
  // Maglia não entra: não usa o app Caixa. Se entrasse, cairia em "não lançou".
  fech('MAGLIA', '2026-10-20', 5000, []),
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-23T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => { try {
        return typeof _raioxMapearSem10 === 'function' && typeof _sem10MacroDados === 'function'
            && typeof _buildSem10Panel === 'function' && typeof _sem10RelatorioTexto === 'function'
            && Array.isArray(LOJAS_LISTA); } catch (e) { return false; } }, null, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const montar = () => page.evaluate(({ LINHAS }) => {
    _dashPer = 'sem'; _dashWoff = 0;
    _dashSem10Per = _raioxMapearSem10(LINHAS);
    _dashSem10CaixasPer = _raioxMapearCaixasSem10(LINHAS);
    const d = _sem10MacroDados();
    const html = _buildSem10Panel();
    const el = document.createElement('div'); el.innerHTML = html;
    return { html, txt: el.textContent.replace(/\s+/g, ' ').trim(),
      dados: { valor: d.valor, dez: d.dez, qtd: d.qtd, suspeitas: d.suspeitas,
               semTotalDia: d.semTotalDia, nLojas: d.nLojas,
               lojas: d.lojas.map(l => ({ k: l.k, valor: l.valor, dez: l.dez, n: l.itens.length, susp: l.suspeitas })),
               semNota: d.semNota.map(l => ({ k: l.k, estado: l.estado, caixas: l.caixas })) } };
  }, { LINHAS });

  const r = await montar();
  const d = r.dados;

  // ══ 1. O NÚMERO QUE IMPORTA É O 10%, NÃO O VALOR DAS NOTAS ══════════════════════
  check('o valor das notas é a soma de todas',
    Math.abs(d.valor - (600 + 20748.89 + 500)) < 0.01, JSON.stringify(d.valor));
  check('e o 10% não cobrado é 10% disso',
    Math.abs(d.dez - d.valor * 0.10) < 0.01, JSON.stringify({ dez: d.dez, valor: d.valor }));
  check('o 10% é o que aparece em destaque, com o que significa',
    /10% não cobrado/.test(r.txt) && /deixou de receber/.test(r.txt), r.txt.slice(0, 220));
  check('a quantidade de notas confere', d.qtd === 6, JSON.stringify(d.qtd));

  // ══ 2. POR LOJA, COMO NO PAINEL DE CANCELAMENTO ═════════════════════════════════
  check('cada loja aparece com o total dela',
    d.lojas.length === 3 && d.lojas.every(l => l.n > 0), JSON.stringify(d.lojas));
  // O 10% POR LOJA, não só o da rede: é ele que aparece em destaque em cada bloco e é
  // ele que ordena o ranking. Cobrando só o total, trocar o 10% da loja pelo valor das
  // notas passava despercebido — a mutação sobreviveu exatamente por isso.
  check('e o 10% de cada loja é 10% das notas dela',
    d.lojas.every(l => Math.abs(l.dez - l.valor * 0.10) < 0.01), JSON.stringify(d.lojas));
  check('a soma dos 10% das lojas fecha com o da rede',
    Math.abs(d.lojas.reduce((a, l) => a + l.dez, 0) - d.dez) < 0.01, JSON.stringify(d.lojas));
  check('e a ordem é do maior valor pro menor',
    d.lojas[0].k === 'BANGU' && d.lojas[d.lojas.length - 1].k === 'PEDREIRA', JSON.stringify(d.lojas.map(l => l.k)));
  check('a nota traz mesa e garçom, que é como a loja identifica',
    /Mesa 57/.test(r.txt) && /Raphael/.test(r.txt), r.txt.slice(0, 400));

  // ══ 3. MAGLIA FORA — NÃO USA O APP CAIXA ════════════════════════════════════════
  check('Maglia não aparece como loja com nota',
    !d.lojas.some(l => l.k === 'MAGLIA'), JSON.stringify(d.lojas.map(l => l.k)));
  check('nem é cobrada por não ter lançado',
    !d.semNota.some(l => l.k === 'MAGLIA') && !/Maglia/.test(r.txt), JSON.stringify(d.semNota));

  // ══ 4. "SEM NOTA" NÃO É UMA COISA SÓ ════════════════════════════════════════════
  // Diferente do cancelamento, aqui NÃO existe assinatura de "não houve" — então a tela
  // não pode dizer que a loja não teve nota, só que fechou caixa e não lançou.
  const cax = d.semNota.find(l => l.k === 'CAXIAS');
  check('quem fechou caixa e não lançou fica separado',
    cax && cax.estado === 'nao_lancou' && cax.caixas === 2, JSON.stringify(cax));
  const semCaixa = d.semNota.filter(l => l.estado === 'sem_caixa');
  check('e quem não fechou caixa no período também, com outro motivo',
    semCaixa.length > 0 && semCaixa.every(l => l.caixas === 0), JSON.stringify(semCaixa.slice(0, 3)));
  check('a tela diz que não dá pra saber se não teve ou se não lançou',
    /não esteja sendo lançado/.test(r.txt) && /assinatura/.test(r.txt), r.txt.slice(-500));
  check('e que sem caixa fechado não há o que lançar',
    /Não há o que lançar/.test(r.txt), r.txt.slice(-300));

  // ══ 5. A CONFERÊNCIA — E A TELA NÃO ESCOLHE O CULPADO ═══════════════════════════
  check('a nota que passa de metade da venda do dia é marcada',
    d.suspeitas === 1, JSON.stringify(d.suspeitas));
  check('com a fatia do dia que ela representa',
    /89% da venda do dia/.test(r.txt), (r.txt.match(/\d+% da venda do dia/) || [''])[0]);
  // É o ponto central: as duas causas existem na base (nota errada E total do dia com o
  // separador de milhar lido como decimal). Apontar um lado só seria inventar.
  check('e a tela manda conferir OS DOIS, não acusa a nota',
    /confira a nota e o total do dia/.test(r.txt), r.txt.slice(0, 600));
  check('nota normal não é marcada',
    d.lojas.find(l => l.k === 'ITAQUERA').susp === 0, JSON.stringify(d.lojas));
  // Dia sem total do sistema não é nota suspeita — é comparação impossível.
  check('dia sem o total do sistema não vira nota suspeita',
    d.lojas.find(l => l.k === 'PEDREIRA').susp === 0, JSON.stringify(d.lojas));
  check('e é contado à parte, pelo que é',
    d.semTotalDia === 1 && /não há com o que comparar/.test(r.txt), JSON.stringify(d.semTotalDia));

  // ══ 6. RANKING, DO MELHOR PRO PIOR ══════════════════════════════════════════════
  const rank = await page.evaluate(() => {
    const el = document.createElement('div'); el.innerHTML = _buildSem10Panel();
    const i = el.innerHTML.indexOf('Ranking');
    if (i < 0) return { tem: false };
    const d2 = document.createElement('div'); d2.innerHTML = el.innerHTML.slice(i);
    const nomes = [...d2.querySelectorAll('span')].filter(s => /width:96px/.test(s.getAttribute('style') || ''))
      .map(s => s.textContent.trim());
    return { tem: true, nomes };
  });
  check('o ranking existe', rank.tem === true, JSON.stringify(rank));
  check('e começa por quem menos deixou de cobrar',
    rank.nomes && rank.nomes[0] === 'Pedreira' && rank.nomes[rank.nomes.length - 1] === 'Bangu',
    JSON.stringify(rank.nomes));

  // ══ 7. O RELATÓRIO LEVA OS MESMOS NÚMEROS ═══════════════════════════════════════
  const rel = await page.evaluate(() => (_sem10RelatorioTexto(false) || {}).msg || '');
  check('o relatório traz o 10% e o valor das notas',
    /10% não cobrado:/.test(rel) && /Valor das notas:/.test(rel), rel.slice(0, 200));
  check('e marca a nota que pede conferência',
    /confira a nota e o total do dia/.test(rel), rel.slice(0, 600));
  check('e nomeia quem fechou caixa sem lançar',
    /Fechou caixa e não lançou nenhuma: [^\n]*Caxias/.test(rel), rel.slice(-300));

  // ══ 8. A CONSULTA DO PAINEL PRECISA TRAZER O DADO ══════════════════════════════
  // A suíte monta as linhas à mão pra testar o cálculo. Se alguém tirar as notas do
  // `select` da consulta do dashboard, a aba fica VAZIA em produção e nada aqui veria —
  // então a consulta é cobrada direto na fonte. Ela é a mesma dos cancelamentos: a data
  // mora no fechamento, então a linha já estava sendo lida de qualquer jeito.
  // Pela ETIQUETA da consulta ('dash:cancelRows'), não pelo nome da tabela: o arquivo tem
  // outras consultas a gn_caixa_fechamento, e a primeira que o regex achasse não era esta.
  const fonte = require('fs').readFileSync(HOME, 'utf8');
  const qFech = (fonte.split('\n').find(l => /'dash:cancelRows'/.test(l)) || '');
  check('a consulta do Painel traz as notas sem 10% aninhadas',
    /gn_caixa_gorjeta\(/.test(qFech), qFech.slice(0, 300));
  check('e o total do dia, que é com o que a nota se compara',
    /\btotal_sistema\b/.test(qFech), qFech.slice(0, 300));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
