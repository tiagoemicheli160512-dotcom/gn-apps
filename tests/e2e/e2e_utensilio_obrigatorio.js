// "Teve o registro de um utensílio quebrado, mas não aparece qual né. A quantidade, pode
//  verificar. Tem que ser obrigatório colocar nome e quantidade."
//
// Medido no banco antes de escrever uma linha: dos lançamentos de louça que existem, TODOS
// estão sem nome e sem quantidade. Não é alguém que esqueceu — é a feature inteira
// chegando vazia no app de Manutenção como "Utensílio / Louça · Salão · Quebrou".
//
// A causa é o caminho: um toque no "+ Registrar" já criava e GRAVAVA o item em branco, e o
// nome da peça morava lá embaixo num campo chamado "Descrição", placeholder "Descreva o
// problema...". Ninguém escreve "copo de chopp" ali — copo de chopp não é um problema, é a
// peça.
//
// O que este teste protege é a diferença entre validar e impedir: o item não é checado
// depois de criado, ele NÃO NASCE sem peça e quantidade. Enquanto falta algo, nada entra em
// state.manutencao — logo nada é gravado, nada chega na fila do Henrique.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK   = process.env.ARQ_CHK   || CAMINHOS.pub('gn-checklist.html');
const MANUT = process.env.ARQ_MANUT || CAMINHOS.pub('gn-manutencao.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const erros = [];

  // ══ LADO DA LOJA ══════════════════════════════════════════════════════════════════════
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const chk = await ctx.newPage();
  chk.on('pageerror', e => erros.push(String(e)));
  for (let t = 1; ; t++) {
    await chk.goto('file://' + CHK);
    try {
      await chk.waitForFunction(() => { try {
        return typeof addUtensilio === 'function' && typeof _utensNovoRegistrar === 'function'
            && typeof _utensFalta === 'function';
      } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o Check-list não carregou (ou falta o código novo)'); }
  }

  const prep = () => chk.evaluate(() => {
    usuarioLogado = { id: 1, nome: 'Taynara', cargo: 'sub_gerente', loja: 'BANGU' };
    autoSave = () => {}; _debouncedSaveAll = () => {}; showToast = () => {};
    state.manutencao = []; state.manutOficial = []; state.utensiliosSaldo = {};
    _utensNovoCancelar();
  });
  const tela = () => chk.evaluate(() => ({
    itens: state.manutencao.length,
    txt: (document.getElementById('tab-utensilios') || document.body).textContent.replace(/\s+/g, ' '),
    btnDesabilitado: !!(document.getElementById('utens-novo-ok') || {}).disabled,
    temForm: !!document.getElementById('utens-novo-nome'),
  }));

  // ── 1. O toque no botão não cria nada ────────────────────────────────────────────────
  await prep();
  await chk.evaluate(() => addUtensilio());
  let r = await tela();
  check('tocar em "+ Registrar" NÃO cria mais um lançamento em branco', r.itens === 0);
  check('abre um formulário com o campo da peça', r.temForm === true);
  check('e o botão Registrar já começa travado', r.btnDesabilitado === true);
  check('dizendo o que falta', /Falta dizer qual é a peça e quantas/.test(r.txt));

  // ── 2. Só o nome não basta; só a quantidade também não ───────────────────────────────
  await chk.evaluate(() => { _utensNovoSet('nome', 'Copo de chopp'); });
  r = await tela();
  check('com a peça mas sem a quantidade, continua travado', r.btnDesabilitado === true);
  check('e a dica passa a cobrar só a quantidade',
    /Falta dizer quantas/.test(r.txt) && !/qual é a peça/.test(r.txt));

  await chk.evaluate(() => { _utensNovoSet('nome', ''); _utensNovoSet('qtd', '3'); });
  r = await tela();
  check('com a quantidade mas sem a peça, continua travado', r.btnDesabilitado === true);

  // Zero não é quantidade: "Quebrou 0 copos" não é lançamento, é ruído na fila.
  await chk.evaluate(() => { _utensNovoSet('nome', 'Copo de chopp'); _utensNovoSet('qtd', '0'); });
  r = await tela();
  check('quantidade zero não conta como preenchida', r.btnDesabilitado === true);

  // ── 3. Forçar o registro incompleto não passa ────────────────────────────────────────
  const forcado = await chk.evaluate(() => {
    _utensNovoSet('nome', '   ');  // só espaço: parece nome, não é
    _utensNovoSet('qtd', '2');
    _utensNovoRegistrar();
    return state.manutencao.length;
  });
  check('chamar o registro na marra com a peça em branco não grava nada', forcado === 0);

  // ── 4. Completo: o item nasce com peça e quantidade ──────────────────────────────────
  const criado = await chk.evaluate(() => {
    _utensNovoSet('nome', ' Copo de chopp ');
    _utensNovoSet('qtd', '3');
    _utensNovoSet('situacao', 'Quebrou');
    _utensNovoSet('setor', 'Copa/Bar');
    _utensNovoRegistrar();
    const m = state.manutencao[0];
    const card = document.getElementById('utens-lista');
    return { n: state.manutencao.length, m,
             formFechou: !document.getElementById('utens-novo-nome'),
             // O nome da peça vive num <input value>, que textContent NÃO devolve — ler só
             // o texto daria "não aparece" com o campo preenchido na cara da pessoa.
             campos: [...card.querySelectorAll('input')].map(i => i.value),
             txt: (document.getElementById('tab-utensilios') || document.body).textContent.replace(/\s+/g, ' ') };
  });
  check('com peça e quantidade, aí sim o lançamento nasce', criado.n === 1);
  check('já com o nome da peça (sem o espaço sobrando) e a quantidade',
    criado.m.descricao === 'Copo de chopp' && String(criado.m.qtd) === '3');
  check('e com o tipo, a situação e o setor certos',
    criado.m.tipo === 'Utensílio / Louça' && criado.m.situacao === 'Quebrou' && criado.m.setor === 'Copa/Bar');
  check('o formulário fecha depois de registrar', criado.formFechou === true);
  check('e o lançamento aparece na tela dizendo qual peça e quantas',
    criado.campos.includes('Copo de chopp') && criado.campos.includes('3'));
  check('um lançamento completo não é marcado como incompleto',
    !/Lançamento incompleto/.test(criado.txt));

  // ── 5. Cancelar não deixa resto ──────────────────────────────────────────────────────
  const cancelou = await chk.evaluate(() => {
    addUtensilio(); _utensNovoSet('nome', 'Prato fundo'); _utensNovoSet('qtd', '9');
    _utensNovoCancelar();
    return { n: state.manutencao.length,
             txt: (document.getElementById('tab-utensilios') || document.body).textContent.replace(/\s+/g, ' ') };
  });
  check('cancelar o rascunho não grava nem deixa rastro', cancelou.n === 1 && !/Prato fundo/.test(cancelou.txt));

  // ── 6. O que já estava incompleto no banco ───────────────────────────────────────────
  // Os lançamentos que existem hoje (Bangu, 10/10) atravessam o dia e continuam chegando.
  // Não apago o que é da loja: marco em vermelho e ponho os dois campos no topo do card.
  const legado = await chk.evaluate(() => {
    state.manutencao = [{ id: 777, tipo: 'Utensílio / Louça', setor: 'Salão', situacao: 'Quebrou',
                          qtd: '', descricao: '', status: 'Pendente', prioridade: 'Normal',
                          confirmado_loja: false }];
    renderUtensilios();
    const card = document.getElementById('utens-lista');
    return { txt: card.textContent.replace(/\s+/g, ' '), html: card.innerHTML,
             sumiu: !/777/.test(card.innerHTML) };
  });
  check('lançamento antigo incompleto não é apagado nem escondido', legado.sumiu === false);
  check('é marcado como incompleto, dizendo exatamente o que falta',
    /Lançamento incompleto/.test(legado.txt) && /qual é a peça e quantas/.test(legado.txt));
  check('explicando por que isso importa', /não sabe o que repor/.test(legado.txt));
  check('com o campo da peça no topo do card, pra loja completar ali mesmo',
    /Qual a peça/.test(legado.txt));
  check('e sem a "Descrição" genérica duplicando o mesmo campo', !/Descreva o problema/.test(legado.html));

  // Completar o que falta tira o aviso — senão o card viraria alarme permanente.
  const completou = await chk.evaluate(() => {
    updateManut(777, 'descricao', 'Taça'); updateManut(777, 'qtd', '2');
    renderUtensilios();
    return document.getElementById('utens-lista').textContent.replace(/\s+/g, ' ');
  });
  check('completar peça e quantidade tira o aviso do card',
    !/Lançamento incompleto/.test(completou) && /Taça/.test(completou));

  check('nenhum erro de JS na loja', erros.length === 0);
  if (erros.length) erros.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await ctx.close();

  // ══ LADO DO HENRIQUE ══════════════════════════════════════════════════════════════════
  const ctxM = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctxM.route('**/rest/v1/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const man = await ctxM.newPage();
  for (let t = 1; ; t++) {
    await man.goto('file://' + MANUT);
    try {
      await man.waitForFunction(() => { try { return typeof _utensFaltaManut === 'function'; } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o app Manutenção não carregou (ou falta o código novo)'); }
  }
  const m = await man.evaluate(() => {
    const T = 'Utensílio / Louça';
    const vazio   = { tipo: T, setor: 'Salão', situacao: 'Quebrou', qtd: '', descricao: '' };
    const semQtd  = { tipo: T, setor: 'Salão', situacao: 'Quebrou', qtd: '', descricao: 'Copo de chopp' };
    const semNome = { tipo: T, setor: 'Salão', situacao: 'Quebrou', qtd: '3', descricao: '' };
    const cheio   = { tipo: T, setor: 'Salão', situacao: 'Quebrou', qtd: '3', descricao: 'Copo de chopp' };
    return { vazio: _detalheUtensilio(vazio), semQtd: _detalheUtensilio(semQtd),
             semNome: _detalheUtensilio(semNome), cheio: _detalheUtensilio(cheio),
             cheioTxt: _detalheUtensilioTxt(cheio),
             outroTipo: _detalheUtensilio({ tipo: 'Elevador', descricao: '' }) };
  });
  check('o item exatamente como está hoje no banco chega marcado como incompleto',
    /Lançamento incompleto/.test(m.vazio) && /qual peça/.test(m.vazio) && /quantas/.test(m.vazio));
  check('faltando só a quantidade, cobra só a quantidade',
    /quantas/.test(m.semQtd) && !/qual peça/.test(m.semQtd));
  check('faltando só a peça, cobra só a peça',
    /qual peça/.test(m.semNome) && !/quantas/.test(m.semNome));
  check('item completo continua limpo, com situação e quantidade',
    !/incompleto/i.test(m.cheio) && /Quebrou/.test(m.cheio) && /3 un/.test(m.cheio));
  check('e o texto do relatório do item completo não mudou', m.cheioTxt === 'Quebrou · 3 un');
  check('item de outro tipo não ganha aviso de louça', m.outroTipo === '');

  await ctxM.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
