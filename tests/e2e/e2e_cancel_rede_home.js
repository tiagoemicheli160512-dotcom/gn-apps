// "Colocar um card no app home lojas, informando o percentual de cancelamento e venda e
// apontando qual a posição da loja na rede, para alertar sobre a necessidade de atuar nos
// cancelamentos."
//
// "app home lojas" é a Home do gn-home.html — a mesma plateia e o mesmo lugar do card de
// notas canceladas de ontem (e2e_cancel_ontem_home.js, cujo pedido veio com essas mesmas
// palavras). Eu tinha construído no app Lojas (gn-lojas.html) e o dono abriu a Home e não
// achou nada; esta suíte existe pro card ser cobrado ONDE ele foi pedido.
//
// O que se cobra aqui, e por quê:
//  - a média da rede é PONDERADA pelo faturamento, não a média das porcentagens. Os dados
//    são escolhidos pra as duas darem números diferentes (0,43% contra 0,40%): com dados
//    redondos as duas coincidem e a verificação passaria sem provar nada;
//  - loja sem faturamento fica FORA da ordem, em vez de entrar como 0% e virar a primeira;
//  - caixa fechado em branco gera o aviso MESMO com a loja em 1º com 0% — ali o 0% não é
//    mérito, é falta de lançamento, e elogiar seria o pior resultado possível;
//  - a chave chega em dois formatos (checklist_diario usa "Nova América", o fechamento usa
//    "NOVA AMERICA") e as duas pontas têm que casar;
//  - a Maglia não tem card e não entra na conta da rede (GN_CANCELAMENTO_FORA);
//  - consulta que falha deixa recado, em vez de o card sumir calado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const FAT = [
  { loja: 'Itaquera',     venda_salao: 50000,  venda_delivery: 0 },
  { loja: 'Nova América', venda_salao: 300000, venda_delivery: 0 },
  { loja: 'Bangu',        venda_salao: 60000,  venda_delivery: 40000 },
  { loja: 'Caxias',       venda_salao: 200000, venda_delivery: 0 },
  // Maglia COM faturamento alto: sem isso, excluí-la ou não dá no mesmo (cairia pelo
  // filtro de faturamento > 0) e a regra do CLAUDE.md passaria à toa.
  { loja: 'Maglia',       venda_salao: 100000, venda_delivery: 0 },
  // Norte Shopping de fora de propósito: cancela e não tem faturamento lançado.
];
const FECH = [
  // Itaquera: 0 cancelado (1º) MAS um caixa fechado em branco.
  { loja: 'ITAQUERA', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [] },
  { loja: 'NOVA AMERICA', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [{ valor: 300 }] },
  { loja: 'BANGU', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [{ valor: 500 }] },
  { loja: 'BANGU', status: 'FECHADO', sem_cancelamento_por: 'Ana', gn_caixa_cancelamento: [] },
  { loja: 'CAXIAS', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [{ valor: 1000 }, { valor: 1000 }] },
  { loja: 'NORTE SHOPPING', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [{ valor: 100 }] },
  { loja: 'MAGLIA', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [{ valor: 9999 }] },
  // Caixa ainda ABERTO não conta como em branco — ainda pode lançar.
  { loja: 'CAXIAS', status: 'ABERTO', sem_cancelamento_por: null, gn_caixa_cancelamento: [] },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  // Outubro de 2026: dentro do mês em que o controle entrou no ar, pro corte estar ativo.
  await CAMINHOS.fixarRelogio(ctx, '2026-10-26T10:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));

  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _renderCancelRedeHome === 'function' && Array.isArray(LOJAS_LISTA); }
        catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  // Monta o card trocando gnFetchJson, igual ao e2e_cancel_ontem_home. Zera o cache entre
  // cenários: sem isso o segundo cenário leria o resultado do primeiro.
  const montar = (opts) => page.evaluate(async ({ FAT, FECH, opts }) => {
    const orig = window.gnFetchJson;
    const urls = [];
    window.gnFetchJson = async (url, h, ctxName, fallback) => {
      urls.push(url);
      if (opts.falhar) return fallback;          // gnFetchJson devolve o padrão quando falha
      if (/checklist_diario/.test(url)) return FAT;
      if (/gn_caixa_fechamento/.test(url)) return FECH;
      return [];
    };
    _cancelRedeHome = null; _cancelRedeHomeChave = ''; _cancelRedeHomeIndo = false;
    // masterLoja e `let` de topo: `window.masterLoja = x` cria OUTRA propriedade e a
    // funcao continua lendo null — a mesma armadilha que tests/_env.js documenta. Atribuir
    // pelo nome alcanca a ligacao de verdade. (e2e_cancel_ontem_home.js tem a forma com
    // window e por isso nao exercita o caminho do mestre.)
    masterLoja = opts.masterLoja || null;
    try {
      await _renderCancelRedeHome(opts.mostrar !== false,
        { loja: opts.loja || 'BANGU', cargo: opts.cargo || 'gerente' }, !!opts.isMaster);
    } finally { window.gnFetchJson = orig; }
    const el = document.getElementById('cancel-rede-home-card');
    return { html: el ? el.innerHTML.trim() : null,
             txt: el ? el.textContent.replace(/\s+/g, ' ').trim() : null, urls };
  }, { FAT, FECH, opts: opts || {} });

  check('o placeholder do card existe na Home',
    await page.evaluate(() => !!document.getElementById('cancel-rede-home-card')));

  // ── Bangu: 500 de 100.000 = 0,50%, 3º de 4 ──────────────────────────────────────────
  const bangu = await montar({ loja: 'BANGU' });
  check('o card aparece na Home', !!(bangu.txt && bangu.txt.length > 20), bangu.txt);
  check('mostra o % da própria loja: 500 de 100.000 = 0,50%', /0,50%/.test(bangu.txt || ''), bangu.txt);
  check('aponta a posição na rede: 3º de 4', /3º de 4/.test(bangu.txt || ''), bangu.txt);
  // Ponderada: 2.800 / 650.000 = 0,4307…% → 0,43%. Média das porcentagens daria 0,40%.
  check('a média da rede é ponderada pelo faturamento (0,43%), não a média das % (0,40%)',
    /rede em 0,43%/.test(bangu.txt || ''), bangu.txt);
  check('mostra o cancelado e o faturamento que é o denominador',
    /500,00 cancelados/.test(bangu.txt || '') && /de R\$ ?100\.000,00 vendidos/.test((bangu.txt || '').replace(/ /g, ' ')), bangu.txt);
  check('sem caixa em branco, diz que a cobertura está completa (2 caixas)',
    /Todos os 2 caixas fechados/.test(bangu.txt || ''), bangu.txt);
  check('diz que o período começa quando o controle entrou no ar',
    /15\/10/.test(bangu.txt || '') && /controle de cancelamento entrou no ar/.test(bangu.txt || ''), bangu.txt);
  check('o período mostrado é 15/10 a 26/10, não 01/10',
    /15\/10 a 26\/10/.test(bangu.txt || '') && !/01\/10 a/.test(bangu.txt || ''), bangu.txt);
  check('as duas consultas do card saem com o período cortado',
    bangu.urls.length === 2 && bangu.urls.every(u => /2026-10-15/.test(u)), JSON.stringify(bangu.urls));

  // ── Itaquera: 1º com 0%, mas caixa em branco — o caso perigoso ──────────────────────
  const itq = await montar({ loja: 'ITAQUERA' });
  check('Itaquera em 1º de 4 com 0,00%',
    /1º de 4/.test(itq.txt || '') && /0,00%/.test(itq.txt || ''), itq.txt);
  check('mesmo em 1º com 0%, acusa o caixa fechado em branco',
    /1 caixa fechou sem lançar cancelamento/.test(itq.txt || ''), itq.txt);
  check('e avisa que o percentual está subestimado, em vez de elogiar',
    /subestimado/.test(itq.txt || '') && !/Todos os/.test(itq.txt || ''), itq.txt);

  // ── Norte Shopping: cancelou e não lançou faturamento ───────────────────────────────
  const norte = await montar({ loja: 'NORTE SHOPPING' });
  check('loja sem faturamento no período não recebe posição na rede',
    /Sem faturamento lançado no período/.test(norte.txt || '') && !/º de /.test(norte.txt || ''), norte.txt);
  check('e o % dela aparece como "—", não como 0%',
    /—/.test(norte.txt || '') && !/0,00%/.test(norte.txt || ''), norte.txt);

  // ── Nova América: a loja cuja chave diverge entre as duas tabelas ───────────────────
  const nova = await montar({ loja: 'NOVA AMERICA' });
  check('Nova América casa "Nova América" com "NOVA AMERICA": 300 de 300.000 = 0,10%',
    /0,10%/.test(nova.txt || ''), nova.txt);
  check('e fica em 2º de 4', /2º de 4/.test(nova.txt || ''), nova.txt);

  // ── Maglia: fora do controle ────────────────────────────────────────────────────────
  const maglia = await montar({ loja: 'MAGLIA' });
  check('a Maglia não recebe o card', maglia.html === '', JSON.stringify((maglia.html || '').slice(0, 160)));
  check('e a Maglia não gasta consulta nenhuma', maglia.urls.length === 0, JSON.stringify(maglia.urls));
  const caxias = await montar({ loja: 'CAXIAS' });
  check('os 9.999 da Maglia não entram na média da rede (seria 1,71% com ela)',
    /rede em 0,43%/.test(caxias.txt || ''), caxias.txt);
  check('nem na contagem de lojas: 4, não 5',
    /de 4/.test(caxias.txt || '') && !/de 5/.test(caxias.txt || ''), caxias.txt);
  check('Caxias em 4º de 4 com 1,00%',
    /4º de 4/.test(caxias.txt || '') && /1,00%/.test(caxias.txt || ''), caxias.txt);
  check('caixa ainda ABERTO não é contado como em branco',
    !/sem lançar cancelamento/.test(caxias.txt || ''), caxias.txt);

  // ── Quem não é da operação da loja não recebe o card ────────────────────────────────
  const outro = await montar({ loja: 'BANGU', cargo: 'compras' });
  check('cargo fora da operação da loja não recebe o card', outro.html === '', outro.html);
  const mestre = await montar({ loja: 'GERAL', cargo: 'mestre', isMaster: true, masterLoja: 'BANGU' });
  check('mestre navegando numa loja recebe o card daquela loja',
    /3º de 4/.test(mestre.txt || ''), mestre.txt);

  // ── Consulta que falha avisa, em vez de sumir ───────────────────────────────────────
  const falha = await montar({ loja: 'BANGU', falhar: true });
  check('consulta que falha deixa um recado, em vez de o card sumir calado',
    /Não deu pra carregar agora/.test(falha.txt || ''), falha.txt);

  // ── Consulta que nunca volta: o teto de 20s tem que agir ────────────────────────────
  // A Home dispara ~40 chamadas ao abrir, e acima do limite de conexões do navegador as
  // últimas ficam na fila: medido no caminho real, uma das duas do card não voltou em 120s.
  // Sem teto o card fica "Carregando" pra sempre — pior que dizer que não deu, porque tira
  // da pessoa a chance de tentar de novo. Esta verificação custa 20s de propósito: é o
  // tempo que se está cobrando.
  const t0 = Date.now();
  // NÃO se espera a promessa do app aqui. Sem o teto ela nunca assenta, e um `await` nela
  // faz a SUÍTE morrer em vez de falhar — vermelha sem resumo, que é a mais cara de ler.
  // Dispara e observa a tela, que é o que o usuário vê de qualquer jeito.
  await page.evaluate(() => {
    const orig = window.gnFetchJson;
    // Honra o AbortController como o fetch de verdade: sem isso a promessa não assenta nem
    // com o teto, e o teste mediria outra coisa.
    window.gnFetchJson = (url, h, ctxName, fallback, opts) => new Promise(res => {
      const sig = opts && opts.signal;
      if (sig) sig.addEventListener('abort', () => res(fallback));
    });
    _cancelRedeHome = null; _cancelRedeHomeChave = ''; _cancelRedeHomeIndo = false;
    masterLoja = null;
    _renderCancelRedeHome(true, { loja: 'BANGU', cargo: 'gerente' }, false)
      .finally(() => { window.gnFetchJson = orig; });
  });
  await page.waitForFunction(() => {
    const e = document.getElementById('cancel-rede-home-card');
    return e && /Não deu pra carregar/.test(e.textContent || '');
    // 3 argumentos: waitForFunction(fn, arg, opcoes). Com 2, o objeto vira o ARGUMENTO da
    // função e o tempo cai no padrão de 30s — foi o que aconteceu aqui, e a verificação
    // media 30s achando que media 70s.
  }, null, { timeout: 70000 }).catch(() => {});
  const pendurada = await page.evaluate(() => {
    const el = document.getElementById('cancel-rede-home-card');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  const seg = (Date.now() - t0) / 1000;
  check('consulta que nunca volta deixa de carregar pra sempre: vira recado',
    /Não deu pra carregar agora/.test(pendurada || ''), 'depois de ' + seg.toFixed(1) + 's: ' + pendurada);
  // Duas tentativas de 20s com 10s entre elas: ~50s até desistir. O limite de baixo prova
  // que ele INSISTIU (uma tentativa só desistiria em 20s) e o de cima, que não insiste pra
  // sempre.
  check('insiste uma vez antes de desistir: ~50s, não 20s', seg >= 45 && seg < 70, seg.toFixed(1) + 's');

  // ── Mês seguinte: o corte deixa de agir sozinho ─────────────────────────────────────
  await CAMINHOS.fixarRelogio(ctx, '2026-11-20T10:00:00');
  const nov = await montar({ loja: 'BANGU' });
  check('em novembro o período é o mês inteiro (01/11 a 20/11)',
    /01\/11 a 20\/11/.test(nov.txt || ''), nov.txt);
  check('e a nota sobre o início do controle desaparece',
    !/controle de cancelamento entrou no ar/.test(nov.txt || ''), nov.txt);

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
