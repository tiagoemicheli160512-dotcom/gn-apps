// "Na aba Oseas, preciso incluir uma opção para somar todos os pedidos realizados pelas
//  lojas na segunda-feira. Por exemplo: se todas as lojas pedirem o item Boi Bumbá e a
//  soma dos pedidos for de 100 unidades, o sistema deverá apresentar esse total."
//
// Já existia um card somando o pedido ABERTO — e isso não é a rede. A semana tem um pedido
// POR REGIÃO, então o comprador via o total do Rio ou o de São Paulo, nunca o da rede.
// MEDIDO na semana 26/10, no próprio item do exemplo: Boi Bumbá teve 76 PCT no Rio (5
// lojas) e 30 PCT em SP (1 loja). A rede pediu 106, e a tela mostrava 76 ou 30.
//
// DUAS regras vêm da forma do dado, e errar qualquer uma inventa o número:
//
//  1. O MESMO produto tem catalogo_id DIFERENTE em cada região — o Boi Bumbá é 27634b32…
//     no Rio e 7310aa86… em SP. Somar por id devolve duas linhas de 76 e 30 em vez de uma
//     de 106, que é exatamente o que o card existe pra evitar. A soma é por NOME.
//  2. Pedido CANCELADO não entra. Hoje o cancelamento esvazia os itens, então somaria zero
//     de qualquer jeito — mas no dia em que parar de esvaziar, o total sai inflado e nada
//     na tela denuncia.
//
// E o pedido do dono foi explícito: "só da aba Oseas, que são os petiscos". A aba Edu
// continua somando o pedido aberto, e isso também é cobrado aqui.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// O banco em miniatura, com a mesma forma do de verdade.
const PEDIDOS = [
  { id: 'p-rj',     regiao: 'RJ',         status: 'RASCUNHO',   semana_inicio: '2026-10-26' },
  { id: 'p-sp',     regiao: 'SP',         status: 'CONFIRMADO', semana_inicio: '2026-10-26' },
  { id: 'p-cancel', regiao: 'RJ',         status: 'CANCELADO',  semana_inicio: '2026-10-26' },
  { id: 'p-horti',  regiao: 'HORTIFRUTI', status: 'RASCUNHO',   semana_inicio: '2026-10-26' },
  { id: 'p-ant',    regiao: 'RJ',         status: 'CONFIRMADO', semana_inicio: '2026-10-19' },
];
// Mesmo produto, id diferente por região — como no banco.
const CATALOGO = [
  { id: 'boi-rj',   produto: 'BOI BUMBA (2 UNI)',           und: 'PCT', fornecedor: 'PETISCOS' },
  { id: 'boi-sp',   produto: 'BOI BUMBA (2 UNI)',           und: 'PCT', fornecedor: 'PETISCOS' },
  // Espaço dobrado no nome do Rio, igual ao "RABADA DESFIADA  500G" que está na base:
  // sem normalizar, viram dois produtos e cada um com metade do total.
  { id: 'rab-rj',   produto: 'RABADA DESFIADA  500G',       und: 'PT',  fornecedor: 'PETISCOS' },
  { id: 'rab-sp',   produto: 'RABADA DESFIADA 500G',        und: 'PT',  fornecedor: 'PETISCOS' },
  { id: 'so-rj',    produto: 'XIQUE DE CAMARÃO 200G',       und: 'UND', fornecedor: 'PETISCOS' },
  // Produto cujo UNICO lancamento e zero: sem a guarda de qtd>0 ele vira uma linha de
  // "0 UND" na lista que vai pro fornecedor. O zero plantado num produto que ja tem outras
  // quantidades nao prova nada — some na soma.
  { id: 'inh-rj',   produto: 'INHOQUE 250G',                und: 'UND', fornecedor: 'PETISCOS' },
  { id: 'outro-rj', produto: 'ALHO DESCASCADO',             und: 'KG',  fornecedor: 'HORTIFRUTI' },
];
const ITENS = [
  // Rio: duas lojas pedem Boi Bumbá
  { pedido_id: 'p-rj', catalogo_id: 'boi-rj', loja_slug: 'bangu',      qtd_pedida: 50 },
  { pedido_id: 'p-rj', catalogo_id: 'boi-rj', loja_slug: 'caxias',     qtd_pedida: 26 },
  // SP: uma loja
  { pedido_id: 'p-sp', catalogo_id: 'boi-sp', loja_slug: 'itaquera',   qtd_pedida: 30 },
  // Rabada nas duas regiões, com o nome escrito diferente
  { pedido_id: 'p-rj', catalogo_id: 'rab-rj', loja_slug: 'bangu',      qtd_pedida: 24 },
  { pedido_id: 'p-sp', catalogo_id: 'rab-sp', loja_slug: 'guarulhos',  qtd_pedida: 5  },
  // Item só do Rio — não pode ganhar quebra por região
  { pedido_id: 'p-rj', catalogo_id: 'so-rj',  loja_slug: 'pedreira',   qtd_pedida: 25 },
  // O que NÃO pode entrar:
  { pedido_id: 'p-cancel', catalogo_id: 'boi-rj', loja_slug: 'bangu',      qtd_pedida: 999 }, // cancelado
  { pedido_id: 'p-rj',     catalogo_id: 'boi-rj', loja_slug: 'maglia',     qtd_pedida: 500 }, // Maglia
  { pedido_id: 'p-rj',     catalogo_id: 'boi-rj', loja_slug: 'loja_teste', qtd_pedida: 300 }, // teste
  { pedido_id: 'p-rj',     catalogo_id: 'boi-rj', loja_slug: 'mandacaru',  qtd_pedida: 400 }, // interno
  { pedido_id: 'p-rj',     catalogo_id: 'outro-rj', loja_slug: 'bangu',    qtd_pedida: 77  }, // outro fornecedor
  { pedido_id: 'p-rj',     catalogo_id: 'boi-rj', loja_slug: 'norte_shopping', qtd_pedida: 0 }, // zero
  { pedido_id: 'p-rj',     catalogo_id: 'inh-rj', loja_slug: 'boulevard',      qtd_pedida: 0 }, // so zero
  { pedido_id: 'p-ant',    catalogo_id: 'boi-rj', loja_slug: 'bangu',      qtd_pedida: 888 }, // outra semana
];

// Um PostgREST de brinquedo: respeita os filtros que o app manda. É o que dá sentido às
// checagens de exclusão — se o app parar de mandar `status=neq.CANCELADO`, os 999 chegam.
// A contagem que cada loja faz na aba Pedido do app Lojas. S.contagens guarda a MAIS
// RECENTE por produto+loja, e _estAntVigEfetivo so a trata como Est.vig (estoque de
// agora) quando ela e DESTA semana — contagem velha vira Est.ant e nao entra na soma.
const CONTAGENS = {
  'boi-rj': {
    bangu:          { atual: 30, data_contagem: '2026-10-27' },
    caxias:         { atual: 12, data_contagem: '2026-10-26' },
    maglia:         { atual: 99, data_contagem: '2026-10-27' },  // fora da rede
    norte_shopping: { atual:  7, data_contagem: '2026-10-19' },  // semana PASSADA
  },
  'boi-sp': { itaquera: { atual: 8, data_contagem: '2026-10-28' } },
  // Rabada: so contagem velha — tem que sair como "nenhuma loja contou".
  'rab-rj': { bangu: { atual: 40, data_contagem: '2026-10-18' } },
  // Xique: contado com zero, que e diferente de nao ter contado.
  'so-rj':  { pedreira: { atual: 0, data_contagem: '2026-10-29' } },
};

function responder(url) {
  const u = new URL(url);
  const tabela = u.pathname.split('/').pop();
  const base = tabela === 'gn_pedidos' ? PEDIDOS
             : tabela === 'gn_pedido_itens' ? ITENS
             : tabela === 'gn_catalogo' ? CATALOGO : [];
  let linhas = base.slice();
  u.searchParams.forEach((valor, campo) => {
    if (campo === 'select' || campo === 'order' || campo === 'limit' || campo === 'offset') return;
    const m = String(valor).match(/^(eq|neq|in)\.(.*)$/s);
    if (!m) return;
    const [, op, resto] = m;
    if (op === 'eq')  linhas = linhas.filter(l => String(l[campo]) === resto);
    if (op === 'neq') linhas = linhas.filter(l => String(l[campo]) !== resto);
    if (op === 'in') {
      const lista = resto.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''));
      linhas = linhas.filter(l => lista.includes(String(l[campo])));
    }
  });
  return linhas;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  // Fuso a oeste de UTC: a semana da contagem e montada a partir de uma data em texto, e
  // e ai que um toISOString() descuidado devolve o dia anterior.
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 },
                                         timezoneId: 'America/Sao_Paulo' });
  const urls = [];
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    urls.push(u);
    let corpo = '[]';
    try { corpo = JSON.stringify(responder(u)); } catch (e) {}
    return r.fulfill({ status: 200, contentType: 'application/json', body: corpo });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + ARQ);
  // A espera NAO exige as funcoes novas: contra a versao anterior a suite precisa carregar
  // e falhar nos NUMEROS, nao na ausencia da funcao — senao a contraprova so provaria que
  // a funcao e nova.
  await CAMINHOS.esperarApp(page, ['S', 'OSEAS_FORNECEDORES'],
    ['_totalCompradorSemanaCardHtml'], 30000);

  urls.length = 0;
  const r = await page.evaluate(async ({ CONTAGENS }) => {
    S.tab = 'oseas'; S.oseasAtivo = true; S.eduAtivo = false; S.matheusAtivo = false;
    S.pedidoAtual = { id: 'p-rj', semana_inicio: '2026-10-26', status: 'RASCUNHO', regiao: 'RJ' };
    S.contagens = CONTAGENS;
    S.totalCompradorCache = {};
    if (typeof _totalRedeOseasCache !== 'undefined') {
      Object.keys(_totalRedeOseasCache).forEach(k => delete _totalRedeOseasCache[k]);
      await _carregarTotalRedeOseas('2026-10-26');
    } else {
      // Versao anterior: o card soma UM pedido. Deixa carregar e segue — as checagens
      // abaixo e que dizem se o numero esta certo.
      _totalCompradorSemanaCardHtml();
      await new Promise(res => setTimeout(res, 1200));
    }
    const el = document.createElement('div');
    el.innerHTML = _totalCompradorSemanaCardHtml();
    // Um bloco por item: nome, a linha do PEDIDO e a linha do CONTADO. Lidas por marcador
    // (o ícone de cada uma), não por posição — posição quebra ao mexer no leiaute e o teste
    // passa a medir o leiaute em vez do número.
    const linhas = [...el.querySelectorAll('.oseas-linha')]
      .map(d => {
        const lin = t => t.replace(/\s+/g, ' ').trim();
        const ped = lin(d.children[1].textContent);
        const con = lin(d.children[2].textContent);
        const mPed = ped.match(/\ud83d\udce6 pedido ([^\u00b7]+?)(?:\s*\u00b7\s*(.*))?$/);
        const mCon = con.match(/\ud83c\udfea contado ([^\u00b7]+?) em (\d+) loja[s]?(?:\s*\u00b7\s*(.*))?$/);
        return {
          produto: lin(d.children[0].textContent),
          total: mPed ? mPed[1].trim() : null,
          quebra: mPed && mPed[2] ? mPed[2].trim() : '',
          contado: mCon ? mCon[1].trim() : null,
          lojas: mCon ? Number(mCon[2]) : null,
          quebraContado: mCon && mCon[3] ? mCon[3].trim() : '',
          semContagem: /nenhuma loja contou/.test(con),
        };
      });
    return {
      cache: typeof _totalRedeOseasCache !== 'undefined' ? _totalRedeOseasCache['2026-10-26'] : {},
      titulo: (el.querySelector('div > div') || {}).textContent || '',
      txt: el.textContent.replace(/\s+/g, ' ').trim(),
      linhas,
    };
  }, { CONTAGENS });

  // ══ 1. O NÚMERO DO EXEMPLO DO DONO ══════════════════════════════════════════════
  const boi = r.linhas.find(l => /BOI BUMBA/.test(l.produto)) || {};
  check('o Boi Bumbá aparece UMA vez, com o total da rede',
    r.linhas.filter(l => /BOI BUMBA/.test(l.produto)).length === 1, JSON.stringify(r.linhas));
  check('e o total é a soma das duas regiões (50 + 26 + 30 = 106)',
    boi.total === '106 PCT', JSON.stringify(boi));
  check('com a quebra por região ao lado, pra saber pra onde vai',
    boi.quebra === 'RJ 76 · SP 30', JSON.stringify(boi));

  // ══ 2. O MESMO PRODUTO COM id DIFERENTE POR REGIÃO ══════════════════════════════
  // Se a soma fosse por catalogo_id, a rabada viraria duas linhas de 24 e 5.
  const rab = r.linhas.filter(l => /RABADA/.test(l.produto));
  check('o produto escrito com espaço a mais não vira dois',
    rab.length === 1, JSON.stringify(rab));
  check('e soma as duas regiões (24 + 5 = 29)',
    (rab[0] || {}).total === '29 PT', JSON.stringify(rab));

  // ══ 3. ITEM DE UMA REGIÃO SÓ NÃO GANHA QUEBRA ═══════════════════════════════════
  // "RJ 25" ao lado de um total de 25 não informa nada e só enche a linha.
  const xiq = r.linhas.find(l => /XIQUE/.test(l.produto)) || {};
  check('item pedido só numa região mostra o total sem quebra',
    xiq.total === '25 UND' && xiq.quebra === '', JSON.stringify(xiq));

  // ══ 4. O QUE NÃO PODE ENTRAR ════════════════════════════════════════════════════
  check('o pedido cancelado não entra na conta',
    !/999/.test(r.txt) && /status=neq\.CANCELADO/.test(decodeURIComponent(urls.join(' '))),
    JSON.stringify({ txt: r.txt.slice(0, 200) }));
  check('Maglia, Loja Teste e Mandacaru ficam de fora',
    !/500|300|400/.test(boi.total || '') && boi.total === '106 PCT', JSON.stringify(boi));
  check('item de outro fornecedor não aparece na aba dos petiscos',
    !/ALHO DESCASCADO/.test(r.txt) && !/77/.test(r.txt), r.txt.slice(0, 300));
  check('quantidade zero não vira linha',
    r.linhas.every(l => !/^0 /.test(l.total)) && !/INHOQUE/.test(r.txt), JSON.stringify(r.linhas));
  check('pedido de outra semana não entra',
    !/888/.test(r.txt), r.txt.slice(0, 300));

  // ══ 5. A TELA DIZ O QUE ESTÁ SOMANDO ════════════════════════════════════════════
  check('o título diz que é a rede e quais regiões entraram',
    /Total da Rede/.test(r.titulo) && /RJ \+ SP/.test(r.titulo), r.titulo);
  check('e a legenda avisa quem fica de fora',
    /Maglia/.test(r.txt) && /cancelado não conta/.test(r.txt), r.txt.slice(0, 400));
  check('os três pedidos da semana foram lidos (RJ, SP e o hortifruti), menos o cancelado',
    r.cache.pedidos === 3, JSON.stringify({ pedidos: r.cache.pedidos }));

  // ══ 6. O ESTOQUE QUE AS LOJAS CONTARAM ═══════════════════════════
  // É outro número, não outra forma de ver o mesmo: um diz o que pediram, o outro o que
  // têm na mão. 100 pedidos com 80 em estoque é uma conversa; com 2, é outra.
  check('o item traz também o que as lojas contaram (30 + 12 + 8)',
    boi.contado === '50 PCT', JSON.stringify(boi));
  // 45 de 11 lojas e 45 de 3 lojas não querem dizer a mesma coisa.
  check('e diz de quantas lojas esse estoque veio',
    boi.lojas === 3, JSON.stringify(boi));
  check('com a quebra por região da contagem (42 no Rio, 8 em SP)',
    boi.quebraContado === 'RJ 42 · SP 8', JSON.stringify(boi));
  // Contagem da semana passada é Est.ant esperando ser recontado (_estAntVigEfetivo):
  // empilhar ela aqui misturaria dois momentos num número só.
  check('contagem de semana passada não entra na soma',
    boi.contado === '50 PCT' && !/\b57\b/.test(r.txt), JSON.stringify(boi));
  check('e Maglia também fica de fora da contagem',
    !/149|99/.test(boi.contado + boi.quebraContado), JSON.stringify(boi));
  const rabL = r.linhas.find(l => /RABADA/.test(l.produto)) || {};
  check('item cuja única contagem é velha sai como "nenhuma loja contou"',
    rabL.semContagem === true && rabL.contado === null, JSON.stringify(rabL));
  // Contado ZERO é informação: a loja olhou e não tinha. Diferente de não ter contado.
  const xiqL = r.linhas.find(l => /XIQUE/.test(l.produto)) || {};
  check('contado zero aparece como zero, não como "ninguém contou"',
    xiqL.contado === '0 UND' && xiqL.lojas === 1 && xiqL.semContagem === false, JSON.stringify(xiqL));
  check('a legenda explica os dois números',
    /pedido/.test(r.txt) && /em estoque/.test(r.txt) && /nesta semana/.test(r.txt),
    r.txt.slice(0, 600));

  // ══ 7. A ABA EDU CONTINUA COMO ERA ══════════════════════════════════════════════
  // "Só da aba Oseas, que são os petiscos" — o Edu soma o pedido ABERTO, não a rede.
  const edu = await page.evaluate(async () => {
    S.tab = 'edu'; S.eduAtivo = true; S.oseasAtivo = false;
    S.totalCompradorCache = {};
    const html = _totalCompradorSemanaCardHtml();
    return { html, usouRede: /Total da Rede/.test(html) };
  });
  check('a aba Edu não passou a somar a rede',
    edu.usouRede === false && /Total Pedido da Semana/.test(edu.html), edu.html.slice(0, 300));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
