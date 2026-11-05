// Cancelamentos no fechamento de caixa: valor, motivo e quem autorizou.
//
// O app não tem rota de teste: ele monta a tela a partir de S (estado) e grava no
// Supabase. Aqui o Supabase é dublado por rota do Playwright — o que interessa provar é o
// que o APP faz: o que ele exige antes de gravar, o que ele manda pro servidor, o que ele
// desenha, e o que entra no relatório que chega em quem confere.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + extra); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const gravados = [];        // o que o app REALMENTE mandou pro servidor
  const patches = [];         // PATCHs no fechamento (declaração de dia sem cancelamento)
  const tentativas = [];      // chamadas ao rpc/verificar_login
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), url = req.url(), metodo = req.method();
    // rpc/verificar_login: 'gerente1' com a senha certa é gerente (pode assinar);
    // 'caixa1' tem a senha certa mas cargo sem permissão. Qualquer outra senha falha.
    if (/rpc\/verificar_login/.test(url)) {
      const b2 = JSON.parse(req.postData() || '{}');
      tentativas.push({ nome: b2.p_nome, app: b2.p_app });
      if (b2.p_nome === 'gerente1' && b2.p_senha === 'certa')
        return r.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([{ id: 1, nome: 'Rafael Lima', cargo: 'gerente', loja: 'BANGU' }]) });
      if (b2.p_nome === 'caixa1' && b2.p_senha === 'certa')
        return r.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([{ id: 2, nome: 'Ana Souza', cargo: 'caixa', loja: 'BANGU' }]) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (/gn_caixa_fechamento/.test(url) && metodo === 'PATCH') {
      patches.push(JSON.parse(req.postData() || '{}'));
      return r.fulfill({ status: 204, body: '' });
    }
    if (/gn_caixa_cancelamento/.test(url) && metodo === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      gravados.push(body);
      return r.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify([{ id: 'id-' + gravados.length, criado_em: new Date().toISOString(), ...body }]) });
    }
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof renderTudo === 'function' && typeof S === 'object' && S !== null && typeof gnCancelamentoLiberado === 'function';
  } catch (e) { return false; } }, { timeout: 20000 });

  // Põe o app num fechamento aberto, como depois do login + escolha de turno.
  const montar = (loja) => page.evaluate((lj) => {
    S.user = { nome: 'Tiago', cargo: 'gerente' };
    S.loja = lj; S.turnoSel = 'NOITE'; S.modoConsulta = false;
    S.fech = { id: 'fech-1', loja: lj, data: '2026-10-15', turno: 'NOITE', status: 'ABERTO',
               operador: 'Tiago', suprimento_inicial: 700, repique: 0 };
    S.comprovantes = []; S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = [];
    document.querySelectorAll('.pane').forEach(p => p.classList.add('hidden'));
    document.getElementById('pane-fechar').classList.remove('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('telaLogin')?.classList.add('hidden');
    document.getElementById('telaTurno')?.classList.add('hidden');
    renderTudo();
  }, loja);
  await montar('BANGU');
  await page.waitForTimeout(250);

  // ── A seção existe e está utilizável no celular ────────────────────────────────────
  const sec = page.locator('#secCancel');
  check('a seção de cancelamentos aparece no fechamento', await sec.isVisible());
  check('e está dentro da largura do aparelho a 390px', await sec.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.width > 100 && r.left >= 0 && r.right <= innerWidth + 1;
  }));
  check('tem os campos pedidos: valor, motivo, quem autorizou e a senha dele',
    (await page.locator('#cancelVal').count()) === 1 &&
    (await page.locator('#cancelMotivo').count()) === 1 &&
    (await page.locator('#cancelAutorNome').count()) === 1 &&
    (await page.locator('#cancelAutorSenha').count()) === 1);
  check('começa sem nenhum cancelamento',
    (await page.locator('#listaCancel').textContent()).includes('Nenhum cancelamento'));

  // ── Os três são obrigatórios, e o app diz o que falta ──────────────────────────────
  await page.click('#secCancel .btn-add');
  await page.waitForTimeout(150);
  check('clicar em + sem preencher nada não grava',
    gravados.length === 0, 'gravados=' + gravados.length);
  // O motivo virou categoria + detalhe (ver e2e_cancel_categoria), e a categoria tem
  // mensagem própria — mais específica que "falta preencher o motivo", que não dizia o
  // que o campo queria. Os outros três continuam nomeados juntos.
  check('e a tela diz o que falta, nomeando valor, quem autorizou e a senha',
    /valor/.test(await page.locator('#cancelMsg').textContent()) &&
    /autorizou/.test(await page.locator('#cancelMsg').textContent()) &&
    /senha/.test(await page.locator('#cancelMsg').textContent()),
    'msg: ' + await page.locator('#cancelMsg').textContent());
  check('e cobra a categoria do cancelamento',
    /categoria/i.test(await page.locator('#cancelMsg').textContent()),
    'msg: ' + await page.locator('#cancelMsg').textContent());

  await page.fill('#cancelVal', '45,90');
  await page.click('#secCancel .btn-add');
  await page.waitForTimeout(150);
  check('com valor mas sem motivo nem autorização, continua sem gravar', gravados.length === 0);
  check('e a mensagem já não cobra o valor, só o que falta',
    !/o valor/.test(await page.locator('#cancelMsg').textContent()),
    'msg: ' + await page.locator('#cancelMsg').textContent());

  // ── Com tudo preenchido, grava ─────────────────────────────────────────────────────
  await page.selectOption('#cancelCategoria', 'Cliente desistiu');
  await page.fill('#cancelMotivo', 'Cliente desistiu do pedido');
  await page.fill('#cancelAutorNome', 'gerente1');
  await page.fill('#cancelAutorSenha', 'certa');
  await page.click('#secCancel .btn-add');
  await page.waitForTimeout(400);
  check('com os três preenchidos, grava', gravados.length === 1, 'gravados=' + gravados.length);
  check('mandando valor, motivo, quem autorizou e o fechamento do dia',
    gravados[0] && gravados[0].valor === 45.9 && gravados[0].motivo === 'Cliente desistiu do pedido'
    && gravados[0].autorizado_por === 'Rafael Lima' && gravados[0].fechamento_id === 'fech-1',
    JSON.stringify(gravados[0]));
  check('os campos são limpos pro próximo lançamento',
    (await page.locator('#cancelVal').inputValue()) === '' &&
    (await page.locator('#cancelMotivo').inputValue()) === '' &&
    (await page.locator('#cancelAutorNome').inputValue()) === '' &&
    (await page.locator('#cancelAutorSenha').inputValue()) === '');

  const lista = await page.locator('#listaCancel').textContent();
  check('o lançamento aparece na lista com motivo e quem autorizou',
    /Cliente desistiu do pedido/.test(lista) && /Rafael Lima/.test(lista), lista.trim().slice(0, 120));
  check('o total e a contagem acompanham',
    (await page.locator('#cancelTotal').textContent()).includes('45,90') &&
    (await page.locator('#cancelQtd').textContent()) === '1',
    await page.locator('#cancelTotal').textContent());

  // ── Segundo lançamento: o total soma ───────────────────────────────────────────────
  await page.fill('#cancelVal', '10,00');
  await page.selectOption('#cancelCategoria', 'Erro de lançamento');
  await page.fill('#cancelMotivo', 'Erro de digitação no valor');
  await page.fill('#cancelAutorNome', 'gerente1');
  await page.fill('#cancelAutorSenha', 'certa');
  await page.click('#secCancel .btn-add');
  await page.waitForTimeout(400);
  check('dá pra lançar mais de um cancelamento no mesmo dia', gravados.length === 2);
  check('e o total soma os dois (55,90)',
    (await page.locator('#cancelTotal').textContent()).includes('55,90'),
    await page.locator('#cancelTotal').textContent());

  // ── NÃO entra na conta do caixa ────────────────────────────────────────────────────
  const contas = await page.evaluate(() => ({
    totalGeral: totalGeral(), totLiquido: totLiquido(), totSaidas: totSaidas(), cancel: cancelTotal() }));
  check('cancelamento NÃO entra nas saídas nem no total do caixa (já saiu da venda no sistema)',
    contas.totSaidas === 0 && contas.cancel === 55.9,
    JSON.stringify(contas));

  // ── Chega em quem confere: entra no relatório ──────────────────────────────────────
  const texto = await page.evaluate(() => _buildTextoCaixa());
  check('o relatório do fechamento traz os cancelamentos',
    /CANCELAMENTOS \(2\)/.test(texto) && /Cliente desistiu do pedido/.test(texto)
    && /Rafael Lima/.test(texto) && /Total: R\$ 55,90/.test(texto),   // money() já traz o "R$"
    texto.split('━').pop().trim().slice(0, 200));
  check('e quando não houve nenhum, o relatório diz isso em vez de omitir',
    /CANCELAMENTOS\n  Nenhum/.test(await page.evaluate(() => { const g = S.cancel; S.cancel = [];
      const t = _buildTextoCaixa(); S.cancel = g; return t; })));

  // ── Nome com caractere de HTML não quebra a lista ──────────────────────────────────
  await page.evaluate(() => { S.cancel.push({ id: 'x9', valor: 1, motivo: '<b>teste</b>', autorizado_por: 'A & B' }); renderTudo(); });
  await page.waitForTimeout(150);
  check('motivo com HTML dentro é escapado, não interpretado',
    (await page.locator('#listaCancel b').count()) === 0 &&
    /<b>teste<\/b>/.test(await page.locator('#listaCancel').textContent()));

  // ── Escopo: a loja que não usa não vê a seção ──────────────────────────────────────
  await montar('MAGLIA');
  await page.waitForTimeout(250);
  check('a loja fora da regra não vê a seção de cancelamentos',
    !(await page.locator('#secCancel').isVisible()));
  check('e as 11 originais veem', await page.evaluate(() =>
    ['BANGU','CAXIAS','SÃO GONÇALO','NORTE SHOPPING','BOULEVARD','NOVA IGUAÇU','PEDREIRA',
     'NOVA AMÉRICA','CAMPO GRANDE','ITAQUERA','GUARULHOS'].every(l => gnCancelamentoLiberado(l))));

  // ══ "Se não tiver cancelado no dia é obrigado a ter a opção dia sem cancelamento,
  //     e o responsável." ═══════════════════════════════════════════════════════════
  await montar('BANGU');
  await page.waitForTimeout(250);

  check('sem nenhum cancelamento, a opção "dia sem cancelamento" aparece',
    await page.locator('#semCancelBox').isVisible() &&
    (await page.locator('#semCancelResp').count()) === 1);
  check('e já vem com quem está logado preenchido, mas editável',
    (await page.locator('#semCancelResp').inputValue()) === 'Tiago');
  check('e pede a senha, pra o nome não ser só um texto digitado',
    (await page.locator('#semCancelSenha').count()) === 1);

  // O caixa não fecha sem resposta.
  const erroFechar = async () => { await page.evaluate(() => { try { fecharCaixa(); } catch (e) {} });
    await page.waitForTimeout(200); return await page.locator('#fecharErro').textContent(); };
  check('sem cancelamento lançado e sem declaração, o fechamento é barrado por isso',
    /Cancelamentos/.test(await erroFechar()), await page.locator('#fecharErro').textContent());
  check('e a pendência aparece no checklist de pré-fechamento',
    /Cancelamentos do dia respondidos/.test(await page.locator('#preFecharCheck').textContent()));

  // Declarar exige o responsável E a senha dele.
  await page.fill('#semCancelResp', '   ');
  await page.fill('#semCancelSenha', '');
  await page.click('#semCancelBox .btn-add');
  await page.waitForTimeout(200);
  check('declarar sem dizer quem é o responsável não grava',
    patches.length === 0 && /Falta o usuário/.test(await page.locator('#semCancelMsg').textContent()),
    'msg: ' + await page.locator('#semCancelMsg').textContent());

  await page.fill('#semCancelResp', 'gerente1');
  await page.fill('#semCancelSenha', '');
  await page.click('#semCancelBox .btn-add');
  await page.waitForTimeout(200);
  check('com o nome mas sem a senha, também não grava',
    patches.length === 0 && /Falta a senha/.test(await page.locator('#semCancelMsg').textContent()),
    'msg: ' + await page.locator('#semCancelMsg').textContent());

  await page.fill('#semCancelResp', 'gerente1');
  await page.fill('#semCancelSenha', 'certa');
  await page.click('#semCancelBox .btn-add');
  await page.waitForTimeout(400);
  check('com o responsável e a senha, a declaração é gravada no fechamento',
    patches.length === 1 && patches[0].sem_cancelamento_por === 'Rafael Lima' && !!patches[0].sem_cancelamento_em,
    JSON.stringify(patches[0]));
  check('a tela passa a mostrar quem declarou',
    /Dia sem cancelamento/.test(await page.locator('#semCancelBox').textContent()) &&
    /Rafael Lima/.test(await page.locator('#semCancelBox').textContent()));
  check('e aí o fechamento não é mais barrado por cancelamento',
    !/Cancelamentos/.test(await erroFechar()), await page.locator('#fecharErro').textContent());

  // Declaração e cancelamento não podem coexistir.
  await page.fill('#cancelVal', '20,00');
  await page.selectOption('#cancelCategoria', 'Troca de pedido ou produto');
  await page.fill('#cancelMotivo', 'Mesa trocada na hora de lançar');
  await page.fill('#cancelAutorNome', 'gerente1');
  await page.fill('#cancelAutorSenha', 'certa');
  await page.click('#secCancel .btn-add');
  await page.waitForTimeout(500);
  check('lançar um cancelamento desfaz a declaração de "dia sem cancelamento"',
    await page.evaluate(() => !S.fech.sem_cancelamento_por),
    'ficou: ' + await page.evaluate(() => S.fech.sem_cancelamento_por));
  check('e o bloco da declaração some, pra não convidar a gravar contradição',
    (await page.locator('#semCancelBox').textContent()).trim() === '');

  // O relatório diz qual dos dois casos foi.
  check('o relatório registra a declaração quando foi dia sem cancelamento',
    /Dia sem cancelamento \(declarado por Ana\)/.test(await page.evaluate(() => {
      const g = S.cancel, h = S.fech.sem_cancelamento_por;
      S.cancel = []; S.fech.sem_cancelamento_por = 'Ana';
      const t = _buildTextoCaixa(); S.cancel = g; S.fech.sem_cancelamento_por = h; return t;
    })));

  // A fila offline tem que saber que PATCH é PATCH.
  check('um PATCH enfileirado é reenviado como PATCH, não como POST (senão duplicaria o fechamento)',
    await page.evaluate(() => flushPending.toString().includes("item.method==='PATCH'")));

  // ── Foto do cupom cancelado trava o fechamento ──────────────────────────────
  // Decisão do dono: obrigatória, mesma régua de valor, motivo e quem autorizou. O
  // registro sem o comprovante não dá pra conferir depois, e quem confere não está na
  // loja.
  await montar('BANGU');
  await page.waitForTimeout(250);
  const semFoto = await page.evaluate(() => {
    S.cancel = [{ id: 'c1', valor: 50, motivo: 'teste', autorizado_por: 'Ana', foto: null }];
    renderTudo();
    return { pendente: cancelamentoPendente(), semFoto: cancelamentosSemFoto().length,
             html: document.getElementById('listaCancel').innerHTML };
  });
  check('cancelamento lançado já responde a pergunta do dia', semFoto.pendente === false);
  check('mas sem a foto do cupom ele é contado como pendência', semFoto.semFoto === 1);
  check('e a lista diz na linha que isso trava o fechamento',
    /Sem foto do cupom — trava o fechamento/.test(semFoto.html), semFoto.html.slice(0, 300));
  check('com o botão de câmera pra resolver ali mesmo', /_abrirFotoCancel\('c1'\)/.test(semFoto.html));

  const comFoto = await page.evaluate(() => {
    S.cancel = [{ id: 'c1', valor: 50, motivo: 'teste', autorizado_por: 'Ana', foto: 'https://x/f.jpg' }];
    renderTudo();
    return { semFoto: cancelamentosSemFoto().length,
             html: document.getElementById('listaCancel').innerHTML };
  });
  check('com a foto anexada, a pendência some', comFoto.semFoto === 0);
  check('e a miniatura aparece no lugar do aviso',
    /<img src="https:\/\/x\/f\.jpg"/.test(comFoto.html) && !/trava o fechamento/.test(comFoto.html));

  // Lançamento ainda não sincronizado: o PATCH da foto iria pro id temporário e sumiria.
  const pendenteSync = await page.evaluate(() => {
    S.cancel = [{ id: 'tmp-1', valor: 50, motivo: 'teste', autorizado_por: 'Ana', foto: null, _pendente: true }];
    renderTudo();
    return document.getElementById('listaCancel').innerHTML;
  });
  check('lançamento pendente de sincronismo não oferece anexar foto',
    !/_abrirFotoCancel\('tmp-1'\)/.test(pendenteSync) && /Sincronize o lançamento/.test(pendenteSync),
    pendenteSync.slice(0, 300));

  // ── Assinatura com senha ────────────────────────────────────────────────────
  // Pergunta do dono: "se não a informação fura". Antes o nome era texto livre —
  // qualquer um digitava qualquer nome. Agora o nome gravado é o que a validação
  // devolve, e é isso que o teste tem que provar.
  await montar('BANGU');
  await page.waitForTimeout(250);
  const antes = gravados.length;

  const tentar = (nome, senha) => page.evaluate(async ({ nome, senha }) => {
    document.getElementById('cancelVal').value = '50,00';
    document.getElementById('cancelCategoria').value = 'Outro';
    document.getElementById('cancelMotivo').value = 'teste de lançamento';
    document.getElementById('cancelAutorNome').value = nome;
    document.getElementById('cancelAutorSenha').value = senha;
    await addCancelamento();
    return { msg: document.getElementById('cancelMsg').textContent, n: S.cancel.length };
  }, { nome, senha });

  const errada = await tentar('gerente1', 'errada');
  check('senha errada não grava o cancelamento', gravados.length === antes && errada.n === 0);
  check('e diz o que houve', /senha incorret/i.test(errada.msg), errada.msg);

  const semCargo = await tentar('caixa1', 'certa');
  check('senha certa mas cargo sem permissão também não grava',
    gravados.length === antes && semCargo.n === 0);
  check('e diz de quem é o cargo que faltou',
    /Ana Souza/.test(semCargo.msg) && /cargo/i.test(semCargo.msg), semCargo.msg);

  // O ponto central: o nome digitado é o LOGIN, o gravado é o nome verificado.
  const assinou = await tentar('gerente1', 'certa');
  check('com senha certa e cargo certo, grava', gravados.length === antes + 1 && assinou.n === 1);
  check('e o nome gravado é o VERIFICADO, não o digitado',
    gravados[gravados.length - 1].autorizado_por === 'Rafael Lima', JSON.stringify(gravados[gravados.length - 1]));
  check('a tentativa fica registrada com o contexto, não como login do app',
    tentativas.some(t => t.app === 'gn-caixa:cancelamento'), JSON.stringify(tentativas));
  check('os campos de senha são limpos depois de gravar',
    await page.evaluate(() => document.getElementById('cancelAutorSenha').value === ''));

  // A declaração de "dia sem cancelamento" segue a mesma regra.
  const nPatch = patches.length;
  const declarar = (nome, senha) => page.evaluate(async ({ nome, senha }) => {
    // Volta o fechamento pro estado "ninguém declarou ainda": sem isso a caixa mostra a
    // declaração já feita e o formulário nem existe.
    S.cancel = [];
    S.fech.sem_cancelamento_por = null; S.fech.sem_cancelamento_em = null;
    renderTudo();
    const campo = document.getElementById('semCancelResp');
    if (!campo) return { msg: 'sem caixa de declaração', ausente: true };
    campo.value = nome;
    document.getElementById('semCancelSenha').value = senha;
    await declararSemCancelamento();
    const msgEl = document.getElementById('semCancelMsg');
    return { msg: msgEl ? msgEl.textContent : '' };
  }, { nome, senha });

  const decErrada = await declarar('gerente1', 'errada');
  check('declaração com senha errada não grava',
    patches.length === nPatch && /senha incorret/i.test(decErrada.msg), decErrada.msg);
  const decOk = await declarar('gerente1', 'certa');
  check('com senha certa, a declaração grava', patches.length === nPatch + 1, decOk.msg);
  check('e o responsável gravado é o verificado',
    patches[patches.length - 1].sem_cancelamento_por === 'Rafael Lima',
    JSON.stringify(patches[patches.length - 1]));

  // Loja fora da regra não é cobrada pelo que não tem.
  await montar('MAGLIA');
  await page.waitForTimeout(250);
  check('a loja que não usa a seção também não é travada por ela no fechamento',
    await page.evaluate(() => cancelamentoPendente() === false));
  check('nem pela foto do cupom, que é da mesma regra',
    await page.evaluate(() => {
      S.cancel = [{ id: 'c9', valor: 10, motivo: 'x', autorizado_por: 'y', foto: null }];
      return cancelamentosSemFoto().length === 0;
    }));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0);
  reais.slice(0, 4).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
