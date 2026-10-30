// "No app Check-list, Campo Grande, nessa parte da aba abertura: mesmo clicando em não
//  ter reservas, ele aparece como se tivesse marcada as três, mas após salvar ele volta
//  sozinho como se não tivesse marcado."
//
// O "não tem reservas hoje" é a RESPOSTA do grupo, não um atalho pra marcar três
// caixinhas. Mas era só isso: espelhava `checked:true` nos três itens, e TODA a contagem
// — a bolinha do setor, o contador da aba e o card "O que falta hoje" — lia só esse
// espelho. Qualquer mesclagem em que o servidor vence apagava o espelho e deixava a marca
// órfã.
//
// MEDIDO na base, e é exatamente isso:
//   · 30/10, Campo Grande: `_semReservas:true` com os três itens em `checked:false`;
//   · 29/10, mesma loja: os mesmos três em `true`.
// A loja via, ao mesmo tempo, a confirmação verde na tela, "0/3" na bolinha e "faltam 3
// de 16 itens" no card. Três telas discordando do mesmo dado.
//
// O que esta suíte cobra é que a contagem passe a ler a MARCA, não o espelho — e que ela
// sobreviva à mesclagem que apagava tudo antes.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof _chkContagem === 'function' && typeof toggleSemReservas === 'function'
        && typeof updateAberturaCount === 'function' && SETORES_ABERTURA && SETORES_ABERTURA.reservas;
  } catch (e) { return false; } }, null, { timeout: 25000 });

  const nItens = await page.evaluate(() => SETORES_ABERTURA.reservas.items.length);
  check('o grupo de reservas tem itens pra contar', nItens > 0, String(nItens));
  check('e é o grupo marcado com o bypass', await page.evaluate(() => !!SETORES_ABERTURA.reservas.semReservas));

  const zerar = () => page.evaluate(() => {
    state.abertura = state.abertura || {};
    state.abertura.reservas = {};
    SETORES_ABERTURA.reservas.items.forEach((_, i) => {
      state.abertura.reservas[i] = { checked: false, problema: '', fotoBase64: '', fotoName: '' };
    });
  });

  // ══ 1. SEM A MARCA, NADA MUDA ═══════════════════════════════════════════════════
  await zerar();
  const vazio = await page.evaluate(() => _chkContagem('abertura', 'reservas'));
  check('sem a marca, o grupo conta zero de três',
    vazio.done === 0 && vazio.total === nItens && vazio.liberado === false, JSON.stringify(vazio));

  // ══ 2. COM A MARCA, O GRUPO ESTÁ RESPONDIDO ═════════════════════════════════════
  await page.evaluate(() => { state.abertura.reservas._semReservas = true; });
  const marcado = await page.evaluate(() => _chkContagem('abertura', 'reservas'));
  check('com a marca, o grupo conta como respondido por inteiro',
    marcado.done === nItens && marcado.liberado === true, JSON.stringify(marcado));

  // ══ 3. O CASO EXATO DA CAMPO GRANDE ═════════════════════════════════════════════
  // A marca de pé e o espelho apagado — o estado que está no banco em 30/10.
  const comoNoBanco = await page.evaluate(() => {
    state.abertura.reservas = { _semReservas: true };
    SETORES_ABERTURA.reservas.items.forEach((_, i) => {
      state.abertura.reservas[i] = { checked: false, problema: '', fotoBase64: '', fotoName: '', naoConforme: false };
    });
    return _chkContagem('abertura', 'reservas');
  });
  check('com a marca de pé e os itens em branco, o grupo NÃO volta a dever três',
    comoNoBanco.done === nItens, JSON.stringify(comoNoBanco));

  // E o card "O que falta hoje" tem que concordar com a tela.
  // A BOLINHA do setor — foi ela que o print mostrou dizendo "0/3" com a confirmação
  // verde logo abaixo. updateBadge devolve o que escreveu, então dá pra cobrar o número
  // sem depender do setor estar renderizado na tela.
  const badge = await page.evaluate(() => updateBadge('abertura', 'reservas'));
  check('a bolinha do setor mostra os três como respondidos, não 0/3',
    badge.done === nItens && badge.total === nItens, JSON.stringify(badge));

  // O card "O que falta hoje": com TODO o resto da abertura marcado, o único pendente
  // possível são as reservas. Assim o card some da lista — e cobrar a frase exata
  // ("faltam 3 de") passava por acidente, porque com os outros setores vazios o número
  // era outro e o regex não casava.
  const falta = await page.evaluate(() => {
    Object.keys(SETORES_ABERTURA).forEach(s => {
      if (s === 'reservas') return;
      state.abertura[s] = state.abertura[s] || {};
      SETORES_ABERTURA[s].items.forEach((_, i) => { state.abertura[s][i] = { checked: true }; });
    });
    const itens = _faltaHojeGruposDeCheck();
    const ab = itens.find(i => /abertura/i.test(i.label || ''));
    return { pendente: !!ab, detalhe: ab ? ab.detalhe : null };
  });
  check('com o resto da abertura pronto, o card não cobra mais nada dela',
    falta.pendente === false, JSON.stringify(falta));

  // E sem a marca, ele VOLTA a cobrar — senão a checagem acima passaria com o card
  // quebrado de um jeito que nunca cobra nada.
  const faltaSemMarca = await page.evaluate(() => {
    state.abertura.reservas._semReservas = false;
    const itens = _faltaHojeGruposDeCheck();
    const ab = itens.find(i => /abertura/i.test(i.label || ''));
    state.abertura.reservas._semReservas = true;
    return { pendente: !!ab, detalhe: ab ? ab.detalhe : null };
  });
  check('e sem a marca ele cobra os três que faltam',
    faltaSemMarca.pendente === true && /faltam 3 de/.test(String(faltaSemMarca.detalhe)),
    JSON.stringify(faltaSemMarca));

  // O contador da aba Abertura — a terceira tela que discordava das outras duas. Cobrado
  // pelo número EXATO: com todo o resto marcado e as reservas liberadas pela marca, ele
  // tem que fechar certinho. "Não começa com 0/" passava com o contador ainda errado,
  // porque os outros setores já somavam sozinhos.
  const contador = await page.evaluate(() => {
    updateAberturaCount();
    const el = document.getElementById('abertura-count');
    const total = Object.keys(SETORES_ABERTURA).reduce((a, s) => a + SETORES_ABERTURA[s].items.length, 0);
    return { txt: el ? el.textContent : null, esperado: total + '/' + total + ' itens' };
  });
  check('o contador da aba Abertura fecha com tudo respondido',
    contador.txt === contador.esperado, JSON.stringify(contador));

  // ══ 4. A MESCLAGEM QUE APAGAVA O ESPELHO ═══════════════════════════════════════
  // É a causa raiz: o servidor vence item a item, então o `checked:true` escrito pelo
  // bypass some na primeira sincronização. A marca sobrevive — e agora isso basta.
  const aposMerge = await page.evaluate(() => {
    toggleSemReservas(true);
    const antes = _chkContagem('abertura', 'reservas');
    // Exatamente o que a sincronização faz: o item do servidor vence o local.
    const doServidor = {};
    SETORES_ABERTURA.reservas.items.forEach((_, i) => {
      doServidor[i] = { checked: false, problema: '', fotoBase64: '', fotoName: '', naoConforme: false };
    });
    Object.keys(doServidor).forEach(i => {
      state.abertura.reservas[i] = { ...state.abertura.reservas[i], ...doServidor[i] };
    });
    return { antes, depois: _chkContagem('abertura', 'reservas'),
             marca: state.abertura.reservas._semReservas };
  });
  check('marcar o bypass deixa o grupo respondido',
    aposMerge.antes.done === nItens, JSON.stringify(aposMerge.antes));
  check('a sincronização continua apagando o espelho — não é isso que mudou',
    aposMerge.marca === true, JSON.stringify(aposMerge));
  check('mas o grupo CONTINUA respondido depois dela — era aqui que voltava a zero',
    aposMerge.depois.done === nItens, JSON.stringify(aposMerge.depois));

  // ══ 5. DESMARCAR TEM QUE VOLTAR A COBRAR ═══════════════════════════════════════
  // Senão o grupo ficaria liberado pra sempre — o oposto do problema, e pior.
  const desmarcado = await page.evaluate(() => {
    toggleSemReservas(false);
    return { c: _chkContagem('abertura', 'reservas'), marca: state.abertura.reservas._semReservas };
  });
  check('desmarcar o bypass tira a marca', desmarcado.marca === false, JSON.stringify(desmarcado));
  check('e o grupo volta a dever os três', desmarcado.c.done === 0, JSON.stringify(desmarcado.c));

  // ══ 6. OS OUTROS GRUPOS NÃO GANHAM ATALHO ══════════════════════════════════════
  // A marca só vale onde o bypass existe. Um `_semReservas` perdido noutro setor não
  // pode liberar nada — seria um jeito silencioso de pular check-list.
  const outro = await page.evaluate(() => {
    const setor = Object.keys(SETORES_ABERTURA).find(s => s !== 'reservas' && !SETORES_ABERTURA[s].semReservas);
    if (!setor) return null;
    state.abertura[setor] = { _semReservas: true };
    SETORES_ABERTURA[setor].items.forEach((_, i) => {
      state.abertura[setor][i] = { checked: false, problema: '', fotoBase64: '', fotoName: '' };
    });
    return { setor, c: _chkContagem('abertura', setor) };
  });
  if (outro) {
    check('a marca não libera um setor que não tem o bypass',
      outro.c.done === 0 && outro.c.liberado === false, JSON.stringify(outro));
  }

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
