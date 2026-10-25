// "Na primeira vez que for ser colocado o item avariado, criar a quantidade que tem em loja
//  bom, pois já vai virar um controle de utensílios."
//
// Decidido com o dono: ciclo FECHADO. A loja informa quantas tem em bom estado na primeira
// vez que lança a peça; cada "Quebrou N" desconta; quando a manutenção resolve informando o
// que repôs, o saldo sobe. A loja informa o inicial, supervisão corrige depois.
//
// O risco aqui não é a tela, é o NÚMERO ficar errado sem ninguém perceber. Então o teste
// persegue as formas de corromper o saldo:
//   • descontar a cada tecla digitada (updateManut dispara em cada dígito);
//   • descontar duas vezes no mesmo item (toque duplo, reabrir a tela);
//   • somar a reposição duas vezes (status remarcado como Resolvido);
//   • as duas pontas normalizarem o nome diferente e partirem o controle em dois;
//   • gravar por cima do que o outro app acabou de pôr na MESMA linha do banco.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK   = process.env.ARQ_CHK   || CAMINHOS.pub('gn-checklist.html');
const MANUT = process.env.ARQ_MANUT || CAMINHOS.pub('gn-manutencao.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };
const TIPO = 'Utensílio / Louça';

// Banco falso compartilhado pelos dois apps: uma linha gn_lojas com all_data.
const bancoInicial = () => ({ all_data: { manut_oficial_items: [{ id: 'of_1', tipo: 'Estrutura', status: 'Pendente' }] } });

// O Check-list cria o cliente com `const sb = window.supabase.createClient(...)`, que não
// pode ser reatribuído de fora (a primeira versão deste teste tentou e morreu em
// "Assignment to constant variable"). Então gn_lojas é servido pela REDE, com o banco falso
// vivendo aqui no Node — o que também exercita o cliente real, inclusive o maybeSingle().
let DB = bancoInicial();
let GRAVACOES = 0;
const servirGnLojas = (ctx) => ctx.route('**/rest/v1/**', async (rota) => {
  const req = rota.request();
  const url = req.url();
  if (!/\/rest\/v1\/gn_lojas/.test(url)) {
    return rota.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }
  if (req.method() === 'PATCH') {
    const corpo = JSON.parse(req.postData() || '{}');
    if (corpo.all_data) DB = { all_data: corpo.all_data };
    GRAVACOES++;
    return rota.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }
  // maybeSingle() pede o objeto cru pelo Accept; o resto espera lista.
  const umSo = /pgrst\.object/.test(req.headers()['accept'] || '');
  const linha = { all_data: DB.all_data };
  return rota.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(umSo ? linha : [linha]) });
});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ══ LOJA (Check-list) ═════════════════════════════════════════════════════════════════
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await servirGnLojas(ctx);
  const chk = await ctx.newPage();
  for (let t = 1; ; t++) {
    await chk.goto('file://' + CHK);
    try {
      await chk.waitForFunction(() => { try {
        return typeof lancarUtensilioNoControle === 'function' && typeof _utensilioChave === 'function'
            && typeof renderUtensilios === 'function' && typeof CARNES_DEF !== 'undefined';
      } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o Check-list não carregou (ou falta o código novo)'); }
  }

  const preparar = async (banco) => { DB = JSON.parse(JSON.stringify(banco)); GRAVACOES = 0; return chk.evaluate(() => {
    usuarioLogado = { id: 1, nome: 'Taynara', cargo: 'sub_gerente', loja: 'BANGU' };
    LOJA = 'Bangu';
    autoSave = () => {}; _debouncedSaveAll = () => {}; showToast = () => {};
    renderManutencao = () => {};
    // lancarUtensilioNoControle redesenha a aba Utensílios agora, não a Manutenção.
    renderUtensilios = () => {};
    _logAuditoriaChk = () => {};
    comissoesLojaKey = () => 'BANGU';
    state.manutencao = []; state.manutOficial = [];
    state.utensiliosSaldo = {};
    return true;
  }); };

  // Lê o saldo do BANCO (aqui no Node), não do que a tela acha que tem — é a diferença
  // entre "mostrou certo" e "gravou certo", e o relato que começou tudo isso foi
  // justamente os dois discordarem.
  const saldoDoBanco = async () => (DB.all_data || {}).utensilios_saldo || {};
  // Desde que peça e quantidade viraram obrigatórias, addUtensilio() abre um rascunho em
  // vez de criar o item: quem cria é o _utensNovoRegistrar(), e só com os dois preenchidos.
  //
  // Vários cenários daqui PRECISAM de um item incompleto (quantidade em branco pra simular
  // a digitação dígito a dígito, descrição vazia pra provar que nada entra no controle).
  // Pela tela isso não nasce mais — e é esse o ponto da mudança. Então o item nasce válido
  // e só DEPOIS recebe os campos do cenário, que é exatamente o estado de um lançamento
  // antigo ou editado à mão. Preencher o formulário com os campos ruins faria o item não
  // nascer, o state.manutencao[0] ser o item ANTERIOR e o Object.assign corromper ele —
  // foi o que aconteceu na primeira vez que rodei isto, e os dois testes que falharam
  // acusaram o código de um erro que era do teste.
  const novoItem = (campos) => chk.evaluate((campos) => {
    addUtensilio();                      // já nasce com tipo 'Utensílio / Louça'
    _utensNovoSet('nome', String(campos.descricao || '').trim() || 'Peça do teste');
    _utensNovoSet('qtd', (parseFloat(campos.qtd) || 0) > 0 ? campos.qtd : '1');
    _utensNovoSet('situacao', campos.situacao || 'Quebrou');
    _utensNovoRegistrar();
    const m = state.manutencao[0];
    Object.assign(m, campos);            // agora sim o estado que o cenário quer
    return m.id;
  }, campos);
  const responder = (valores) => chk.evaluate((v) => {
    const fila = v.slice();
    window.prompt = () => (fila.length ? fila.shift() : null);
  }, valores);

  // ── 1. Primeira vez: pergunta o inicial e desconta a quebra ──────────────────────────
  await preparar(bancoInicial());
  await responder(['20']);
  const id1 = await novoItem({ situacao: 'Quebrou', qtd: '3', descricao: 'Copo de chopp' });
  await chk.evaluate((id) => lancarUtensilioNoControle(id), id1);
  let s = await saldoDoBanco();
  const k = 'copo de chopp';
  check('primeira vez: grava o inicial que a loja informou', s[k] && s[k].inicial === 20);
  check('e desconta a quebra do mesmo lançamento (20 - 3 = 17)', s[k] && s[k].qtd === 17);
  check('guarda quem informou e quando', s[k] && s[k].inicial_por === 'Taynara' && !!s[k].inicial_em);
  check('e o manut_oficial_items do outro app continua intacto na mesma linha',
    ((DB.all_data || {}).manut_oficial_items || []).length === 1);

  // ── 2. Não desconta duas vezes no mesmo item ────────────────────────────────────────
  await chk.evaluate((id) => lancarUtensilioNoControle(id), id1);
  s = await saldoDoBanco();
  check('lançar o MESMO item de novo não desconta outra vez', s[k].qtd === 17);
  check('e o item fica marcado como já aplicado',
    await chk.evaluate((id) => !!state.manutencao.find(m => String(m.id) === String(id)).saldo_aplicado, id1));

  // ── 3. Digitar a quantidade não pode descontar a cada tecla ─────────────────────────
  // updateManut dispara em cada dígito: se o desconto estivesse ali, digitar "120" tiraria
  // 1, depois 12, depois 120 — 133 copos de uma peça que tem 17.
  const id2 = await novoItem({ situacao: 'Quebrou', qtd: '', descricao: 'Copo de chopp' });
  await chk.evaluate((id) => { ['1', '12', '120'].forEach(v => updateManut(id, 'qtd', v)); }, id2);
  s = await saldoDoBanco();
  check('digitar a quantidade não mexe no saldo (só o botão mexe)', s[k].qtd === 17);

  // ── 4. Segunda quebra desconta de novo, sem perguntar o inicial ─────────────────────
  await responder([]);                       // nenhum prompt disponível: se perguntar, vem null
  await chk.evaluate((id) => { updateManut(id, 'qtd', '5'); return lancarUtensilioNoControle(id); }, id2);
  s = await saldoDoBanco();
  check('segunda quebra desconta sem perguntar o inicial de novo (17 - 5 = 12)', s[k].qtd === 12);

  // ── 5. "Faltando" não desconta ──────────────────────────────────────────────────────
  // Falta é pedido de reposição, não perda: a peça não quebrou. Descontar aqui faria a
  // mesma peça sair do saldo duas vezes quando ela quebrasse de verdade depois.
  const id3 = await novoItem({ situacao: 'Faltando', qtd: '4', descricao: 'Copo de chopp' });
  await chk.evaluate((id) => lancarUtensilioNoControle(id), id3);
  s = await saldoDoBanco();
  check('"Faltando" não desconta do saldo', s[k].qtd === 12);

  // ── 6. Nada é lançado sem descrição ou sem quantidade ───────────────────────────────
  const id4 = await novoItem({ situacao: 'Quebrou', qtd: '2', descricao: '' });
  await chk.evaluate((id) => lancarUtensilioNoControle(id), id4);
  const id5 = await novoItem({ situacao: 'Quebrou', qtd: '0', descricao: 'Prato raso' });
  await chk.evaluate((id) => lancarUtensilioNoControle(id), id5);
  s = await saldoDoBanco();
  check('sem descrição e sem quantidade, nada entra no controle',
    Object.keys(s).length === 1 && !s['prato raso']);

  // ── 7. Desistir do "quantas tem" não lança nada ─────────────────────────────────────
  await chk.evaluate(() => { window.prompt = () => null; });
  const id6 = await novoItem({ situacao: 'Quebrou', qtd: '2', descricao: 'Taça de vinho' });
  await chk.evaluate((id) => lancarUtensilioNoControle(id), id6);
  s = await saldoDoBanco();
  check('cancelar a pergunta do inicial não cria saldo nem marca o item',
    !s['taca de vinho'] &&
    !(await chk.evaluate((id) => !!state.manutencao.find(m => String(m.id) === String(id)).saldo_aplicado, id6)));

  // ── 8. Valor inválido no inicial não cria saldo torto ───────────────────────────────
  await responder(['abc']);
  await chk.evaluate((id) => lancarUtensilioNoControle(id), id6);
  s = await saldoDoBanco();
  check('inicial inválido não cria saldo', !s['taca de vinho']);
  await responder(['-5']);
  await chk.evaluate((id) => lancarUtensilioNoControle(id), id6);
  s = await saldoDoBanco();
  check('inicial negativo também não', !s['taca de vinho']);

  // ── 9. Saldo não vai a negativo ─────────────────────────────────────────────────────
  await responder(['2']);
  const id7 = await novoItem({ situacao: 'Quebrou', qtd: '10', descricao: 'Prato fundo' });
  await chk.evaluate((id) => lancarUtensilioNoControle(id), id7);
  s = await saldoDoBanco();
  check('quebrar mais do que tinha deixa o saldo em 0, não negativo', s['prato fundo'].qtd === 0);

  // ── 10. Só supervisão corrige ───────────────────────────────────────────────────────
  await chk.evaluate(() => { window.prompt = () => '99'; });
  const antesCorrecao = (await saldoDoBanco())[k].qtd;
  await chk.evaluate(() => corrigirSaldoUtensilio('copo de chopp'));
  s = await saldoDoBanco();
  check('sub-gerente NÃO corrige o saldo', s[k].qtd === antesCorrecao);
  await chk.evaluate(() => { usuarioLogado.cargo = 'supervisor'; });
  await chk.evaluate(() => corrigirSaldoUtensilio('copo de chopp'));
  s = await saldoDoBanco();
  check('supervisor corrige', s[k].qtd === 99 && s[k].corrigido === true);

  // ── 11. A chave normaliza acento e caixa ────────────────────────────────────────────
  const chaves = await chk.evaluate(() => [
    _utensilioChave('Canecão'), _utensilioChave('canecao'), _utensilioChave('  CANECÃO  '),
    _utensilioChave('Copo  de   Chopp'),
  ]);
  check('"Canecão", "canecao" e "  CANECÃO  " são a mesma peça',
    chaves[0] === chaves[1] && chaves[1] === chaves[2]);
  check('e espaços repetidos não criam peça nova', chaves[3] === 'copo de chopp');

  const dbFinal = JSON.parse(JSON.stringify(DB));
  await ctx.close();

  // ══ MANUTENÇÃO (Henrique repõe) ═══════════════════════════════════════════════════════
  const ctxM = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctxM.route('**/rest/v1/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const man = await ctxM.newPage();
  for (let t = 1; ; t++) {
    await man.goto('file://' + MANUT);
    try {
      await man.waitForFunction(() => { try {
        return typeof _reporSaldoUtensilio === 'function' && typeof _utensilioChaveManut === 'function';
      } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o app Manutenção não carregou (ou falta o código novo)'); }
  }

  const r = await man.evaluate(async (dbFinal) => {
    window.__db = JSON.parse(JSON.stringify(dbFinal));
    window.__chk = { manutencao: [{ id: 'm1', tipo: 'Utensílio / Louça', descricao: 'Copo de chopp',
                                    situacao: 'Quebrou', qtd: '3', status: 'Pendente' }] };
    S.usuario = { nome: 'Henrique', cargo: 'manutencao' };
    toast = () => {}; _logAuditoriaManut = () => {};
    // sb falso cobrindo as duas tabelas que o caminho da reposição toca.
    sb = async (rota, opt) => {
      const corpo = opt && opt.body ? opt.body : null;
      if (/^gn_lojas/.test(rota)) {
        if (opt && opt.method === 'PATCH') { window.__db = JSON.parse(JSON.stringify(corpo)); return []; }
        return [JSON.parse(JSON.stringify(window.__db))];
      }
      if (/^checklist_diario/.test(rota)) {
        if (opt && opt.method === 'PATCH') { window.__chk = JSON.parse(JSON.stringify(corpo)); return []; }
        return [JSON.parse(JSON.stringify(window.__chk))];
      }
      return [];
    };
    const item = window.__chk.manutencao[0];
    window.prompt = () => '12';
    await _reporSaldoUtensilio('Bangu', '2026-10-10', 'm1', item);
    const depois1 = JSON.parse(JSON.stringify((window.__db.all_data || {}).utensilios_saldo || {}));
    const marcado = window.__chk.manutencao[0].reposicao_aplicada === true;

    // Segundo "Resolvido" no mesmo item não pode somar de novo. Quem barra é a condição em
    // salvarStatus (reposicao_aplicada), então reproduz essa condição aqui.
    let somouDeNovo = false;
    const it2 = window.__chk.manutencao[0];
    if (it2.tipo === 'Utensílio / Louça' && !it2.reposicao_aplicada) {
      await _reporSaldoUtensilio('Bangu', '2026-10-10', 'm1', it2);
      somouDeNovo = true;
    }
    const depois2 = JSON.parse(JSON.stringify((window.__db.all_data || {}).utensilios_saldo || {}));

    // Pular a pergunta não mexe no saldo.
    window.prompt = () => null;
    const it3 = { id: 'm2', tipo: 'Utensílio / Louça', descricao: 'Copo de chopp', qtd: '2' };
    window.__chk.manutencao.push(it3);
    await _reporSaldoUtensilio('Bangu', '2026-10-10', 'm2', it3);
    const depois3 = JSON.parse(JSON.stringify((window.__db.all_data || {}).utensilios_saldo || {}));

    return { depois1, marcado, somouDeNovo, depois2, depois3,
             chaveIgual: _utensilioChaveManut('Canecão'),
             oficiaisIntactos: ((window.__db.all_data || {}).manut_oficial_items || []).length };
  }, dbFinal);

  check('a reposição soma no saldo da peça (99 + 12 = 111)', r.depois1['copo de chopp'].qtd === 111);
  check('e marca o item como reposição já lançada', r.marcado === true);
  check('um segundo "Resolvido" não soma de novo',
    r.somouDeNovo === false && r.depois2['copo de chopp'].qtd === 111);
  check('pular a pergunta da reposição não mexe no saldo', r.depois3['copo de chopp'].qtd === 111);
  check('o manut_oficial_items continua intacto depois das gravações', r.oficiaisIntactos === 1);
  check('as duas pontas normalizam o nome IGUAL (senão o controle parte em dois)',
    r.chaveIgual === chaves[0]);

  await ctxM.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  console.log('\n--- saldo final no banco ---\n' + JSON.stringify(r.depois3, null, 1));
  process.exit(falhou ? 1 : 0);
})();
