// Pedido do dono (aba Entrega do app Lojas):
//   "Acontece muito de entregar às vezes só parte do pedido e chegar outra parte depois
//    (JBS, Coca-Cola, Ambev), e aí fica na pendência de dar o recebido, gerando erro no
//    relatório. Quero a opção de recebimento parcial: a quantidade recebida já vai pra
//    recebido (a carne entra na aba Carnes do Check-list), o que faltar fica pendente; se
//    chegar depois, soma; se não chegar, botão finalizar e o resto vira divergência."
//   "Na cotação põe tudo no mesmo fornecedor (descartável), mas um item ou outro vem por
//    outro. Poder selecionar quem entregou e aparecer a ressalva — só trocar por fornecedor
//    do mesmo tipo (descartável por descartável; JBS/Nogmix também)."
//
// DESENHO: a provisão é DIVIDIDA. A linha original fica com o que chegou (e passa a prever
// exatamente isso → RECEBIDO_OK) e uma linha nova guarda o restante como AGUARDANDO. Cada
// linha continua com UM recebimento: o app Pedidos e o próprio Lojas leem
// gn_recebimentos[0], e dois recebimentos na mesma provisão os fariam mostrar só a 1ª parte.
//
// A troca de fornecedor NUNCA mexe na coluna `fornecedor` (o app Pedidos confirma, reverte
// e evita duplicidade por ela): o real vai em `fornecedor_entregue`.
//
// O teste roda o fluxo de verdade (tela → confirmar → fila → banco) e olha o que chegaria
// ao Supabase, interceptando a chamada.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra !== undefined ? ' >> ' + String(extra).slice(0, 300) : '')); c ? ok++ : falhou++; };

const HOJE = '2026-11-05';

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, HOJE + 'T14:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try {
      await page.waitForFunction(() => { try {
        return typeof confirmarEntrega === 'function' && typeof encerrarRestanteEntrega === 'function'
            && typeof abrirTrocaFornecedorEntrega === 'function' && typeof EP_FORN_SUBSTITUTOS !== 'undefined'
            && typeof _epFilaPendente !== 'undefined';
      } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) { console.log('FALHOU: o app Lojas não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }

  // Cenário: Carne de Sol, 10 kg / R$ 500, pedido na NOGMIX - JBS, entrega em 03/11.
  // opts.falharResto = quantas vezes o POST do restante falha antes de funcionar.
  const preparar = (provs, opts) => page.evaluate(({ provs, opts }) => {
    loja = 'PEDREIRA';
    usuarioAtual = { nome: 'Luiz', cargo: 'estoquista' };
    provisoesEntrega = provs;
    _epNotaPorForn = {};
    _epFilaPendente = {};
    _epConfirmadosSessao = {};
    window.__gravado = [];
    window.__carne = [];
    window.__falharResto = (opts && opts.falharResto) || 0;
    window.__falharRec = (opts && opts.falharRec) || 0;
    sbRequest = async (rota, opt) => {
      const metodo = (opt && opt.method) || 'GET';
      const corpo = opt && opt.body ? JSON.parse(opt.body) : null;
      window.__gravado.push({ rota, metodo, corpo, headers: (opt && opt.headers) || {} });
      if (rota === 'gn_recebimentos' && window.__falharRec > 0) { window.__falharRec--; throw new Error('rede caiu (recebimento)'); }
      if (/^gn_provisoes\?on_conflict=id/.test(rota) && window.__falharRec === 0 && window.__falharResto > 0) { window.__falharResto--; throw new Error('rede caiu (restante)'); }
      if (/^gn_provisoes\?id=eq\.[^&]+&status=eq\.AGUARDANDO/.test(rota)) return [{ id: rota.split('eq.')[1].split('&')[0] }];
      return [];
    };
    _epFilaSalvar = () => {};
    render = () => {};
    showToast = (t) => { window.__toast = t; };
    carregarEntregas = async () => {};
    _lancarCarneEntregaNoChecklist = (p) => { window.__carne.push({ data_entrega: p && p.data_entrega, id: p && p.id }); };
    confirm = (t) => { window.__confirmTxt = t; return true; };
    // Nota já informada hoje para os fornecedores do teste.
    ['NOGMIX - JBS', 'JBS', 'DMIC', 'IEV', 'FRIGORIFICO ALFA'].forEach(f => _epNotaSet(f, '555', 900));
    provs.forEach(p => {
      [['ep_qtd_', ''], ['ep_val_', '']].forEach(([pre]) => {
        let el = document.getElementById(pre + p.id);
        if (!el) { el = document.createElement('input'); el.id = pre + p.id; document.body.appendChild(el); }
        el.value = pre === 'ep_qtd_' ? String(p.qtd_prevista) : String(p.valor_previsto);
      });
      let cb = document.getElementById('ep_parc_' + p.id);
      if (!cb) { cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'ep_parc_' + p.id; document.body.appendChild(cb); }
      cb.checked = false;
    });
    return true;
  }, { provs, opts });
  const PROV = (extra) => Object.assign({
    id: 'prov-1', pedido_id: 'ped-1', pedido_item_id: 'pi-1', catalogo_id: 'cat-carne-sol', loja_slug: 'pedreira',
    fornecedor: 'NOGMIX - JBS', fornecedor_entregue: null, parcial_origem: null,
    data_entrega: '2026-11-03', data_entrega_fim: null,
    qtd_prevista: 10, valor_previsto: 500, status: 'AGUARDANDO',
    gn_catalogo: { produto: 'Carne de Sol', und: 'kg' },
  }, extra || {});
  const gravado = () => page.evaluate(() => window.__gravado);
  const claimDe = g => (g.find(x => x.metodo === 'PATCH' && /status=eq\.AGUARDANDO/.test(x.rota)) || {}).corpo || null;
  const recDe = g => (g.find(x => x.rota === 'gn_recebimentos') || {}).corpo || null;
  const restoDe = g => g.filter(x => /^gn_provisoes\?on_conflict=id/.test(x.rota));

  // ── 1. O caminho normal não mudou ────────────────────────────────────────────────────
  await preparar([PROV()]);
  await page.evaluate(async () => { confirmarEntrega('prov-1'); await _epProcessarFila(); });
  let g = await gravado();
  check('recebimento normal: a reivindicação manda só status e data, como antes',
    JSON.stringify(Object.keys(claimDe(g) || {}).sort()) === JSON.stringify(['atualizado_em', 'status']), JSON.stringify(claimDe(g)));
  check('recebimento normal: grava 10 kg, sem observação inventada',
    recDe(g) && Number(recDe(g).qtd_recebida) === 10 && recDe(g).observacao === null, JSON.stringify(recDe(g)));
  check('recebimento normal: não cria restante nenhum', restoDe(g).length === 0);

  // ── 2. Entrega parcial: chegaram 6 de 10 ─────────────────────────────────────────────
  await preparar([PROV()]);
  await page.evaluate(async () => {
    document.getElementById('ep_qtd_prov-1').value = '6';
    document.getElementById('ep_parc_prov-1').checked = true;
    confirmarEntrega('prov-1');
    await _epProcessarFila();
  });
  g = await gravado();
  const claim2 = claimDe(g), rec2 = recDe(g), resto2 = restoDe(g)[0];
  const conf2 = await page.evaluate(() => window.__confirmTxt);
  check('o "tem certeza" diz que é parcial e quanto fica pendente',
    /ENTREGA PARCIAL/.test(conf2) && /6 de 10 kg/.test(conf2) && /restante \(4 kg\)/i.test(conf2), conf2);
  check('a linha original passa a prever o que chegou (6 kg / R$ 300) e fecha como RECEBIDO_OK',
    claim2 && claim2.status === 'RECEBIDO_OK' && Number(claim2.qtd_prevista) === 6 && Number(claim2.valor_previsto) === 300, JSON.stringify(claim2));
  check('o recebido entra já: 6 kg, R$ 300 (valor proporcional, não o cheio), sem divergência',
    rec2 && Number(rec2.qtd_recebida) === 6 && Number(rec2.valor_recebido) === 300 && Number(rec2.diferenca_qtd) === 0, JSON.stringify(rec2));
  check('o recebimento fica marcado como parcial, com o restante',
    rec2 && /ENTREGA PARCIAL: 6 de 10 kg \(restante 4 pendente\)/.test(rec2.observacao || ''), rec2 && rec2.observacao);
  check('o restante vira uma provisão NOVA, AGUARDANDO, com 4 kg / R$ 200',
    resto2 && resto2.corpo.status === 'AGUARDANDO' && Number(resto2.corpo.qtd_prevista) === 4 && Number(resto2.corpo.valor_previsto) === 200, JSON.stringify(resto2 && resto2.corpo));
  check('o restante guarda a origem e o mesmo pedido/item/loja/fornecedor',
    resto2 && resto2.corpo.parcial_origem === 'prov-1' && resto2.corpo.pedido_id === 'ped-1' && resto2.corpo.pedido_item_id === 'pi-1'
    && resto2.corpo.catalogo_id === 'cat-carne-sol' && resto2.corpo.loja_slug === 'pedreira' && resto2.corpo.fornecedor === 'NOGMIX - JBS');
  check('o restante é gravado com id do aparelho e "ignora duplicata" (reenvio não cria dois)',
    resto2 && /^[0-9a-f-]{36}$/.test(resto2.corpo.id) && /ignore-duplicates/.test(resto2.headers.Prefer || ''));
  const ordem2 = g.filter(x => x.metodo !== 'GET').map(x => x.rota === 'gn_recebimentos' ? 'rec' : /on_conflict/.test(x.rota) ? 'resto' : /status=eq/.test(x.rota) ? 'claim' : x.rota);
  check('ordem: reivindica → grava o recebido → cria o restante', ordem2.join(',') === 'claim,rec,resto', ordem2.join(','));
  check('a carne recebida entra no Check-list no dia da entrega (03/11)',
    (await page.evaluate(() => window.__carne)).some(c => c.data_entrega === '2026-11-03'));
  check('a fila esvazia', await page.evaluate(() => (_epFilaPendente.PEDREIRA || []).length === 0));

  // ── 3. Validações da parcial ─────────────────────────────────────────────────────────
  for (const [qtd, rotulo] of [['10', 'tudo'], ['12', 'mais que o previsto'], ['0', 'zero']]) {
    await preparar([PROV()]);
    await page.evaluate((q) => {
      document.getElementById('ep_qtd_prov-1').value = q;
      document.getElementById('ep_parc_prov-1').checked = true;
      confirmarEntrega('prov-1');
    }, qtd);
    const r = await page.evaluate(() => ({ fila: (_epFilaPendente.PEDREIRA || []).length, toast: window.__toast || '' }));
    check(`parcial com ${rotulo} (${qtd}) é barrado, com explicação`, r.fila === 0 && /parcial/i.test(r.toast), JSON.stringify(r));
  }
  // Valor digitado à mão é respeitado (não troca pelo proporcional).
  await preparar([PROV()]);
  await page.evaluate(async () => {
    document.getElementById('ep_qtd_prov-1').value = '6';
    document.getElementById('ep_val_prov-1').value = '310';
    document.getElementById('ep_parc_prov-1').checked = true;
    confirmarEntrega('prov-1'); await _epProcessarFila();
  });
  check('valor digitado à mão na parcial é o que vai pro recebimento', Number(recDe(await gravado()).valor_recebido) === 310);

  // ── 4. Rede cai na hora do restante: tenta só ele de novo ────────────────────────────
  await preparar([PROV()], { falharResto: 1 });
  await page.evaluate(async () => {
    document.getElementById('ep_qtd_prov-1').value = '6';
    document.getElementById('ep_parc_prov-1').checked = true;
    confirmarEntrega('prov-1'); await _epProcessarFila();
  });
  const meio = await page.evaluate(() => ({ fila: (_epFilaPendente.PEDREIRA || []).map(x => x.etapa) }));
  check('se o restante falhar, o item fica na fila só com a etapa "resto"', meio.fila.length === 1 && meio.fila[0] === 'resto', JSON.stringify(meio));
  await page.evaluate(async () => { if (_epFilaRetryTimer) { clearTimeout(_epFilaRetryTimer); _epFilaRetryTimer = null; } await _epProcessarFila(); });
  g = await gravado();
  const restos4 = restoDe(g);
  check('na nova tentativa NÃO reivindica nem grava o recebido de novo',
    g.filter(x => x.rota === 'gn_recebimentos').length === 1 && g.filter(x => x.metodo === 'PATCH').length === 1, g.map(x => x.metodo + ' ' + x.rota.slice(0, 40)).join(' | '));
  check('e reenvia o restante com o MESMO id', restos4.length === 2 && restos4[0].corpo.id === restos4[1].corpo.id);
  check('depois disso a fila esvazia', await page.evaluate(() => (_epFilaPendente.PEDREIRA || []).length === 0));

  // ── 5. Falha ao gravar o recebido: devolve a linha ao estado original ────────────────
  await preparar([PROV()], { falharRec: 1 });
  await page.evaluate(async () => {
    document.getElementById('ep_qtd_prov-1').value = '6';
    document.getElementById('ep_parc_prov-1').checked = true;
    confirmarEntrega('prov-1'); await _epProcessarFila();
    if (_epFilaRetryTimer) { clearTimeout(_epFilaRetryTimer); _epFilaRetryTimer = null; }
  });
  g = await gravado();
  const volta = g.filter(x => x.metodo === 'PATCH' && /^gn_provisoes\?id=eq\.prov-1$/.test(x.rota)).map(x => x.corpo)[0];
  check('se o recebido falhar, a linha volta a AGUARDANDO com 10 kg / R$ 500',
    volta && volta.status === 'AGUARDANDO' && Number(volta.qtd_prevista) === 10 && Number(volta.valor_previsto) === 500, JSON.stringify(volta));
  check('e nenhum restante é criado nesse caso', restoDe(g).length === 0);

  // ── 6. O restante chega depois ───────────────────────────────────────────────────────
  const RESTO = PROV({ id: 'resto-1', parcial_origem: 'prov-1', qtd_prevista: 4, valor_previsto: 200 });
  await preparar([RESTO]);
  await page.evaluate(async () => { confirmarEntrega('resto-1'); await _epProcessarFila(); });
  g = await gravado();
  check('restante que chega: reivindica com a data de HOJE (dia em que chegou)',
    claimDe(g) && claimDe(g).data_entrega === '2026-11-05' && claimDe(g).status === 'RECEBIDO_OK', JSON.stringify(claimDe(g)));
  check('e soma: grava 4 kg recebidos, marcado como restante de parcial',
    Number(recDe(g).qtd_recebida) === 4 && /RESTANTE DE ENTREGA PARCIAL/.test(recDe(g).observacao || ''), JSON.stringify(recDe(g)));
  check('a carne do restante entra no dia em que chegou (05/11), não no da 1ª parte',
    (await page.evaluate(() => window.__carne)).some(c => c.data_entrega === '2026-11-05'));

  // ── 7. O restante não vai chegar: finalizar ──────────────────────────────────────────
  await preparar([RESTO]);
  await page.evaluate(() => { _epNotaPorForn = {}; });                 // sem nota nenhuma hoje
  await page.evaluate(async () => { encerrarRestanteEntrega('resto-1'); await _epProcessarFila(); });
  g = await gravado();
  const rec7 = recDe(g);
  check('finalizar: o restante fecha como DIVERGÊNCIA', claimDe(g) && claimDe(g).status === 'DIVERGENCIA');
  check('com 0 recebido e a falta (-4) registrada',
    rec7 && Number(rec7.qtd_recebida) === 0 && Number(rec7.diferenca_qtd) === -4 && Number(rec7.valor_recebido) === 0, JSON.stringify(rec7));
  check('sem pedir nota (não chegou mercadoria)', rec7 && rec7.nota_numero === null && !(await page.evaluate(() => !!document.getElementById('modalNotaEntrega'))));
  check('e marcado como "restante não entregue"', rec7 && /RESTANTE NÃO ENTREGUE: 4 kg/.test(rec7.observacao || ''), rec7 && rec7.observacao);
  const semBotao = await page.evaluate(() => { provisoesEntrega = [Object.assign({}, provisoesEntrega[0], { id: 'x', parcial_origem: null })]; _epFilaPendente = {}; encerrarRestanteEntrega('x'); return (_epFilaPendente.PEDREIRA || []).length; });
  check('item que não é restante de parcial não pode ser "finalizado" assim', semBotao === 0);

  // ── 8. Troca de fornecedor ───────────────────────────────────────────────────────────
  const DESC = PROV({ id: 'desc-1', fornecedor: 'DMIC', catalogo_id: 'cat-copo', qtd_prevista: 5, valor_previsto: 100, gn_catalogo: { produto: 'Copo Descartável 200 ml', und: 'cx' } });
  await preparar([DESC]);
  const modal = await page.evaluate(() => {
    abrirTrocaFornecedorEntrega('desc-1');
    const m = document.getElementById('modalTrocaForn');
    const opcoes = Array.from(m.querySelectorAll('button[data-forn]')).map(b => b.dataset.forn);
    m.remove();
    return opcoes;
  });
  check('troca: oferece só descartáveis (IEV, JOBAL, MULTIPLAS, TPO)',
    JSON.stringify(modal) === JSON.stringify(['IEV', 'JOBAL', 'MULTIPLAS', 'TPO']), JSON.stringify(modal));
  await page.evaluate(async () => { await _epAplicarTrocaForn('desc-1', 'IEV'); });
  g = await gravado();
  const patch8 = g.find(x => x.metodo === 'PATCH');
  check('troca grava fornecedor_entregue = IEV, só enquanto AGUARDANDO',
    patch8 && patch8.corpo.fornecedor_entregue === 'IEV' && /status=eq\.AGUARDANDO/.test(patch8.rota) && !('fornecedor' in patch8.corpo), JSON.stringify(patch8));
  const pos = await page.evaluate(() => ({ forn: _epForn(provisoesEntrega[0]), pedido: provisoesEntrega[0].fornecedor, ressalva: _epRessalvaForn(provisoesEntrega[0]) }));
  check('o item passa a contar como IEV e o fornecedor do PEDIDO continua DMIC', pos.forn === 'IEV' && pos.pedido === 'DMIC');
  check('a ressalva diz os dois', pos.ressalva === 'Pedido em DMIC · entregue por IEV', pos.ressalva);
  const notaForn = await page.evaluate(() => { _epNotaPorForn = {}; abrirModalNotaEntrega('desc-1'); const m = document.getElementById('modalNotaEntrega'); const f = m && m.dataset.fornecedor; if (m) m.remove(); return f; });
  check('a nota pedida é a da IEV (quem entregou), não a da DMIC', notaForn === 'IEV', notaForn);
  await page.evaluate(async () => { _epNotaSet('IEV', '777', 100); window.__gravado = []; confirmarEntrega('desc-1'); await _epProcessarFila(); });
  g = await gravado();
  check('o recebimento leva a nota da IEV e a ressalva da troca',
    recDe(g) && recDe(g).nota_numero === '777' && /FORNECEDOR TROCADO: Pedido em DMIC · entregue por IEV/.test(recDe(g).observacao || ''), JSON.stringify(recDe(g)));
  const conf8 = await page.evaluate(() => window.__confirmTxt);
  check('o "tem certeza" mostra a troca', /entregue por IEV/.test(conf8));
  // Tipo errado é barrado mesmo chamando a função direto.
  await preparar([DESC]);
  await page.evaluate(async () => { await _epAplicarTrocaForn('desc-1', 'DIFERENCIAL'); });
  check('trocar descartável por fornecedor de limpeza (DIFERENCIAL) é barrado', (await gravado()).length === 0);
  await page.evaluate(async () => { await _epAplicarTrocaForn('desc-1', 'IEV'); await _epAplicarTrocaForn('desc-1', 'DMIC'); });
  g = await gravado();
  check('voltar pro fornecedor do pedido limpa a troca (null)', g.length === 2 && g[1].corpo.fornecedor_entregue === null && await page.evaluate(() => _epForn(provisoesEntrega[0]) === 'DMIC'));
  // JBS/Nogmix
  const opJbs = await page.evaluate(() => { provisoesEntrega = [Object.assign({}, provisoesEntrega[0], { id: 'j', fornecedor: 'NOGMIX - JBS' })]; abrirTrocaFornecedorEntrega('j'); const m = document.getElementById('modalTrocaForn'); const o = Array.from(m.querySelectorAll('button[data-forn]')).map(b => b.dataset.forn); m.remove(); return o; });
  check('carnes: NOGMIX - JBS pode virar JBS, NOGMIX ou NOGMIX MATHEUS', JSON.stringify(opJbs) === JSON.stringify(['JBS', 'NOGMIX', 'NOGMIX MATHEUS']), JSON.stringify(opJbs));
  check('fornecedor fora da lista (FRESCATO, PEIXE) não tem troca', await page.evaluate(() => _epGrupoSubst('FRESCATO') === null && _epGrupoSubst('DIFERENCIAL') === null));
  check('nome com espaço/caixa diferente é reconhecido', await page.evaluate(() => !!_epGrupoSubst('  nogmix  -  jbs ')));

  // ── 9. A tela de verdade ─────────────────────────────────────────────────────────────
  const tela = await page.evaluate(() => {
    window.render = undefined;
    return null;
  });
  void tela;
  await page.goto('file://' + LOJAS);
  await page.waitForFunction(() => { try { return typeof confirmarEntrega === 'function' && typeof _epFilaPendente !== 'undefined' && typeof provisoesEntrega !== 'undefined'; } catch (e) { return false; } }, { timeout: 20000 });
  const html = await page.evaluate(() => {
    loja = 'PEDREIRA'; usuarioAtual = { nome: 'Luiz', cargo: 'estoquista' };
    try { lojaForcada = 'PEDREIRA'; } catch (e) {}
    _epFilaPendente = {}; _epConfirmadosSessao = {}; provisoesHistorico = [];
    provisoesEntrega = [
      { id: 'a', fornecedor: 'DMIC', fornecedor_entregue: 'IEV', parcial_origem: null, qtd_prevista: 5, valor_previsto: 100, status: 'AGUARDANDO', data_entrega: '2026-11-05', gn_catalogo: { produto: 'Copo 200', und: 'cx' } },
      { id: 'b', fornecedor: 'NOGMIX - JBS', parcial_origem: 'p0', qtd_prevista: 4, valor_previsto: 200, status: 'AGUARDANDO', data_entrega: '2026-11-05', gn_catalogo: { produto: 'Carne de Sol', und: 'kg' } },
      { id: 'c', fornecedor: 'FRESCATO', parcial_origem: null, qtd_prevista: 1, valor_previsto: 10, status: 'AGUARDANDO', data_entrega: '2026-11-05', gn_catalogo: { produto: 'Tilápia', und: 'cx' } },
    ];
    tab = 'entrega';
    document.querySelectorAll('.ep-grupo').forEach(e => e.remove());
    render();
    document.querySelectorAll('.ep-grupo').forEach(e => e.classList.add('aberto'));
    const grupos = Array.from(document.querySelectorAll('.ep-grupo .ep-grupo-nome')).map(e => e.textContent.trim());
    const t = document.body.innerText;
    return { grupos, t, parc: ['a', 'b', 'c'].map(i => !!document.getElementById('ep_parc_' + i)), body: document.body.innerHTML };
  });
  check('tela: o item trocado aparece no grupo da IEV, não no da DMIC', html.grupos.includes('IEV') && !html.grupos.includes('DMIC'), JSON.stringify(html.grupos));
  check('tela: a ressalva aparece no item', /Pedido em DMIC · entregue por IEV/.test(html.body));
  check('tela: todo item pendente tem a opção "Entrega parcial"', html.parc.every(Boolean), JSON.stringify(html.parc));
  check('tela: o restante tem o aviso e o botão Finalizar', /Restante de entrega parcial/.test(html.body) && /encerrarRestanteEntrega\('b'\)/.test(html.body) && !/encerrarRestanteEntrega\('a'\)/.test(html.body));
  check('tela: troca só aparece pra quem tem substituto (não na FRESCATO)',
    /abrirTrocaFornecedorEntrega\('a'\)/.test(html.body) && /abrirTrocaFornecedorEntrega\('b'\)/.test(html.body) && !/abrirTrocaFornecedorEntrega\('c'\)/.test(html.body));

  // ── 10. Aba Notas ────────────────────────────────────────────────────────────────────
  const notas = await page.evaluate(() => {
    const rows = [
      { id: 'n1', fornecedor: 'NOGMIX - JBS', status: 'RECEBIDO_OK', atualizado_em: '2026-11-03T10:00:00Z', gn_recebimentos: [{ nota_numero: '555', nota_valor: 300, valor_recebido: 300, validado_em: '2026-11-03T10:00:00Z', observacao: 'ENTREGA PARCIAL: 6 de 10 kg (restante 4 pendente)' }] },
      { id: 'n2', fornecedor: 'NOGMIX - JBS', parcial_origem: 'n1', status: 'DIVERGENCIA', atualizado_em: '2026-11-05T10:00:00Z', gn_recebimentos: [{ nota_numero: null, qtd_recebida: 0, valor_recebido: 0, validado_em: '2026-11-05T10:00:00Z', observacao: 'RESTANTE NÃO ENTREGUE: 4 kg — finalizado por Luiz' }] },
      { id: 'n3', fornecedor: 'DMIC', fornecedor_entregue: 'IEV', status: 'RECEBIDO_OK', atualizado_em: '2026-11-05T10:00:00Z', gn_recebimentos: [{ nota_numero: '777', valor_recebido: 100, validado_em: '2026-11-05T10:00:00Z', observacao: 'FORNECEDOR TROCADO: Pedido em DMIC · entregue por IEV' }] },
    ];
    const gs = _epAgruparNotas(rows);
    const lista = Array.isArray(gs) ? gs : Object.values(gs);
    return lista.map(x => ({ numero: x.numero, forn: x.fornecedor, obs: x.obs, n: x.itens.length }));
  });
  check('notas: o restante finalizado sem chegar NÃO vira "sem nota registrada"', !notas.some(n => !n.numero), JSON.stringify(notas));
  check('notas: a nota 777 fica na IEV (quem entregou)', notas.some(n => n.numero === '777' && n.forn === 'IEV'), JSON.stringify(notas));
  check('notas: "entrega parcial" de um item não aparece como observação da nota inteira', notas.every(n => !/PARCIAL|TROCADO/.test(n.obs || '')), JSON.stringify(notas));

  check('nenhum erro de JavaScript no app Lojas', erros.length === 0, erros.join(' | '));

  // ── 11. App Pedidos: a ressalva aparece pro Compras ──────────────────────────────────
  const pp = await ctx.newPage();
  const errosP = [];
  pp.on('pageerror', e => errosP.push(String(e.message)));
  await pp.goto('file://' + PEDIDOS);
  await pp.waitForFunction(() => { try { return typeof _provRessalvasHtml === 'function'; } catch (e) { return false; } }, { timeout: 20000 });
  const ped = await pp.evaluate(() => ({
    troca: _provRessalvasHtml({ fornecedor: 'DMIC', fornecedor_entregue: 'IEV', status: 'RECEBIDO_OK' }, null),
    mesmo: _provRessalvasHtml({ fornecedor: 'DMIC', fornecedor_entregue: 'dmic', status: 'RECEBIDO_OK' }, null),
    parcial: _provRessalvasHtml({ fornecedor: 'JBS', status: 'RECEBIDO_OK' }, { observacao: 'ENTREGA PARCIAL: 6 de 10 kg (restante 4 pendente)' }),
    resto: _provRessalvasHtml({ fornecedor: 'JBS', parcial_origem: 'x', status: 'AGUARDANDO' }, null),
    fim: _provRessalvasHtml({ fornecedor: 'JBS', parcial_origem: 'x', status: 'DIVERGENCIA' }, { observacao: 'RESTANTE NÃO ENTREGUE: 4 kg — finalizado por Luiz' }),
    nada: _provRessalvasHtml({ fornecedor: 'JBS', status: 'RECEBIDO_OK' }, { observacao: 'SEM NOTA: x' }),
  }));
  check('Pedidos: mostra "Entregue por IEV (pedido em DMIC)"', /Entregue por IEV \(pedido em DMIC\)/.test(ped.troca), ped.troca);
  check('Pedidos: sem ressalva quando o "entregue" é o mesmo fornecedor', ped.mesmo === '');
  check('Pedidos: mostra a entrega parcial', /ENTREGA PARCIAL: 6 de 10 kg/.test(ped.parcial));
  check('Pedidos: restante aguardando aparece como tal', /aguardando chegar/.test(ped.resto));
  check('Pedidos: restante finalizado aparece como "não chegou"', /não chegou/.test(ped.fim));
  check('Pedidos: item comum não ganha ressalva', ped.nada === '');

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
