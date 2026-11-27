// Nome da nota → item do catálogo do Pedido (27/11/2026). "Os produtos chegam com nome
// diferente; usar o item base (catálogo do app Pedido) e casar, pra ter um único nome — no
// empréstimo, se não selecionar o item certo, aparece vazio. Já fiz vínculo manual, mas
// sempre aparecem novos." Pistas: a entrega confirmada com o MESMO número de nota (forte se o
// nome também parece; só a quantidade igual é fraca) e o nome. Casos tirados de Bangu, 23/11.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-25T10:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof abrirModalMatchNF === 'function' && typeof goTab === 'function' && PRODUTOS_PEDIDO.length > 0; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  if (!(await page.evaluate(() => typeof _sugerirItensCatalogo === 'function'))) {
    console.log('FALHOU: o casamento nota → catálogo do Pedido não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  // Monta o cenário: dois itens do catálogo (parmesão e um terceiro qualquer) recebidos na
  // Entrega com a nota 6588; a nota lançada nas Entradas traz "PARMESAO - 003" (nome parecido
  // + mesma quantidade = forte) e "MAIONESE 2,7KG LIZA" (só a quantidade bate = fraca).
  const base = await page.evaluate(() => {
    const parm = PRODUTOS_PEDIDO.find(p => /PARMES/i.test(p.produto));
    const outro = PRODUTOS_PEDIDO.find(p => /FARINHA DE TRIGO|ARROZ/i.test(p.produto) && !/PARMES/i.test(p.produto));
    _catalogoPorItemId = Object.assign({}, _catalogoPorItemId || {}, { [parm.item]: 'cid-parm', [outro.item]: 'cid-outro' });
    window.__REC = [{ catalogo_id: 'cid-parm', gn_recebimentos: [{ nota_numero: '6.588', qtd_recebida: 6.42 }] },
                    { catalogo_id: 'cid-outro', gn_recebimentos: [{ nota_numero: '6588', qtd_recebida: 4 }] },
                    { catalogo_id: 'cid-parm', gn_recebimentos: [{ nota_numero: '999', qtd_recebida: 1 }] }];
    loja = 'BANGU'; usuarioAtual = { nome: 'Neto', cargo: 'gerente', loja }; abasPermitidas = null;
    _entregasVencidasAtivas = []; _notaFiscalPendenciasAtivas = []; _barrisSemPendente = false;
    window.__consultas = [];
    window.__rpcLog = [];
    sbRequest = async (rota, opt) => { window.__consultas.push(rota); if (/rpc\/gn_nf_vinculo_registrar/.test(rota)) { window.__rpcLog.push(...JSON.parse(opt.body).p_itens); return 1; } return /^gn_provisoes\?loja_slug=eq\.bangu&data_entrega=gte/.test(rota) ? JSON.parse(JSON.stringify(window.__REC)) : []; };
    autoSave = () => {}; window.__pushOrig = sbPushMasterConfig; sbPushMasterConfig = async () => { window.__pushCfg = (window.__pushCfg || 0) + 1; };
    _atualizarTravaNotaFiscal = async () => {};
    return { parm: _nomeInsumoDoProduto(parm), outro: _nomeInsumoDoProduto(outro), parmItem: parm.item };
  });

  // ── 1) Painel "não aparecem no Estoque" ──
  const p = await page.evaluate(async () => {
    const k = lojaKey();
    entradasAll[k] = [
      { id: 'e1', insumo: 'PARMESAO - 003', nfDesc: 'PARMESAO - 003', nf: '6588', dataNF: '2026-11-23', qtd: 6.42, custoUnit: 50 },
      { id: 'e2', insumo: 'MAIONESE 2,7KG LIZA CASEIRA', nfDesc: 'MAIONESE 2,7KG LIZA CASEIRA', nf: '6588', dataNF: '2026-11-23', qtd: 4, custoUnit: 40 },
    ];
    delete nfMapeamentos['PARMESAO - 003']; delete nfMapeamentos['MAIONESE 2,7KG LIZA CASEIRA'];
    _naoRecSug = { chave: '', sug: null, carregando: false };
    tab = 'entradas'; render();
    for (let i = 0; i < 30 && !document.querySelector('.naorec-sug'); i++) await new Promise(r => setTimeout(r, 100));
    const linha = n => { const el = [...document.querySelectorAll('.naorec-linha')].find(x => x.dataset.nome === n); return el ? el.innerText.replace(/\s+/g, ' ') : null; };
    const out = { parm: linha('PARMESAO - 003'), mai: linha('MAIONESE 2,7KG LIZA CASEIRA'), bulk: (document.querySelector('.naorec-aplicar') || {}).textContent || '',
      origens: [...document.querySelectorAll('.naorec-sug')].map(x => x.dataset.origem) };
    document.querySelector('.naorec-aplicar').click();
    out.depois = entradasAll[k].map(e => e.insumo); out.vinc = nfMapeamentos['PARMESAO - 003'] || null; out.vincMai = nfMapeamentos['MAIONESE 2,7KG LIZA CASEIRA'] || null;
    out.restam = Object.keys(_entradasNaoReconhecidas());
    return out;
  });
  check('parmesão (mesma nota + nome parecido): "📦 Pela entrega da nota" com o nome do item no Pedido', p.parm && p.parm.includes('📦 Pela entrega da nota: ' + base.parm), p);
  check('maionese (mesma nota, só a quantidade bate): aparece como "confira", não como certa', p.mai && /Na mesma nota, nome diferente — confira/.test(p.mai) && p.origens.includes('nota_fraca'), p);
  check('o botão de lote liga só as fortes ("Ligar 1")', /Ligar 1 ao item do Pedido pela nota/.test(p.bulk), p.bulk);
  check('…ligou o parmesão ao item do Pedido e gravou o vínculo da descrição da nota (todas as lojas)', p.depois[0] === base.parm && p.vinc === base.parm, p);
  check('…e NÃO mexeu na maionese (fraca) nem criou vínculo pra ela', p.depois[1] === 'MAIONESE 2,7KG LIZA CASEIRA' && !p.vincMai && p.restam.join() === 'MAIONESE 2,7KG LIZA CASEIRA', p);

  // ── 2) Importação do XML: a linha já vem com o item do Pedido ──
  const x = await page.evaluate(async () => {
    const k = lojaKey(); entradasAll[k] = []; window.__pushCfg = 0;
    delete nfMapeamentos['PARMESAO - 003']; delete nfMapeamentos['MAIONESE 2,7KG LIZA CASEIRA'];
    window.__carne = []; _sugerirEntregaCarne = (i, q, nf, d) => window.__carne.push([i, q, nf]);
    abrirModalMatchNF([{ xProd: 'PARMESAO - 003', qCom: 6.42, uCom: 'KG', vUnCom: 50 }, { xProd: 'MAIONESE 2,7KG LIZA CASEIRA', qCom: 4, uCom: 'UN', vUnCom: 40 },
      { xProd: 'CAMARAO 61/70 P&D CX 12KG', qCom: 24, uCom: 'KG', vUnCom: 67.5 }], '6588', 'LATICINIOS X', '2026-11-23', ['2026-12-07']);
    for (let i = 0; i < 30 && !/Pela entrega/.test((document.getElementById('modalMatchNF') || {}).innerText || ''); i++) await new Promise(r => setTimeout(r, 100));
    const m = document.getElementById('modalMatchNF');
    const inp = i => m.querySelector('.nf-sug-inp[data-idx="' + i + '"]');
    const out = { txt: m.innerText.replace(/\s+/g, ' '), v0: inp(0).value, v1: inp(1).value };
    confirmarMatchNF();
    out.ent = entradasAll[k].map(e => e.insumo); out.vinc = nfMapeamentos['PARMESAO - 003'] || null; out.vincMai = nfMapeamentos['MAIONESE 2,7KG LIZA CASEIRA'] || null;
    out.push = window.__pushCfg; out.carne = window.__carne;
    return out;
  });
  check('XML: linha forte já vem preenchida com o item do Pedido ("📦 Pela entrega desta nota")', x.v0 === base.parm && /📦 Pela entrega desta nota/.test(x.txt), x);
  check('XML: linha fraca NÃO vem preenchida — aparece "🤔 Talvez: …" pra conferir', x.v1 === '' && /🤔 Talvez: /.test(x.txt), x);
  check('XML: ao confirmar, a entrada forte entra com o nome único e vira vínculo; a fraca entra com o nome da nota', x.ent[0] === base.parm && x.ent[1] === 'MAIONESE 2,7KG LIZA CASEIRA' && x.vinc === base.parm && !x.vincMai && x.push === 1, x);
  check('XML: a nota de carne também pergunta "é desse pedido?" (Bangu, 23/11, entrou por aqui)', x.carne.length === 3 && x.carne.some(c => /CAMARAO/.test(c[0]) && c[1] === 24 && c[2] === '6588'), x.carne);

  // ── 3) Empréstimo: um nome só por item; o nome cru do catálogo aponta pro mesmo saldo ──
  const t = await page.evaluate(async (base) => {
    const prod = PRODUTOS_PEDIDO.find(p => p.item === base.parmItem);
    mapeamentoPedido[String(prod.item)] = 'PARMESAO RALADO TESTE';
    _contagemPedidoSaldo = { 'PARMESAO RALADO TESTE': { qtd: 10, data: '2026-11-20' } };
    transferAll = {}; tab = 'transf'; render();
    const opts = [...document.querySelectorAll('#dlTfInsumos option')].map(o => o.value);
    const inp = document.getElementById('tfInsumo');
    inp.value = prod.produto; inp.dispatchEvent(new Event('input', { bubbles: true }));
    return { cru: prod.produto.trim().toUpperCase(), temCanon: opts.includes('PARMESAO RALADO TESTE'), temCru: opts.includes(prod.produto.trim().toUpperCase()),
      saldo: (document.getElementById('tfSaldoInfo') || {}).textContent || '', unico: _nomeUnicoInsumo(prod.produto) };
  }, base);
  check('empréstimo: a lista mostra o nome único do item (e não o nome cru do catálogo junto)', t.temCanon && !t.temCru, t);
  check('empréstimo: digitar o nome cru do catálogo mostra o saldo do item (10), não vazio', /^Saldo: 10\.000 UN$/.test(t.saldo) && t.unico === 'PARMESAO RALADO TESTE', t);

  // ── 4) Registro pra conferência do Compras (gn_nf_vinculos_log) ──
  await page.waitForTimeout(1000);
  const log = await page.evaluate(() => window.__rpcLog.map(x => x.origem + '|' + x.descricao + '|' + x.insumo + '|' + x.loja));
  check('cada vínculo criado vai pro registro com a origem (lote pela nota no painel, nota no XML)',
    log.some(l => l.startsWith('lote_nota|PARMESAO - 003|' + base.parm + '|BANGU')) && log.some(l => l.startsWith('nota|PARMESAO - 003|' + base.parm)) && !log.some(l => /MAIONESE/.test(l)), log);

  // ── 5) Vínculo desfeito no Painel não volta pela cópia do aparelho ──
  const tomb = await page.evaluate(async () => {
    nfMapeamentos['NOME ERRADO X'] = 'ITEM Y'; nfMapeamentos['OUTRO OK'] = 'ITEM Z';
    const antes = sbRequest;
    sbRequest = async (rota, opt) => /^gn_lojas\?select/.test(rota) ? [{ loja: 'MASTER_CONFIG', all_data: { nfMapeamentos: { 'OUTRO OK': 'ITEM Z' }, nfMapeamentosRemovidos: { 'NOME ERRADO X': 'ITEM Y' } } }]
      : /MASTER_CONFIG/.test(rota) ? (window.__payload = JSON.parse(opt.body).all_data, []) : [];
    try { await sbPull(true); } catch (e) {}
    const out = { tem: 'NOME ERRADO X' in nfMapeamentos, ok: nfMapeamentos['OUTRO OK'] };
    await window.__pushOrig();
    out.payloadMarca = (window.__payload || {}).nfMapeamentosRemovidos;
    out.payloadTem = 'NOME ERRADO X' in ((window.__payload || {}).nfMapeamentos || {});
    // refazer de propósito o mesmo vínculo tira a marca
    _criarVinculoNF('NOME ERRADO X', 'ITEM Y', 'correcao');
    out.marcaDepois = 'NOME ERRADO X' in nfMapeamentosRemovidos;
    sbRequest = antes;
    return out;
  });
  check('vínculo desfeito no Painel sai da cópia do aparelho ao sincronizar (e os outros ficam)', !tomb.tem && tomb.ok === 'ITEM Z', tomb);
  check('…e o aparelho não o devolve ao salvar a config (a marca vai junto)', !tomb.payloadTem && tomb.payloadMarca && tomb.payloadMarca['NOME ERRADO X'] === 'ITEM Y', tomb);
  check('…refazer de propósito o mesmo vínculo tira a marca', !tomb.marcaDepois, tomb);

  // ── 6) Revisão por fornecedor ──
  const rv = await page.evaluate(async (base) => {
    const k = lojaKey(); window.__rpcLog = [];
    entradasAll[k] = [
      { id: 'h1', insumo: 'TOMATE CARMEM', nfDesc: 'TOMATE CARMEM', nf: '1315', fornecedor: 'HORTI SILVA', dataNF: '2026-11-23', qtd: 100 },
      { id: 'h2', insumo: 'COENTRO MOLHO', nfDesc: 'COENTRO MOLHO', nf: '1315', fornecedor: 'HORTI SILVA', dataNF: '2026-11-23', qtd: 7 },
      { id: 'b1', insumo: 'FILE MEIO PEITO BELLO', nfDesc: 'FILE MEIO PEITO BELLO', nf: '1358444', fornecedor: 'BELLO ALIMENTOS', dataNF: '2026-11-24', qtd: 1 },
    ];
    _naoRecSug = { chave: '', sug: null, carregando: false };
    tab = 'entradas'; render();
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('.naorec-revisar').click();
    const m = document.getElementById('modalRevForn');
    const grupos = [...m.querySelectorAll('.revf-grupo')].map(g => g.dataset.forn + ':' + g.querySelectorAll('.revf-inp').length);
    const g = [...m.querySelectorAll('.revf-grupo')].find(x => x.dataset.forn === 'HORTI SILVA');
    const inps = g.querySelectorAll('.revf-inp');
    inps[0].value = 'PARMESAO RALADO TESTE';   // nome único do parmesão (mapeado na parte 3)
    inps[1].value = 'COISA QUE NAO EXISTE';
    g.querySelector('.revf-salvar').click();
    const invalidoMarcado = inps[1].style.borderColor !== '';
    const antesValido = entradasAll[k].find(e => e.id === 'h1').insumo;
    inps[1].value = '';
    g.querySelector('.revf-salvar').click();
    await new Promise(r => setTimeout(r, 1000));
    return { grupos, invalidoMarcado, antesValido, depois: entradasAll[k].map(e => e.insumo), vinc: nfMapeamentos['TOMATE CARMEM'], log: window.__rpcLog.map(x => x.origem + '|' + x.descricao) };
  }, base);
  check('revisão: agrupa por fornecedor (o com mais nomes primeiro)', rv.grupos.join() === 'HORTI SILVA:2,BELLO ALIMENTOS:1', rv.grupos);
  check('revisão: com um nome que não é item cadastrado, NADA do fornecedor é salvo (nem o válido)', rv.invalidoMarcado && rv.antesValido === 'TOMATE CARMEM', rv);
  check('revisão: "Salvar" do fornecedor liga o que foi escolhido, deixa o vazio como estava e registra (origem revisao)',
    rv.depois[0] === 'PARMESAO RALADO TESTE' && rv.depois[1] === 'COENTRO MOLHO' && rv.vinc === 'PARMESAO RALADO TESTE' && rv.log.includes('revisao|TOMATE CARMEM'), rv);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
