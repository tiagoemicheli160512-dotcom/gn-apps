// Prazo de confirmação da entrega (26/11/2026) — app Lojas › Entrega.
// "Se houve um pedido com previsão de entrega durante determinada semana, ao passar esse
//  período, até a sexta-feira seguinte, deverá aparecer um aviso para o estoquista
//  confirmar se a mercadoria chegou ou não."
// Decisões do dono: passada a sexta da semana seguinte, o app só libera a aba Entrega até
// resolver; "❌ Não chegou" encerra na hora como divergência (sem passar pelo setor de
// Pedidos); vale das provisões de 16/11 em diante (as antigas viraram SEM_CONFIRMACAO).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

// Sábado 28/11/2026: a semana de 16/11 teve prazo até sexta 27/11 — venceu ontem.
const PROVS = [
  { id: 'A', fornecedor: 'NOGMIX - JBS', data_entrega: '2026-11-17', data_entrega_fim: null, exclusao_solicitada_em: null, qtd_prevista: 10, valor_previsto: 500, gn_catalogo: { produto: 'Carne de Sol', und: 'KG' } },
  { id: 'B', fornecedor: 'AMBEV', data_entrega: '2026-11-24', data_entrega_fim: null, exclusao_solicitada_em: null, qtd_prevista: 5, valor_previsto: 100, gn_catalogo: { produto: 'Coca Lata', und: 'CX' } },
  { id: 'C', fornecedor: 'VITOR', data_entrega: '2026-11-10', data_entrega_fim: null, exclusao_solicitada_em: null, qtd_prevista: 3, valor_previsto: 50, gn_catalogo: { produto: 'Banana', und: 'KG' } },
  { id: 'D', fornecedor: 'JBS', data_entrega: '2026-11-18', data_entrega_fim: null, exclusao_solicitada_em: '2026-11-25T10:00:00Z', qtd_prevista: 2, valor_previsto: 80, gn_catalogo: { produto: 'Picanha', und: 'KG' } },
  { id: 'E', fornecedor: 'DMIC', data_entrega: '2026-11-17', data_entrega_fim: '2026-11-24', exclusao_solicitada_em: null, qtd_prevista: 4, valor_previsto: 90, gn_catalogo: { produto: 'Guardanapo', und: 'CX' } },
];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-28T10:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof goTab === 'function' && typeof _epFilaPendente !== 'undefined'; } catch (e) { return false; } }, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: o app Lojas não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _calcularEntregasVencidas === 'function' && typeof naoChegouEntrega === 'function'))) {
    console.log('FALHOU: o prazo de confirmação não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const calc = (cfg) => page.evaluate(async ({ PROVS, cfg }) => {
    loja = cfg.loja || 'PEDREIRA';
    usuarioAtual = { nome: 'Luiz', cargo: cfg.cargo || 'estoquista' };
    abasPermitidas = cfg.abas === undefined ? null : cfg.abas;
    let url = '';
    sbRequest = async (rota) => { url = rota; if (cfg.falha) throw new Error('rede'); return PROVS; };
    const r = await _calcularEntregasVencidas();
    return { ids: r.map(p => p.id), url };
  }, { PROVS, cfg });

  const a = await calc({});
  check('vence só a entrega da semana de 16/11 (prazo sexta 27/11); a desta semana, a de antes de 16/11, a com exclusão pedida e a com período até 24/11 não', JSON.stringify(a.ids) === '["A"]', a.ids);
  check('a consulta pede só "aguardando" sem pedido de exclusão, da loja', /status=eq\.AGUARDANDO/.test(a.url) && /exclusao_solicitada_em=is\.null/.test(a.url) && /loja_slug=eq\.pedreira/.test(a.url), a.url);
  check('mestre/supervisor/compras não travam', (await calc({ cargo: 'supervisor' })).ids.length === 0 && (await calc({ cargo: 'mestre' })).ids.length === 0);
  check('quem não tem a aba Entrega não trava (não teria como resolver)', (await calc({ abas: ['pedido', 'home'] })).ids.length === 0);
  check('Maglia não trava (não foi citada)', (await calc({ loja: 'MAGLIA' })).ids.length === 0);
  check('falha de rede não trava', (await calc({ falha: true })).ids.length === 0);

  // ── A trava ────────────────────────────────────────────────────────────────────────
  const tr = await page.evaluate(async ({ PROVS }) => {
    loja = 'PEDREIRA'; usuarioAtual = { nome: 'Luiz', cargo: 'estoquista' }; abasPermitidas = null;
    _notaFiscalPendenciasAtivas = [];
    sbRequest = async () => PROVS;
    tab = 'home';
    await _atualizarTravaEntregas();
    const overlay1 = !!document.getElementById('entrega-prazo-overlay');
    const txt = overlay1 ? document.getElementById('entrega-prazo-overlay').textContent.replace(/\s+/g, ' ') : '';
    goTab('pedido');
    const ficou = tab;
    const overlay2 = !!document.getElementById('entrega-prazo-overlay');
    const origCarregar = carregarEntregas; carregarEntregas = async () => {};
    goTab('entrega');
    const foi = tab, overlay3 = !!document.getElementById('entrega-prazo-overlay');
    carregarEntregas = origCarregar;
    return { overlay1, txt, ficou, overlay2, foi, overlay3 };
  }, { PROVS });
  check('vencida: aparece o aviso obrigatório com o fornecedor e quantos itens', tr.overlay1 && /Confirme as entregas atrasadas/.test(tr.txt) && /NOGMIX - JBS/.test(tr.txt) && /1 item/.test(tr.txt), tr.txt);
  check('com o aviso, não dá pra ir pra outra aba (Pedido)', tr.ficou === 'home' && tr.overlay2, tr);
  check('a aba Entrega abre (é onde se resolve) e o aviso sai da frente', tr.foi === 'entrega' && !tr.overlay3, tr);

  // ── ❌ Não chegou + liberação ───────────────────────────────────────────────────────
  const nc = await page.evaluate(async ({ PROVS }) => {
    loja = 'PEDREIRA'; usuarioAtual = { nome: 'Luiz', cargo: 'estoquista' };
    provisoesEntrega = JSON.parse(JSON.stringify(PROVS));
    _epFilaPendente = {}; _epConfirmadosSessao = {};
    _epFilaSalvar = () => {}; render = () => {}; showToast = t => { window.__toast = t; };
    confirm = t => { window.__confirm = t; return true; };
    let processou = 0; _epProcessarFila = () => { processou++; };
    naoChegouEntrega('B');                      // semana ainda não passou: não existe o botão nem a ação
    const depoisB = (_epFilaPendente.PEDREIRA || []).length;
    naoChegouEntrega('A');
    const fila = (_epFilaPendente.PEDREIRA || [])[0] || null;
    // A lista recarrega do banco sem a A (já encerrada): a trava cai na hora.
    _entregasVencidasAtivas = [PROVS[0]];
    sbRequest = async (rota) => /status=eq\.AGUARDANDO/.test(rota) ? PROVS.filter(p => p.id !== 'A') : [];
    _epFetchHistorico = async () => [];
    _verificarAutoAlertaEntregas = () => {};
    tab = 'home';
    await carregarEntregas(true);
    return { depoisB, fila: fila && { id: fila.id, st: fila.status, q: fila.qtdRec, diff: fila.diff, obs: fila.obs }, confirmTxt: window.__confirm, processou,
             vencidas: _entregasVencidasAtivas.length, overlay: !!document.getElementById('entrega-prazo-overlay') };
  }, { PROVS });
  check('"Não chegou" não existe pra entrega cuja semana ainda não passou', nc.depoisB === 0, nc);
  check('"Não chegou" encerra na hora como DIVERGÊNCIA com zero recebido e a falta inteira', nc.fila && nc.fila.id === 'A' && nc.fila.st === 'DIVERGENCIA' && nc.fila.q === 0 && nc.fila.diff === -10 && /NÃO CHEGOU: 10 KG — informado por Luiz/.test(nc.fila.obs) && nc.processou === 1, nc.fila);
  check('…depois de perguntar com o produto e o fornecedor', /"Carne de Sol" \(NOGMIX - JBS\) NÃO chegou\?/.test(nc.confirmTxt || ''), nc.confirmTxt);
  check('confirmou o último atrasado: a trava cai sem precisar recarregar o app', nc.vencidas === 0 && !nc.overlay, nc);

  // ── O cartão na aba Entrega ───────────────────────────────────────────────────────
  const card = await page.evaluate(({ PROVS }) => {
    const p = PROVS[0];
    return { venc: _entregaPrazoVencido(p, '2026-11-28'), naoVenc: _entregaPrazoVencido(p, '2026-11-27'), sexta: _entregaPrazoSexta(p), sextaPeriodo: _entregaPrazoSexta(PROVS[4]) };
  }, { PROVS });
  check('o prazo é a sexta da semana seguinte (17/11 → 27/11; período até 24/11 → 04/12) e vence no sábado', card.sexta === '2026-11-27' && card.sextaPeriodo === '2026-12-04' && card.venc && !card.naoVenc, card);
  const src = require('fs').readFileSync(LOJAS, 'utf8');
  check('o cartão atrasado troca "Solicitar exclusão" por "❌ Não chegou" e mostra o prazo vencido', /class="ep-nao-chegou" onclick="naoChegouEntrega/.test(src) && !/>🗑️ Solicitar exclusão<\/button>/.test(src) && /ep-prazo-vencido/.test(src));
  await ctx.close();

  // ── App Pedido conhece o status novo ──────────────────────────────────────────────
  const srcP = require('fs').readFileSync(PEDIDOS, 'utf8');
  check('app Pedido: SEM_CONFIRMACAO no filtro, no selo e na contagem por status', /\{v:'SEM_CONFIRMACAO',l:'Sem confirmação'\}/.test(srcP) && /'SEM_CONFIRMACAO': '<span class="status-badge/.test(srcP) && /\['SEM_CONFIRMACAO', '⌛', 'sem confirmação'/.test(srcP));

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
