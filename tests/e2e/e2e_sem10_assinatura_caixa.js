// "Pode criar essa assinatura sim, melhor."
//
// O problema que isto resolve nasceu no Painel: loja que fechou 95 caixas sem lançar uma
// nota sem 10% aparecia IGUAL a uma loja que simplesmente não teve mesa sem 10%. Zero e
// silêncio eram a mesma linha em branco, e não havia nada no banco pra separar os dois.
//
// A assinatura é a mesma do "dia sem cancelamento": nome conferido por senha, gravado no
// fechamento. O que esta suíte prova é o que o APP faz — o que ele exige antes de gravar,
// o que ele manda pro servidor, o que trava o fechamento, e o que ele NÃO deixa coexistir.
//
// Cada checagem dirige o caminho de verdade (clica, preenche, chama fecharCaixa) e olha o
// efeito: o PATCH que saiu, o texto que apareceu, a pendência que sumiu. Reimplementar a
// regra aqui e comparar com ela mesma não prova nada — é o jeito de uma suíte passar com
// o app quebrado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const patches = [];      // PATCHs no fechamento (é onde a declaração mora)
  const notas = [];        // POSTs em gn_caixa_gorjeta
  const tentativas = [];   // chamadas ao rpc/verificar_login
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), url = req.url(), metodo = req.method();
    if (/rpc\/verificar_login/.test(url)) {
      const b = JSON.parse(req.postData() || '{}');
      tentativas.push({ nome: b.p_nome, app: b.p_app });
      if (b.p_nome === 'gerente1' && b.p_senha === 'certa')
        return r.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([{ id: 1, nome: 'Rafael Lima', cargo: 'gerente', loja: 'BANGU' }]) });
      if (b.p_nome === 'caixa1' && b.p_senha === 'certa')
        return r.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([{ id: 2, nome: 'Ana Souza', cargo: 'caixa', loja: 'BANGU' }]) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (/gn_caixa_fechamento/.test(url) && metodo === 'PATCH') {
      patches.push(JSON.parse(req.postData() || '{}'));
      return r.fulfill({ status: 204, body: '' });
    }
    if (/gn_caixa_gorjeta/.test(url) && metodo === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      notas.push(body);
      return r.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify([{ id: 'nota-' + notas.length, ...body }]) });
    }
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof renderTudo === 'function' && typeof S === 'object' && S !== null
        && typeof renderSemNota10 === 'function' && typeof fecharCaixa === 'function';
  } catch (e) { return false; } }, { timeout: 20000 });

  // Põe o app num fechamento aberto, como depois do login + escolha de turno. A aba Sem
  // 10% e a aba Fechar ficam as duas montadas: a declaração mora numa e a trava na outra.
  const montar = (loja, extraFech) => page.evaluate(({ lj, ex }) => {
    S.user = { nome: 'Tiago', cargo: 'gerente' };
    S.loja = lj; S.turnoSel = 'NOITE'; S.modoConsulta = false;
    S.fech = Object.assign({ id: 'fech-1', loja: lj, data: '2026-10-15', turno: 'NOITE',
      status: 'ABERTO', operador: 'Tiago', suprimento_inicial: 700, repique: 0 }, ex || {});
    S.comprovantes = []; S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = []; S.transf = [];
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('hidden'));
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('telaLogin')?.classList.add('hidden');
    document.getElementById('telaTurno')?.classList.add('hidden');
    renderTudo();
  }, { lj: loja, ex: extraFech });
  const limpar = () => { patches.length = 0; notas.length = 0; tentativas.length = 0; };
  const box = () => page.locator('#semNota10Box');
  const txtBox = async () => (await box().textContent()) || '';
  const erroFechar = async () => { await page.evaluate(() => { try { fecharCaixa(); } catch (e) {} });
    await page.waitForTimeout(200); return (await page.locator('#fecharErro').textContent()) || ''; };
  // A LINHA da pendência, não a caixa que a contém: o wrapper do checklist também casa
  // com o texto, e cobrar ele dava verde mesmo com a linha vermelha dentro.
  const linhaChk = () => page.evaluate(() => {
    const l = [...document.querySelectorAll('#preFecharCheck div')]
      .filter(d => /display:flex/.test(d.getAttribute('style') || ''))
      .find(d => /Notas sem 10%/.test(d.textContent));
    return l ? { txt: l.textContent.trim(), ok: /var\(--ok\)/.test(l.getAttribute('style') || '') } : null;
  });

  await montar('BANGU');
  await page.waitForTimeout(250);
  limpar();

  // ══ 1. SEM NOTA LANÇADA, A OPÇÃO APARECE — NA PRÓPRIA ABA SEM 10% ═══════════════
  check('o bloco "dia sem nota sem 10%" aparece quando não há nota lançada',
    await box().isVisible() && (await page.locator('#semNota10Resp').count()) === 1);
  check('e fica dentro da aba Sem 10%, não jogado na tela de fechar',
    await page.evaluate(() => !!document.querySelector('#pane-dez #semNota10Box')));
  check('e está dentro da largura do aparelho a 390px', await box().evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.width > 100 && r.left >= 0 && r.right <= innerWidth + 1;
  }));
  check('já vem com quem está logado preenchido, mas editável',
    (await page.locator('#semNota10Resp').inputValue()) === 'Tiago');
  check('e pede a senha, pra o nome não ser só um texto digitado',
    (await page.locator('#semNota10Senha').count()) === 1);

  // ══ 2. O CAIXA NÃO FECHA SEM RESPOSTA ═══════════════════════════════════════════
  const e1 = await erroFechar();
  check('sem nota lançada e sem declaração, o fechamento é barrado por isso',
    /Notas sem 10%/.test(e1), e1);
  check('e o erro diz onde resolver, que é a aba Sem 10%',
    /aba Sem 10%/.test(e1), e1);
  const chk0 = await linhaChk();
  check('a pendência também aparece no checklist de pré-fechamento',
    chk0 && /Notas sem 10% do dia respondidas/.test(chk0.txt), JSON.stringify(chk0));
  check('e aparece como pendente, não como resolvida',
    chk0 && chk0.ok === false, JSON.stringify(chk0));

  // ══ 3. ASSINAR EXIGE NOME, SENHA E CARGO ════════════════════════════════════════
  await page.fill('#semNota10Resp', '   ');
  await page.fill('#semNota10Senha', '');
  await page.click('#semNota10Box .btn-add');
  await page.waitForTimeout(200);
  check('declarar sem dizer quem é o responsável não grava nada',
    patches.length === 0 && /Falta o usuário/.test(await page.locator('#semNota10Msg').textContent()),
    'patches=' + patches.length + ' msg=' + await page.locator('#semNota10Msg').textContent());

  await page.fill('#semNota10Resp', 'gerente1');
  await page.fill('#semNota10Senha', '');
  await page.click('#semNota10Box .btn-add');
  await page.waitForTimeout(200);
  check('com o nome mas sem a senha, também não grava',
    patches.length === 0 && /Falta a senha/.test(await page.locator('#semNota10Msg').textContent()),
    'patches=' + patches.length + ' msg=' + await page.locator('#semNota10Msg').textContent());

  await page.fill('#semNota10Resp', 'gerente1');
  await page.fill('#semNota10Senha', 'errada');
  await page.click('#semNota10Box .btn-add');
  await page.waitForTimeout(350);
  check('senha errada não grava, e a tela diz isso',
    patches.length === 0 && /incorret/i.test(await page.locator('#semNota10Msg').textContent()),
    'patches=' + patches.length + ' msg=' + await page.locator('#semNota10Msg').textContent());

  // Senha certa de quem não responde pela loja: a assinatura perde o sentido se o
  // operador pode assinar a própria ausência de lançamento.
  await page.fill('#semNota10Resp', 'caixa1');
  await page.fill('#semNota10Senha', 'certa');
  await page.click('#semNota10Box .btn-add');
  await page.waitForTimeout(350);
  check('senha certa de quem não tem cargo pra assinar também não grava',
    patches.length === 0 && /cargo/i.test(await page.locator('#semNota10Msg').textContent()),
    'patches=' + patches.length + ' msg=' + await page.locator('#semNota10Msg').textContent());
  check('e o fechamento continua barrado enquanto ninguém assinou',
    /Notas sem 10%/.test(await erroFechar()));

  // ══ 4. COM NOME E SENHA VÁLIDOS, GRAVA — E GRAVA O NOME CONFERIDO ═══════════════
  limpar();
  await page.fill('#semNota10Resp', 'gerente1');
  await page.fill('#semNota10Senha', 'certa');
  await page.click('#semNota10Box .btn-add');
  await page.waitForTimeout(450);
  check('com responsável e senha válidos, a declaração é gravada no fechamento',
    patches.length === 1 && !!patches[0].sem_nota10_em, JSON.stringify(patches[0]));
  // O que faz a declaração valer: o nome vem da validação, não do campo. Gravar
  // 'gerente1' seria gravar o que a pessoa digitou — qualquer um digita qualquer nome.
  check('e o nome gravado é o que a senha devolveu, não o que foi digitado',
    patches[0] && patches[0].sem_nota10_por === 'Rafael Lima', JSON.stringify(patches[0]));
  check('a conferência da senha é registrada como assinatura de nota sem 10%',
    tentativas.some(t => t.app === 'gn-caixa:sem-nota10'), JSON.stringify(tentativas));
  check('a tela passa a mostrar quem declarou',
    /Dia sem nota sem 10%/.test(await txtBox()) && /Rafael Lima/.test(await txtBox()), await txtBox());
  check('e aí o fechamento não é mais barrado por nota sem 10%',
    !/Notas sem 10%/.test(await erroFechar()), await page.locator('#fecharErro').textContent());
  const chk1 = await linhaChk();
  check('e o checklist passa a mostrar a pendência resolvida, com o visto verde',
    chk1 && chk1.ok === true && /^✓/.test(chk1.txt), JSON.stringify(chk1));

  // ══ 5. DECLARAÇÃO E NOTA NÃO PODEM COEXISTIR ════════════════════════════════════
  limpar();
  await page.fill('#dezMesa', '12');
  await page.fill('#dezGarcom', 'Ana');
  await page.fill('#dezVal', '240,00');
  await page.click('#pane-dez .btn-add');
  await page.waitForTimeout(500);
  check('lançar uma nota grava a nota', notas.length === 1, JSON.stringify(notas));
  check('e desfaz a declaração de "dia sem nota sem 10%"',
    await page.evaluate(() => !S.fech.sem_nota10_por),
    'ficou: ' + await page.evaluate(() => S.fech.sem_nota10_por));
  check('mandando o desfazer pro servidor, não só limpando a tela',
    patches.some(p => p.sem_nota10_por === null), JSON.stringify(patches));
  check('e o bloco da declaração some, pra não convidar a gravar contradição',
    (await txtBox()).trim() === '');
  check('com nota lançada, o checklist mostra quantas foram',
    /Notas sem 10% lançadas \(1\)/.test(await page.locator('#preFecharCheck').textContent()),
    await page.locator('#preFecharCheck').textContent());
  check('e o fechamento não é barrado por nota sem 10%',
    !/Notas sem 10%:/.test(await erroFechar()), await page.locator('#fecharErro').textContent());

  // O caminho inverso: com nota na tela, declarar é recusado mesmo se alguém chamar a
  // função direto (o bloco está escondido, mas esconder não é impedir).
  limpar();
  const recusa = await page.evaluate(async () => {
    const b = document.getElementById('semNota10Box');
    b.innerHTML = `<input id="semNota10Resp" value="gerente1"><input id="semNota10Senha" value="certa"><div id="semNota10Msg"></div>`;
    await declararSemNota10();
    return document.getElementById('semNota10Msg').textContent;
  });
  check('chamar a declaração com nota lançada é recusado, sem ir ao servidor',
    patches.length === 0 && /Já existe nota sem 10%/.test(recusa), 'patches=' + patches.length + ' msg=' + recusa);

  // ══ 6. MAGLIA FORA — NÃO USA A REGRA ════════════════════════════════════════════
  await montar('MAGLIA');
  await page.waitForTimeout(300);
  limpar();
  check('a Maglia não é cobrada pela assinatura',
    (await txtBox()).trim() === '', await txtBox());
  check('e o fechamento dela não é barrado por nota sem 10%',
    !/Notas sem 10%/.test(await erroFechar()), await page.locator('#fecharErro').textContent());
  check('nem a linha aparece no checklist dela',
    !/Notas sem 10%/.test(await page.locator('#preFecharCheck').textContent()),
    await page.locator('#preFecharCheck').textContent());
  check('as 11 originais são cobradas', await page.evaluate(() =>
    ['BANGU','CAXIAS','SÃO GONÇALO','NORTE SHOPPING','BOULEVARD','NOVA IGUAÇU','PEDREIRA',
     'NOVA AMÉRICA','CAMPO GRANDE','ITAQUERA','GUARULHOS'].every(l => gnSem10Liberado(l))));

  // ══ 7. CAIXA FECHADO E MODO CONSULTA NÃO DESFAZEM ═══════════════════════════════
  await montar('BANGU', { status: 'FECHADO', sem_nota10_por: 'Rafael Lima', sem_nota10_em: '2026-10-15T23:30:00Z' });
  await page.waitForTimeout(300);
  check('em caixa já fechado, a declaração aparece mas sem o botão de desfazer',
    /Rafael Lima/.test(await txtBox()) && (await page.locator('#semNota10Box .del').count()) === 0,
    await txtBox());
  await montar('BANGU');
  await page.evaluate(() => { S.modoConsulta = true; renderTudo(); });
  await page.waitForTimeout(250);
  check('em modo consulta não há o que assinar',
    (await txtBox()).trim() === '', await txtBox());

  // ══ 8. O RELATÓRIO DIZ QUAL DOS DOIS CASOS FOI ══════════════════════════════════
  // É o mesmo problema do Painel, na folha que chega em quem confere: "Valor das notas:
  // R$ 0,00" não diz se a loja não teve mesa sem 10% ou se não lançou.
  const rel = await page.evaluate(() => {
    S.modoConsulta = false; S.notas10 = [];
    S.fech.sem_nota10_por = 'Ana'; S.fech.sem_nota10_em = '2026-10-15T23:00:00Z';
    const comAssinatura = _buildTextoCaixa();
    S.fech.sem_nota10_por = null; S.fech.sem_nota10_em = null;
    const semAssinatura = _buildTextoCaixa();
    S.notas10 = [{ id: 'n1', mesa: '5', garcom: 'Bia', valor: 100 }];
    const comNota = _buildTextoCaixa();
    S.notas10 = [];
    return { comAssinatura, semAssinatura, comNota };
  });
  check('o relatório registra a declaração quando foi dia sem nota sem 10%',
    /Dia sem nota sem 10% \(declarado por Ana\)/.test(rel.comAssinatura),
    rel.comAssinatura.slice(-400));
  check('e acusa quando não houve nota NEM declaração — não deixa o zero falar sozinho',
    /sem declaração de "dia sem nota sem 10%"/.test(rel.semAssinatura),
    rel.semAssinatura.slice(-400));
  check('com nota lançada, não sobra nenhuma das duas frases',
    !/Dia sem nota sem 10%/.test(rel.comNota) && !/sem declaração de "dia sem nota/.test(rel.comNota),
    rel.comNota.slice(-400));

  // ══ 9. A FILA OFFLINE NÃO PODE INVENTAR UM FECHAMENTO ═══════════════════════════
  // Declarar NÃO enfileira de propósito: a declaração é a resposta que destrava o
  // fechamento, e destravar em cima de algo que não gravou é o pior dos dois mundos.
  await montar('BANGU');
  await page.waitForTimeout(250);
  limpar();
  const offline = await page.evaluate(async () => {
    const orig = window.sb;
    // Derruba SÓ a gravação: a senha tem que ser conferida de verdade, senão o teste
    // provaria apenas que senha não conferida não grava — que é outro caminho, e o que
    // interessa aqui é o PATCH que falha DEPOIS da senha valer.
    window.sb = async (rota, opcoes) => {
      if (/verificar_login/.test(String(rota))) return orig(rota, opcoes);
      throw new Error('offline');
    };
    // A fila é lida por _pfLoad (a chave é interna ao app) — ler localStorage com uma
    // chave chutada daria sempre 0 e a checagem passaria com o app enfileirando.
    const antes = _pfLoad().length;
    document.getElementById('semNota10Resp').value = 'gerente1';
    document.getElementById('semNota10Senha').value = 'certa';
    await declararSemNota10();
    const el = document.getElementById('semNota10Msg');
    const depois = _pfLoad().length;
    window.sb = orig;
    return { msg: el ? el.textContent : '(bloco já re-renderizado como declarado)',
             antes, depois, declarou: !!S.fech.sem_nota10_por };
  });
  check('se a gravação falha, a declaração NÃO entra na fila offline',
    offline.depois === offline.antes, JSON.stringify(offline));
  check('e o fechamento não é destravado por uma declaração que não gravou',
    offline.declarou === false, JSON.stringify(offline));
  check('a tela pede pra tentar de novo em vez de dizer que deu certo',
    /tente de novo/i.test(offline.msg), offline.msg);

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::|offline/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
