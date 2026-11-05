// "Seria possível colocar um card no app home lojas, informando o percentual de
// cancelamento e venda e apontando qual a posição da loja na rede, para alertar sobre a
// necessidade de atuar nos cancelamentos."
//
// O que esta suíte cobra, e por que cada coisa:
//
//  - a média da rede é PONDERADA pelo faturamento, não a média das porcentagens. Os dados
//    aqui são escolhidos pra as duas darem números diferentes (0,43% ponderada contra
//    0,40% simples): com dados "redondos" as duas coincidem e a verificação passaria sem
//    provar nada;
//  - loja sem faturamento no período fica FORA da ordem, em vez de entrar como 0% e virar
//    a primeira colocada — é a mesma regra do ranking do Painel;
//  - caixa fechado em branco (sem lançamento e sem assinatura) tem que gerar o aviso MESMO
//    quando a loja está em 1º com 0%. É o caso perigoso: o 0% ali não é mérito, é falta de
//    lançamento, e elogiar seria o pior resultado possível;
//  - a chave da loja chega em dois formatos (checklist_diario usa "Nova América" com
//    acento, gn_caixa_fechamento usa "NOVA AMERICA" sem) e as duas pontas têm que casar —
//    foi exatamente aqui que um upper() à mão partiu a loja em duas quando eu medi o dado;
//  - a Maglia não tem o card: ela está fora do controle de cancelamento
//    (GN_CANCELAMENTO_FORA), e mostrar 0% afirmaria uma coisa falsa;
//  - o período começa no dia em que o controle entrou no ar. Com o mês inteiro, o
//    numerador cobre metade do período e o percentual sai pela metade.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Faturamento por loja — na chave do checklist_diario (chkKey, com acento).
const FAT = [
  { loja: 'Itaquera',     venda_salao: 50000,  venda_delivery: 0 },
  { loja: 'Nova América', venda_salao: 300000, venda_delivery: 0 },
  { loja: 'Bangu',        venda_salao: 60000,  venda_delivery: 40000 },
  { loja: 'Caxias',       venda_salao: 200000, venda_delivery: 0 },
  // Norte Shopping de propósito fora: tem cancelamento e nenhum faturamento lançado.
  // Maglia COM faturamento, e alto: sem isso, tirar ou não a Maglia da conta da rede dava
  // no mesmo (ela cairia pelo filtro de faturamento > 0) e a verificação da regra do
  // CLAUDE.md passava à toa — mutação confirmou que passava.
  { loja: 'Maglia',       venda_salao: 100000, venda_delivery: 0 },
];
// Fechamentos — na chave do gn_caixa_fechamento (userKey, sem acento).
const FECH = [
  // Itaquera: 0 cancelado (1º no ranking) MAS um caixa fechado em branco.
  { loja: 'ITAQUERA', data: '2026-10-20', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [] },
  { loja: 'NOVA AMERICA', data: '2026-10-20', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [{ valor: 300 }] },
  { loja: 'BANGU', data: '2026-10-20', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [{ valor: 500 }] },
  { loja: 'BANGU', data: '2026-10-21', status: 'FECHADO', sem_cancelamento_por: 'Ana', gn_caixa_cancelamento: [] },
  { loja: 'CAXIAS', data: '2026-10-20', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [{ valor: 1000 }, { valor: 1000 }] },
  { loja: 'NORTE SHOPPING', data: '2026-10-20', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [{ valor: 100 }] },
  // Maglia com cancelamento lançado: tem que ser ignorada, não somar na rede.
  { loja: 'MAGLIA', data: '2026-10-20', status: 'FECHADO', sem_cancelamento_por: null, gn_caixa_cancelamento: [{ valor: 9999 }] },
  // Caixa AINDA ABERTO não conta como em branco — ainda pode lançar.
  { loja: 'CAXIAS', data: '2026-10-26', status: 'ABERTO', sem_cancelamento_por: null, gn_caixa_cancelamento: [] },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  // Terça 20/10/2026: dentro do mês em que o controle entrou no ar, pra o corte de período
  // estar ativo. Sem fixar, a suíte mede que dia é hoje em vez do que quer medir.
  await CAMINHOS.fixarRelogio(ctx, '2026-10-26T10:00:00');
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (u.includes('checklist_diario') && u.includes('venda_salao')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAT) });
    }
    if (u.includes('gn_caixa_fechamento') && u.includes('gn_caixa_cancelamento')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FECH) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await CAMINHOS.esperarApp(page, ['tab', 'loja'], ['render', '_cancelRedeCardHome'], 30000);

  const abrir = async (lk) => {
    await page.evaluate(l => {
      usuarioAtual = { nome: 'Neto', cargo: 'gerente', loja: l };
      loja = l; tab = 'home'; render();
      _cancelRedeCardHome();
    }, lk);
    // Espera o card existir de verdade (a 1ª loja ainda passa pela consulta); pra Maglia
    // ele fica vazio de propósito, então quem checa vazio espera por tempo, não por texto.
    try {
      // "tem conteúdo" não serve como critério: o esqueleto de carregando também tem, e a
      // espera voltava com ELE em vez do card — foi assim que a verificação de novembro
      // passou a ler "Carregando os números da rede". O card pronto sempre diz
      // "do faturamento", com ou sem percentual; o esqueleto nunca.
      await page.waitForFunction(() => {
        const e = document.getElementById('cancelRedeCard');
        return e && /do faturamento|Sem faturamento lançado/.test(e.textContent || '');
      }, { timeout: 12000 });
    } catch (e) { /* deixa a verificação dizer o que faltou */ }
    return await page.evaluate(() => {
      const e = document.getElementById('cancelRedeCard');
      return { html: e ? e.innerHTML : null, txt: e ? e.textContent.replace(/\s+/g, ' ').trim() : null };
    });
  };

  // ── Bangu: 500 de 100.000 = 0,50%, 3º de 4 ──────────────────────────────────────────
  const bangu = await abrir('BANGU');
  check('o card aparece na Home da loja', !!(bangu.txt && bangu.txt.length > 20), bangu.txt);
  check('mostra o % da própria loja: 500 de 100.000 = 0,50%',
    /0,50%/.test(bangu.txt || ''), bangu.txt);
  check('aponta a posição na rede: 3º de 4',
    /3º de 4/.test(bangu.txt || ''), bangu.txt);
  // Ponderada: 2.800 / 650.000 = 0,4307…% → 0,43%. Média das porcentagens daria 0,40%.
  check('a média da rede é ponderada pelo faturamento (0,43%), não a média das % (0,40%)',
    /rede em 0,43%/.test((bangu.txt || '').replace(/\s+/g, ' ')), bangu.txt);
  check('mostra o valor cancelado e o faturamento que é o denominador',
    /R\$ 500,00 cancelados/.test(bangu.txt || '') && /de R\$ 100\.000,00 vendidos/.test(bangu.txt || ''), bangu.txt);
  check('conta as notas: 1 nota', /· 1 nota\b/.test(bangu.txt || ''), bangu.txt);
  check('sem caixa em branco, diz que a cobertura está completa (2 caixas)',
    /Todos os 2 caixas fechados/.test(bangu.txt || ''), bangu.txt);
  check('não acusa caixa em branco quando não há', !/sem lançar cancelamento/.test(bangu.txt || ''), bangu.txt);
  check('diz que o período começa quando o controle entrou no ar',
    /15\/10/.test(bangu.txt || '') && /controle de cancelamento entrou no ar/.test(bangu.txt || ''), bangu.txt);
  check('o período mostrado é 15/10 a 26/10, não 01/10',
    /15\/10 a 26\/10/.test(bangu.txt || '') && !/01\/10 a/.test(bangu.txt || ''), bangu.txt);

  // ── Itaquera: 1º com 0%, mas com caixa em branco — o caso perigoso ──────────────────
  const itq = await abrir('ITAQUERA');
  check('Itaquera aparece em 1º de 4 com 0,00%',
    /1º de 4/.test(itq.txt || '') && /0,00%/.test(itq.txt || ''), itq.txt);
  check('mesmo em 1º com 0%, acusa o caixa fechado em branco',
    /1 caixa fechou sem lançar cancelamento/.test(itq.txt || ''), itq.txt);
  check('e avisa que o percentual está subestimado, em vez de elogiar',
    /subestimado/.test(itq.txt || '') && !/Todos os/.test(itq.txt || ''), itq.txt);

  // ── Norte Shopping: cancelou, mas não lançou faturamento ────────────────────────────
  const norte = await abrir('NORTE SHOPPING');
  check('loja sem faturamento no período não recebe posição na rede',
    /Sem faturamento lançado no período/.test(norte.txt || '') && !/º de /.test(norte.txt || ''), norte.txt);
  check('e o % dela aparece como "—", não como 0%',
    /—/.test(norte.txt || '') && !/0,00%/.test(norte.txt || ''), norte.txt);

  // ── Nova América: a loja cuja chave diverge entre as duas tabelas ───────────────────
  const nova = await abrir('NOVA AMERICA');
  check('Nova América casa as duas chaves ("Nova América" e "NOVA AMERICA"): 300 de 300.000 = 0,10%',
    /0,10%/.test(nova.txt || '') && /de R\$ 300\.000,00 vendidos/.test(nova.txt || ''), nova.txt);
  check('e fica em 2º de 4', /2º de 4/.test(nova.txt || ''), nova.txt);

  // ── Maglia: fora do controle, sem card ──────────────────────────────────────────────
  await page.evaluate(() => {
    usuarioAtual = { nome: 'Neto', cargo: 'gerente', loja: 'MAGLIA' };
    loja = 'MAGLIA'; tab = 'home'; render(); _cancelRedeCardHome();
  });
  await page.waitForTimeout(600);
  const maglia = await page.evaluate(() => {
    const e = document.getElementById('cancelRedeCard');
    return e ? e.innerHTML.trim() : null;
  });
  check('a Maglia não recebe o card (está fora do controle de cancelamento)',
    maglia === '', JSON.stringify(maglia && maglia.slice(0, 200)));
  const semMaglia = await abrir('CAXIAS');
  // A Maglia tem 9.999 cancelados sobre 100.000 faturados (9,99%) na fixture. Se ela
  // entrasse na rede, a média iria pra 1,71% e a contagem pra "de 5" — então estas duas
  // medem a exclusão, e não apenas o formato do número.
  check('e os 9.999 da Maglia não entram na média da rede (seria 1,71% com ela)',
    /rede em 0,43%/.test(semMaglia.txt || ''), semMaglia.txt);
  check('nem na contagem de lojas da rede: 4, não 5',
    /de 4/.test(semMaglia.txt || '') && !/de 5/.test(semMaglia.txt || ''), semMaglia.txt);

  // ── Caxias: pior do grupo, 2.000 de 200.000 = 1,00%, 4º de 4 ────────────────────────
  check('Caxias em 4º de 4 com 1,00%',
    /4º de 4/.test(semMaglia.txt || '') && /1,00%/.test(semMaglia.txt || ''), semMaglia.txt);
  check('caixa ainda ABERTO não é contado como em branco',
    !/sem lançar cancelamento/.test(semMaglia.txt || ''), semMaglia.txt);

  // ── Mês seguinte: o corte de período deixa de agir sozinho ──────────────────────────
  await CAMINHOS.fixarRelogio(ctx, '2026-11-20T10:00:00');
  const nov = await abrir('BANGU');
  check('em novembro o período é o mês inteiro (01/11 a 20/11)',
    /01\/11 a 20\/11/.test(nov.txt || ''), nov.txt);
  check('e a nota sobre o início do controle desaparece',
    !/controle de cancelamento entrou no ar/.test(nov.txt || ''), nov.txt);

  // ── Maglia não dispara consulta nenhuma ─────────────────────────────────────────────
  // Esconder o card da Maglia já está garantido pelo filtro de lojas (mutação confirmou:
  // tirar o retorno antecipado de _cancelRedeCardHome não muda a tela). O que esse retorno
  // faz é não GASTAR as duas consultas numa loja que está fora da regra — e isso só se
  // mede num contexto novo, porque depois da primeira loja o resultado já está em cache.
  // Trocar de loja DEPOIS de abrir não serve pra medir isto: o app abre na loja padrão
  // (Caxias) e o card já gastou as consultas antes da troca — medido, 2 consultas. O
  // caminho real de quem é da Maglia é a sessão forçar a loja no boot: cargo que não
  // alterna loja faz carregarPermissaoLoja() abrir já na loja dele.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx2, '2026-10-26T10:00:00');
  await ctx2.addInitScript(() => {
    // Duas peças, porque o boot usa as duas: verificarSessao() olha o sessionStorage (e
    // exige validado:true), e carregarPermissaoLoja() olha o gn_session_v1 do localStorage.
    try {
      const u = { id: 9, nome: 'Rita', cargo: 'estoquista', loja: 'MAGLIA', permissoes: {}, validado: true };
      sessionStorage.setItem('gn_usuario', JSON.stringify(u));
      sessionStorage.setItem('gn_loja_sessao', 'MAGLIA');
      localStorage.setItem('gn_session_v1', JSON.stringify(Object.assign({ ts: Date.now() }, u)));
    } catch (e) {}
  });
  let doCard = 0;
  await ctx2.route('**/rest/v1/**', r => {
    const u = r.request().url();
    // Só as DUAS consultas do card: a Home faz outras no checklist_diario (o faturamento da
    // semana da própria loja), e contar tudo mediria o app inteiro em vez deste card.
    if (u.includes('gn_caixa_cancelamento(valor)') ||
        u.includes('select=loja,venda_salao,venda_delivery')) doCard++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p2 = await ctx2.newPage();
  await p2.goto('file://' + ARQ);
  await CAMINHOS.esperarApp(p2, ['tab', 'loja'], ['render', '_cancelRedeCardHome'], 30000);
  await p2.waitForTimeout(1200);
  const lojaAberta = await p2.evaluate(() => ({ loja: loja, forcada: lojaForcada, tab: tab }));
  check('a sessão da Maglia abre o app já na Maglia (é o caminho que se quer medir)',
    lojaAberta.loja === 'MAGLIA' && lojaAberta.forcada === 'MAGLIA', JSON.stringify(lojaAberta));
  check('e aí o card não gasta nenhuma das duas consultas', doCard === 0, 'consultas do card=' + doCard);
  await ctx2.close();

  // ── O card tem que ser ACHÁVEL ──────────────────────────────────────────────────────
  // Isto nasceu de um defeito real: o card funcionava, e mesmo assim o dono abriu o app e
  // disse que não tinha aparecido. Medido no arquivo em produção, com sessão de gerente e
  // tela de 844px: o topo do card caía em 814px (abaixo da dobra) e, até a consulta voltar,
  // a div ficava VAZIA — 16 segundos de buraco. As duas coisas juntas são indistinguíveis
  // de "não existe". Passar nos números e falhar aqui é passar no que não importa.
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await CAMINHOS.fixarRelogio(ctx3, '2026-10-26T10:00:00');
  await ctx3.addInitScript(() => {
    try {
      const u = { id: 7, nome: 'Neto', cargo: 'gerente', loja: 'BANGU', permissoes: {}, validado: true };
      sessionStorage.setItem('gn_usuario', JSON.stringify(u));
      sessionStorage.setItem('gn_loja_sessao', 'BANGU');
      localStorage.setItem('gn_session_v1', JSON.stringify(Object.assign({ ts: Date.now() }, u)));
    } catch (e) {}
  });
  // Resposta atrasada de propósito: sem atraso o card já chega pronto e o esqueleto —
  // que é justamente o que faltava — nunca seria exercido.
  await ctx3.route('**/rest/v1/**', async r => {
    const u = r.request().url();
    if (u.includes('select=loja,venda_salao,venda_delivery')) {
      await new Promise(res => setTimeout(res, 1500));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAT) });
    }
    if (u.includes('gn_caixa_cancelamento(valor)')) {
      await new Promise(res => setTimeout(res, 1500));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FECH) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p3 = await ctx3.newPage();
  await p3.goto('file://' + ARQ);
  await CAMINHOS.esperarApp(p3, ['tab', 'loja'], ['render', '_cancelRedeCardHome'], 30000);
  // Enquanto a consulta não volta: tem que haver algo na tela dizendo que vem número.
  await p3.waitForFunction(() => {
    const e = document.getElementById('cancelRedeCard');
    return e && e.innerHTML.trim().length > 0;
  }, { timeout: 10000 }).catch(() => {});
  const carregando = await p3.evaluate(() => {
    const e = document.getElementById('cancelRedeCard');
    return e ? e.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  check('enquanto a consulta não volta, o card mostra que está carregando (não um buraco)',
    /Carregando os números da rede/.test(carregando || ''), 'na tela: ' + JSON.stringify(carregando));

  await p3.waitForFunction(() => {
    const e = document.getElementById('cancelRedeCard');
    return e && /% do faturamento/.test(e.textContent || '');
  }, { timeout: 20000 }).catch(() => {});
  const pos = await p3.evaluate(() => {
    const e = document.querySelector('#cancelRedeCard > div');
    const fluxo = [...document.querySelectorAll('.sec-label')].find(x => /Fluxo da semana/.test(x.textContent || ''));
    const doc = document.scrollingElement || document.documentElement;
    const r = e ? e.getBoundingClientRect() : null;
    return {
      topo: r ? Math.round(r.top + (doc.scrollTop || 0)) : null,
      tela: innerHeight,
      // DOCUMENT_POSITION_FOLLOWING = 4: o Fluxo vem DEPOIS do card.
      cardAntesDoFluxo: !!(e && fluxo && (e.compareDocumentPosition(fluxo) & 4)),
    };
  });
  check('o card nasce dentro da primeira tela, sem precisar rolar',
    pos.topo !== null && pos.topo + 60 < pos.tela, JSON.stringify(pos));
  check('e vem antes do Fluxo da semana, que é o que o empurrava pra fora da dobra',
    pos.cardAntesDoFluxo, JSON.stringify(pos));
  await ctx3.close();

  // ── Consulta que falha avisa, em vez de sumir ───────────────────────────────────────
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await CAMINHOS.fixarRelogio(ctx4, '2026-10-26T10:00:00');
  await ctx4.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (u.includes('select=loja,venda_salao,venda_delivery') || u.includes('gn_caixa_cancelamento(valor)')) {
      return r.abort('failed');
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p4 = await ctx4.newPage();
  await p4.goto('file://' + ARQ);
  await CAMINHOS.esperarApp(p4, ['tab', 'loja'], ['render', '_cancelRedeCardHome'], 30000);
  // O card é repintado várias vezes enquanto a Home abre (o esqueleto volta a cada
  // render), então sondar o texto AGORA é uma corrida: a sondagem pode cair sempre nas
  // janelas de esqueleto e devolver "não avisou" num app que avisou. Um observador
  // registra que o aviso APARECEU, e isso nenhuma repintura desfaz. Instalado antes de
  // disparar, senão perde o primeiro aviso.
  await p4.evaluate(() => {
    window.__avisou = false;
    const marca = () => {
      const e = document.getElementById('cancelRedeCard');
      if (e && /Não deu pra carregar|% do faturamento/.test(e.textContent || '')) window.__avisou = true;
    };
    new MutationObserver(marca).observe(document.body, { childList: true, subtree: true, characterData: true });
    usuarioAtual = { nome: 'Neto', cargo: 'gerente', loja: 'BANGU' };
    loja = 'BANGU'; tab = 'home'; render(); _cancelRedeCardHome();
    marca();
  });
  // Três correções nesta espera, todas medidas — e nenhuma por defeito no app, que não
  // está nem no diff (gn-lojas.html não é tocado aqui):
  //
  // 1. `{timeout}` estava na posição do ARGUMENTO de waitForFunction, não das opções: os
  //    15 s pedidos nunca valeram, a espera caía no padrão.
  // 2. `polling: 250`. O padrão é requestAnimationFrame, que o Chromium estrangula quando
  //    a máquina está carregada — a sondagem perdia as janelas em que o aviso estava na
  //    tela e devolvia o esqueleto. Um intervalo de verdade não depende de frame.
  // 3. 60 s em vez de 15: a rajada de abertura da Home ocupa a fila de conexões e a
  //    requisição do card só sai depois dela. Medido: com 25 s de espera o aviso aparece
  //    em 4 de 4 rodadas; com a sondagem por frame e 15 s, 2 de 5 falhavam, e no CI 1
  //    falha em 135 suítes.
  await p4.waitForFunction(() => window.__avisou === true,
    null, { timeout: 60000, polling: 250 }).catch(() => {});
  const falha = await p4.evaluate(() => {
    const e = document.getElementById('cancelRedeCard');
    return { avisou: window.__avisou === true,
             agora: e ? e.textContent.replace(/\s+/g, ' ').trim() : null };
  });
  check('consulta que falha deixa um recado, em vez de o card sumir calado',
    falha.avisou === true, 'na tela: ' + JSON.stringify(falha));
  await ctx4.close();

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
