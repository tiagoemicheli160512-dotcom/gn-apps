// "No app caixa nós colocamos a obrigatoriedade de colocar os cancelamentos. Precisamos
//  colocar também as transferências — não se deve ter, a não ser que seja de fato entre
//  mesas com consumo, e não quando existe um erro, pra tentar passar depois o item (que
//  gera um cancelamento tardio se não conseguir vender, e desperdício). É expressamente
//  proibido. No relatório tem que ter campo pra mesa de origem, mesa de destino, motivo da
//  transferência e quem autorizou, com a senha pra validar igual no cancelamento; e se não
//  tiver nenhuma no dia, mesmo sistema de senha pra validar que não teve."
//
// Mesma régua do e2e_cancelamento_caixa: o que interessa provar é o que o APP faz — o que
// exige antes de gravar, o que manda pro servidor, o que desenha, e o que chega em quem
// confere pelo relatório.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + extra); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const gravados = [];     // POSTs em gn_caixa_transferencia
  const patches = [];      // PATCHs no fechamento (declaração de dia sem transferência)
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
    if (/gn_caixa_transferencia/.test(url) && metodo === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      gravados.push(body);
      return r.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify([{ id: 'id-' + gravados.length, criado_em: new Date().toISOString(), ...body }]) });
    }
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const fotosSubidas = [];
  await ctx.route('**/storage/v1/**', async r => {
    fotosSubidas.push(r.request().url());
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof renderTudo === 'function' && typeof S === 'object' && S !== null
      && typeof gnTransferenciaLiberada === 'function';
  } catch (e) { return false; } }, { timeout: 20000 });

  const montar = (loja) => page.evaluate((lj) => {
    S.user = { nome: 'Tiago', cargo: 'gerente' };
    S.loja = lj; S.turnoSel = 'NOITE'; S.modoConsulta = false;
    S.fech = { id: 'fech-1', loja: lj, data: '2026-10-15', turno: 'NOITE', status: 'ABERTO',
               operador: 'Tiago', suprimento_inicial: 700, repique: 0 };
    S.comprovantes = []; S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = []; S.transf = [];
    document.querySelectorAll('.pane').forEach(p => p.classList.add('hidden'));
    document.getElementById('pane-fechar').classList.remove('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('telaLogin')?.classList.add('hidden');
    document.getElementById('telaTurno')?.classList.add('hidden');
    renderTudo();
  }, loja);
  await montar('BANGU');
  await page.waitForTimeout(250);
  const msg = () => page.locator('#transfMsg').textContent();

  // ── A seção existe e cabe no celular ───────────────────────────────────────────────
  check('a seção de transferências aparece no fechamento', await page.locator('#secTransf').isVisible());
  check('e está dentro da largura do aparelho a 390px', await page.locator('#secTransf').evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.width > 100 && r.left >= 0 && r.right <= innerWidth + 1;
  }));
  check('tem os quatro campos pedidos: origem, destino, motivo e quem autorizou (+ senha)',
    (await page.locator('#transfOrigem').count()) === 1 &&
    (await page.locator('#transfDestino').count()) === 1 &&
    (await page.locator('#transfMotivo').count()) === 1 &&
    (await page.locator('#transfAutorNome').count()) === 1 &&
    (await page.locator('#transfAutorSenha').count()) === 1);
  check('a tela diz a regra da casa (só entre mesas com consumo)',
    /só entre mesas com consumo/i.test(await page.locator('#secTransf').textContent()),
    (await page.locator('#secTransf').textContent()).trim().slice(0, 120));
  check('começa sem nenhuma transferência',
    (await page.locator('#listaTransf').textContent()).includes('Nenhuma transferência'));

  // ── Obrigatoriedade dos campos ─────────────────────────────────────────────────────
  await page.click('#secTransf .btn-add');
  await page.waitForTimeout(150);
  check('clicar em + sem preencher nada não grava', gravados.length === 0, 'gravados=' + gravados.length);
  check('e a tela nomeia o que falta: mesas, motivo, quem autorizou e a senha',
    /mesa de origem/i.test(await msg()) && /motivo/i.test(await msg())
    && /autorizou/i.test(await msg()) && /senha/i.test(await msg()), 'msg: ' + await msg());

  await page.fill('#transfOrigem', '12');
  await page.fill('#transfDestino', '12');
  await page.fill('#transfMotivo', 'cliente mudou de mesa com o consumo');
  await page.fill('#transfAutorNome', 'gerente1');
  await page.fill('#transfAutorSenha', 'certa');
  await page.click('#secTransf .btn-add');
  await page.waitForTimeout(250);
  check('origem igual ao destino não grava (não descreve transferência nenhuma)',
    gravados.length === 0 && /mesma mesa/i.test(await msg()), 'msg: ' + await msg());

  await page.fill('#transfDestino', '14');
  await page.fill('#transfMotivo', 'erro');
  await page.click('#secTransf .btn-add');
  await page.waitForTimeout(250);
  check('motivo de uma palavra não passa — é o registro que não serve depois',
    gravados.length === 0 && /detalhe/i.test(await msg()), 'msg: ' + await msg());

  // ── Senha: a assinatura é conferida, não digitada ──────────────────────────────────
  await page.fill('#transfMotivo', 'cliente mudou de mesa com o consumo');
  await page.fill('#transfAutorSenha', 'errada');
  await page.click('#secTransf .btn-add');
  await page.waitForTimeout(350);
  check('senha errada não grava', gravados.length === 0 && /incorret/i.test(await msg()), 'msg: ' + await msg());

  await page.fill('#transfAutorNome', 'caixa1');
  await page.fill('#transfAutorSenha', 'certa');
  await page.click('#secTransf .btn-add');
  await page.waitForTimeout(350);
  check('cargo sem permissão não assina, e a tela diz o nome e o cargo',
    gravados.length === 0 && /Ana Souza/.test(await msg()) && /caixa/.test(await msg()), 'msg: ' + await msg());

  // ── Lançamento válido ──────────────────────────────────────────────────────────────
  await page.fill('#transfAutorNome', 'gerente1');
  await page.fill('#transfAutorSenha', 'certa');
  await page.click('#secTransf .btn-add');
  await page.waitForTimeout(400);
  check('com tudo preenchido e a senha certa, grava', gravados.length === 1, 'gravados=' + gravados.length);
  check('manda origem, destino, motivo e o fechamento do dia',
    gravados[0] && gravados[0].mesa_origem === '12' && gravados[0].mesa_destino === '14'
    && gravados[0].motivo === 'cliente mudou de mesa com o consumo'
    && gravados[0].fechamento_id === 'fech-1', JSON.stringify(gravados[0]));
  check('o nome gravado é o VERIFICADO, não o digitado',
    gravados[0] && gravados[0].autorizado_por === 'Rafael Lima', JSON.stringify(gravados[0]));
  check('a senha foi conferida com o contexto próprio da transferência',
    tentativas.some(t => t.app === 'gn-caixa:transferencia'), JSON.stringify(tentativas));
  check('os campos são limpos pro próximo lançamento',
    (await page.locator('#transfOrigem').inputValue()) === '' &&
    (await page.locator('#transfDestino').inputValue()) === '' &&
    (await page.locator('#transfMotivo').inputValue()) === '' &&
    (await page.locator('#transfAutorNome').inputValue()) === '' &&
    (await page.locator('#transfAutorSenha').inputValue()) === '');

  const lista = await page.locator('#listaTransf').textContent();
  check('o lançamento aparece na lista com origem, destino, motivo e quem autorizou',
    /12/.test(lista) && /14/.test(lista) && /cliente mudou de mesa/.test(lista) && /Rafael Lima/.test(lista),
    lista.trim().slice(0, 150));
  check('a contagem acompanha', (await page.locator('#transfQtd').textContent()) === '1');

  // ── Não mexe em nenhuma conta do caixa ─────────────────────────────────────────────
  const contas = await page.evaluate(() => ({ totalGeral: totalGeral(), totSaidas: totSaidas(), totLiquido: totLiquido() }));
  check('transferência não entra em nenhuma conta do fechamento (não move dinheiro)',
    contas.totSaidas === 0 && contas.totalGeral === 0, JSON.stringify(contas));

  // ── Relatório ──────────────────────────────────────────────────────────────────────
  const texto = await page.evaluate(() => _buildTextoCaixa());
  check('o relatório do fechamento traz as transferências com tudo',
    /TRANSFERÊNCIAS DE MESA \(1\)/.test(texto) && /Mesa 12 → mesa 14/.test(texto)
    && /cliente mudou de mesa/.test(texto) && /Rafael Lima/.test(texto),
    texto.split('━').pop().trim().slice(0, 220));
  check('e o WhatsApp leva o mesmo bloco',
    /TRANSFERÊNCIAS DE MESA/.test(await page.evaluate(() => {
      // O caixa está ABERTO, e enviarWhats pergunta antes nesse caso — sem responder ao
      // confirm ele devolve sem abrir nada, e o teste mediria a pergunta, não o texto.
      let t = null;
      const origOpen = window.open, origConf = window.confirm;
      window.open = (u) => { t = u; return { focus(){} } };
      window.confirm = () => true;
      try { enviarWhats(); } catch (e) {}
      window.open = origOpen; window.confirm = origConf;
      return decodeURIComponent(String(t || '')); })));

  // ── HTML no texto não quebra a lista ───────────────────────────────────────────────
  await page.evaluate(() => { S.transf.push({ id: 'x9', mesa_origem: '<b>9</b>', mesa_destino: '10', motivo: 'x & y', autorizado_por: 'A & B' }); renderTudo(); });
  await page.waitForTimeout(150);
  check('texto com HTML dentro é escapado, não interpretado',
    (await page.locator('#listaTransf b').count()) === 0 &&
    /<b>9<\/b>/.test(await page.locator('#listaTransf').textContent()));
  await page.evaluate(() => { S.transf = S.transf.filter(x => x.id !== 'x9'); renderTudo(); });

  // ══ Foto da comanda: pedida junto com o resto, e trava o fechamento ═══════════════
  check('transferência sem foto avisa na própria linha',
    /Sem foto da comanda/.test(await page.locator('#listaTransf').textContent()),
    (await page.locator('#listaTransf').textContent()).trim().slice(0, 160));
  check('e oferece o botão de anexar', (await page.locator('#listaTransf button[onclick^="_abrirFotoTransf"]').count()) === 1);

  const erroFechar0 = async () => { await page.evaluate(() => { try { fecharCaixa(); } catch (e) {} });
    await page.waitForTimeout(250); return await page.locator('#fecharErro').textContent(); };
  check('sem a foto, o fechamento é barrado',
    /foto da comanda/.test(await erroFechar0()), await page.locator('#fecharErro').textContent());
  check('e o pré-fechamento conta quantas estão sem foto',
    /1 sem foto da comanda/.test(await page.locator('#preFecharCheck').textContent()),
    (await page.locator('#preFecharCheck').textContent()).trim().slice(0, 220));

  // Anexa de verdade, pelo input: o app comprime, sobe no Storage e só então grava a URL.
  const patchesFoto = [];
  await ctx.route('**/rest/v1/gn_caixa_transferencia**', async r => {
    if (r.request().method() === 'PATCH') { patchesFoto.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 204, body: '' }); }
    return r.fallback();
  });
  const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  // Tocar no 📷 abre o seletor de arquivo do sistema, que o Playwright não preenche. O
  // caminho medido aqui é o DEPOIS: a mesma marcação que o botão faz (_fotoTransfId) e o
  // arquivo entrando pelo input — que é onde mora o código que comprime, sobe e grava.
  await page.evaluate(() => { _fotoTransfId = S.transf[0].id; });
  await page.setInputFiles('#fotoTransfInput', { name: 'comanda.png', mimeType: 'image/png', buffer: png1x1 });
  await page.waitForTimeout(900);
  check('a foto sobe pro Storage na pasta da transferência',
    fotosSubidas.some(u => /gn-fotos\/caixa-transferencia\//.test(u)), JSON.stringify(fotosSubidas));
  check('e a URL é gravada no próprio lançamento',
    patchesFoto.some(p => typeof p.foto === 'string' && p.foto.length > 0), JSON.stringify(patchesFoto));
  check('com a foto, o aviso some da linha',
    !/Sem foto da comanda/.test(await page.locator('#listaTransf').textContent()));
  check('e o fechamento não é mais barrado por foto',
    !/foto da comanda/.test(await erroFechar0()), await page.locator('#fecharErro').textContent());

  // Tirar a foto devolve a trava — senão daria pra anexar, fechar e apagar depois.
  await page.evaluate(() => { window.confirm = () => true; });
  await page.click('#listaTransf button[onclick^="_excluirFotoTransf"]');
  await page.waitForTimeout(700);
  check('excluir a foto devolve a trava',
    patchesFoto.some(p => p.foto === null) && /foto da comanda/.test(await erroFechar0()),
    await page.locator('#fecharErro').textContent());
  // Devolve a foto pro resto da suíte não arrastar a pendência.
  await page.evaluate(() => { S.transf.forEach(x => { x.foto = 'https://exemplo/gn-fotos/caixa-transferencia/x.png'; }); renderTudo(); });

  // ── Escopo de loja ─────────────────────────────────────────────────────────────────
  await montar('MAGLIA');
  await page.waitForTimeout(250);
  check('a loja fora da regra não vê a seção', !(await page.locator('#secTransf').isVisible()));
  check('e não é cobrada no fechamento por transferência',
    await page.evaluate(() => transferenciaPendente() === false));
  check('as 11 originais estão dentro da regra', await page.evaluate(() =>
    ['BANGU','CAXIAS','SÃO GONÇALO','NORTE SHOPPING','BOULEVARD','NOVA IGUAÇU','PEDREIRA',
     'NOVA AMÉRICA','CAMPO GRANDE','ITAQUERA','GUARULHOS'].every(l => gnTransferenciaLiberada(l))));

  // ══ "Se não tiver nenhuma no dia, mesmo sistema: senha pra validar que não teve." ══
  await montar('BANGU');
  await page.waitForTimeout(250);
  check('sem transferência lançada, a opção "dia sem transferência" aparece',
    await page.locator('#semTransfBox').isVisible() && (await page.locator('#semTransfResp').count()) === 1);
  check('já vem com quem está logado preenchido, mas editável',
    (await page.locator('#semTransfResp').inputValue()) === 'Tiago');
  check('e pede a senha, pra o nome não ser só um texto digitado',
    (await page.locator('#semTransfSenha').count()) === 1);

  const erroFechar = async () => { await page.evaluate(() => { try { fecharCaixa(); } catch (e) {} });
    await page.waitForTimeout(250); return await page.locator('#fecharErro').textContent(); };
  check('sem transferência e sem declaração, o fechamento é barrado por isso',
    /[Tt]ransfer/.test(await erroFechar()), await page.locator('#fecharErro').textContent());
  check('e o pré-fechamento mostra a pendência',
    /Transferências de mesa/.test(await page.locator('#preFecharCheck').textContent()),
    (await page.locator('#preFecharCheck').textContent()).trim().slice(0, 200));

  const nPatches = patches.length;
  await page.fill('#semTransfResp', 'gerente1');
  await page.fill('#semTransfSenha', 'errada');
  await page.click('#semTransfBox .btn-add');
  await page.waitForTimeout(350);
  check('declarar com senha errada não grava nada',
    patches.length === nPatches && /incorret/i.test(await page.locator('#semTransfMsg').textContent()),
    await page.locator('#semTransfMsg').textContent());

  await page.fill('#semTransfSenha', 'certa');
  await page.click('#semTransfBox .btn-add');
  await page.waitForTimeout(450);
  check('com a senha certa, a declaração grava o nome VERIFICADO e a hora',
    patches.some(p => p.sem_transferencia_por === 'Rafael Lima' && p.sem_transferencia_em),
    JSON.stringify(patches));
  check('e a tela passa a mostrar quem assinou',
    /Rafael Lima/.test(await page.locator('#semTransfBox').textContent()),
    (await page.locator('#semTransfBox').textContent()).trim().slice(0, 140));
  check('com a declaração assinada, o fechamento não é mais barrado por transferência',
    !/[Tt]ransfer/.test(await erroFechar()), await page.locator('#fecharErro').textContent());
  check('o relatório diz quem declarou o dia sem transferência',
    /Dia sem transferência \(declarado por Rafael Lima\)/.test(await page.evaluate(() => _buildTextoCaixa())));

  // ── Declaração e lançamento não coexistem ──────────────────────────────────────────
  await page.fill('#transfOrigem', '3');
  await page.fill('#transfDestino', '5');
  await page.fill('#transfMotivo', 'juntaram as duas mesas na conta');
  await page.fill('#transfAutorNome', 'gerente1');
  await page.fill('#transfAutorSenha', 'certa');
  await page.click('#secTransf .btn-add');
  await page.waitForTimeout(500);
  check('lançar uma transferência desfaz o "dia sem transferência"',
    patches.some(p => p.sem_transferencia_por === null), JSON.stringify(patches.slice(-2)));
  check('e o botão de declarar some da tela', (await page.locator('#semTransfBox').textContent()).trim() === '');
  check('o lançamento novo também entra pedindo a foto',
    /Sem foto da comanda/.test(await page.locator('#listaTransf').textContent()),
    (await page.locator('#listaTransf').textContent()).trim().slice(0, 160));

  // ── Consulta (caixa fechado / somente leitura) ─────────────────────────────────────
  await page.evaluate(() => { S.modoConsulta = true; renderTudo(); });
  await page.waitForTimeout(200);
  check('em consulta não aparece botão de excluir a transferência',
    (await page.locator('#listaTransf .del').count()) === 0);
  await page.evaluate(() => { S.modoConsulta = true; S.transf = []; renderTudo(); });
  await page.waitForTimeout(200);
  check('e em consulta não oferece assinar o dia sem transferência',
    (await page.locator('#semTransfResp').count()) === 0);

  check('nenhum erro de JS em nenhum momento', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log('\n' + ARQ);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
