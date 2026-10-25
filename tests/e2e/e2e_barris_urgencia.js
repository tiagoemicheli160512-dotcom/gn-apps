// Pedido do usuário, 5 partes:
//  (a) barris na segunda só libera o acesso à contagem quando feito
//  (b) barris vazios obrigatórios ("não estão colocando")
//  (c) itens de urgência aparecem primeiro pra contagem; o resto só libera depois de enviar
//  (d) "verificar se a trava tá certa, pois bangu disse que conseguiu entrar normalmente"
//  (e) nos vazios, poder colocar a quantidade total em vez de um por um
//
// Os números do fixture são os reais da semana de 28/09/2026: Bangu com 16 vazios (quem fez
// certo) e Campo Grande/Itaquera/Nova América com 1 barril e ZERO vazios (o furo). Os cargos
// da Bangu também são os reais — Patrícia é caixa, e era por ali que passava sem trava.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try {
      // Funções presentes nas DUAS versões — esperar pelas novas faria a contraprova
      // estourar o tempo em vez de medir comportamento.
      await page.waitForFunction(() => {
        try { return typeof _renderTravaBarrisSemanal === 'function'
                  && typeof _addItemBarrisSemanal === 'function'
                  && typeof _checarBarrisSemanalPendencia === 'function'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: o arquivo não carregou as funções de barris'); falhou++; break; } }
  }

  // ── (d) Quem a trava alcança ────────────────────────────────────────────────────────
  const cargos = await page.evaluate(() => {
    const reais = [
      { nome: 'Neto',     cargo: 'estoquista',  loja: 'BANGU' },
      { nome: 'Carol',    cargo: 'sub_gerente', loja: 'BANGU' },
      { nome: 'Patrícia', cargo: 'caixa',       loja: 'BANGU' },   // o furo relatado
      { nome: 'Garçom',   cargo: 'garcom',      loja: 'BANGU' },
      { nome: 'Tiago',    cargo: 'mestre',      loja: 'GERAL' },
      { nome: 'Compras',  cargo: 'compras',     loja: 'GERAL' },
    ];
    const r = {};
    const salvo = usuarioAtual;
    reais.forEach(u => { usuarioAtual = u; r[u.cargo] = _cargoContaBarris(); });
    usuarioAtual = salvo;
    return r;
  });
  check('caixa da loja agora trava (era o furo da Bangu)', cargos.caixa === true);
  check('garçom da loja também trava', cargos.garcom === true);
  check('estoquista e sub-gerente continuam travando', cargos.estoquista === true && cargos.sub_gerente === true);
  check('mestre e compras (loja GERAL) seguem livres', cargos.mestre === false && cargos.compras === false);

  // ── (d) Falha de rede não pode liberar ──────────────────────────────────────────────
  const semRede = await page.evaluate(async () => {
    usuarioAtual = { nome: 'Patrícia', cargo: 'caixa', loja: 'BANGU' };
    loja = 'Bangu';
    try { localStorage.removeItem('gn_barris_semanal_ok'); } catch (e) {}
    const real = window.sbRequest;
    window.sbRequest = () => Promise.reject(new Error('Failed to fetch'));
    await _checarBarrisSemanalPendencia();
    const pend = _barrisSemPendente;
    const avisa = (document.getElementById('barris-semanal-trava-overlay') || {}).innerHTML || '';
    window.sbRequest = real;
    return { pend, temAviso: /Verificar de novo/.test(avisa) };
  });
  check('sem internet a trava FICA de pé (antes liberava)', semRede.pend === true);
  check('e a tela explica + oferece tentar de novo', semRede.temAviso);

  // Mas quem já confirmou não é re-travado quando a rede cai depois
  const jaFez = await page.evaluate(async () => {
    try { localStorage.setItem('gn_barris_semanal_ok', JSON.stringify({ ['bangu|' + wkKey(getMonday(new Date()))]: true })); } catch (e) {}
    const real = window.sbRequest;
    window.sbRequest = () => Promise.reject(new Error('Failed to fetch'));
    await _checarBarrisSemanalPendencia();
    const pend = _barrisSemPendente;
    window.sbRequest = real;
    try { localStorage.removeItem('gn_barris_semanal_ok'); } catch (e) {}
    return pend;
  });
  check('quem já confirmou não é re-travado se a rede cair depois', jaFez === false);

  // ── (e) Quantidade total num lançamento ─────────────────────────────────────────────
  const qtd = await page.evaluate(() => {
    usuarioAtual = { nome: 'Neto', cargo: 'estoquista', loja: 'BANGU' };
    loja = 'Bangu';
    _barrisSemItens = { CLARO: [], VINHO: [] };
    _barrisSemSemVazios = false;
    _barrisSemPendente = true;
    _barrisSemSemanaIni = wkKey(getMonday(new Date()));
    _renderTravaBarrisSemanal();
    // Os 16 vazios reais da Bangu, de uma vez
    document.getElementById('bsem-status-CLARO').value = 'VAZIO';
    document.getElementById('bsem-qtd-CLARO').value = '16';
    _addItemBarrisSemanal('CLARO');
    const html = document.getElementById('barris-semanal-trava-overlay').innerHTML;
    return { total: _barrisSemItens.CLARO.length, html, qtdResetou: document.getElementById('bsem-qtd-CLARO').value };
  });
  check('um lançamento de 16 vira 16 barris (era 16 toques)', qtd.total === 16);
  check('a lista agrupa como "16×" em vez de 16 linhas', /16×/.test(qtd.html));
  check('o campo de quantidade volta pra 1 depois de lançar', qtd.qtdResetou === '1');

  const limite = await page.evaluate(() => {
    let avisos = [];
    const real = window.showToast; window.showToast = (m) => avisos.push(String(m));
    const antes = _barrisSemItens.VINHO.length;
    document.getElementById('bsem-status-VINHO').value = 'VAZIO';
    document.getElementById('bsem-qtd-VINHO').value = '160';   // dedo escorregado
    _addItemBarrisSemanal('VINHO');
    const depois = _barrisSemItens.VINHO.length;
    window.showToast = real;
    return { antes, depois, avisos };
  });
  check('quantidade absurda (160) é barrada em vez de gravar',
    limite.depois === limite.antes && /confira o número/i.test(limite.avisos.join(' ')));

  // ── (b) Vazios obrigatórios ─────────────────────────────────────────────────────────
  // Caso real do furo: Campo Grande/Itaquera/Nova América confirmaram com 1 "Cheio" e zero vazios.
  const semVazio = await page.evaluate(() => {
    _barrisSemItens = { CLARO: [], VINHO: [] };
    _barrisSemSemVazios = false;
    document.getElementById('bsem-status-CLARO').value = 'CHEIO';
    document.getElementById('bsem-validade-CLARO').value = '2026-10-20';
    document.getElementById('bsem-qtd-CLARO').value = '1';
    _addItemBarrisSemanal('CLARO');
    const html = document.getElementById('barris-semanal-trava-overlay').innerHTML;
    const btn = [...document.querySelectorAll('#barris-semanal-trava-overlay button')]
      .find(b => /Confirmar contagem|Falta lançar|Adicione ao menos/.test(b.textContent));
    let avisos = [];
    const real = window.showToast; window.showToast = (m) => avisos.push(String(m));
    let salvou = false;
    const realReq = window.sbRequest;
    window.sbRequest = () => { salvou = true; return Promise.resolve([]); };
    const realConf = window.confirm; window.confirm = () => true;
    _confirmarContagemBarrisSemanal();
    window.showToast = real; window.sbRequest = realReq; window.confirm = realConf;
    return { html, btnTxt: btn ? btn.textContent.trim() : '', btnOff: btn ? btn.disabled : null, salvou, avisos };
  });
  check('com 1 "Cheio" e nenhum vazio, o botão não libera', semVazio.btnOff === true);
  check('e o botão diz o que falta', /Falta lançar os cascos vazios/.test(semVazio.btnTxt));
  check('e nada é gravado se chamarem a confirmação na mão', semVazio.salvou === false);
  check('a tela avisa que vazio é obrigatório e ensina o campo de quantidade',
    /obrigatórios/.test(semVazio.html) && /quantidade/.test(semVazio.html));

  // Loja que de fato não tem vazio nenhum: declara, e fica gravado
  const declarado = await page.evaluate(async () => {
    _barrisSemSemVazios = true;
    _renderTravaBarrisSemanal();
    const btn = [...document.querySelectorAll('#barris-semanal-trava-overlay button')]
      .find(b => /Confirmar contagem/.test(b.textContent));
    let corpos = [];
    const realReq = window.sbRequest;
    window.sbRequest = (url, opt) => { corpos.push({ url, body: opt && opt.body }); return Promise.resolve([]); };
    const realConf = window.confirm; let msg = '';
    window.confirm = (m) => { msg = String(m); return true; };
    const realToast = window.showToast; window.showToast = () => {};
    await _confirmarContagemBarrisSemanal();
    window.sbRequest = realReq; window.confirm = realConf; window.showToast = realToast;
    const conf = corpos.find(c => /confirmacao/.test(c.url));
    return { btnOff: btn ? btn.disabled : null, msg, body: conf ? conf.body : '' };
  });
  check('declarando "não tenho nenhum vazio", o botão libera', declarado.btnOff === false);
  check('a confirmação avisa em voz alta que vai sem vazio', /NENHUM casco vazio/.test(declarado.msg));
  check('e grava sem_vazios=true no banco (fica auditável)', /"sem_vazios":true/.test(declarado.body));

  // ── (c) Urgência primeiro ───────────────────────────────────────────────────────────
  const urg = await page.evaluate(() => {
    usuarioAtual = { nome: 'Neto', cargo: 'estoquista', loja: 'BANGU' };
    loja = 'Bangu';
    // 80 itens de urgência é o número real da Bangu hoje; aqui bastam alguns do catálogo.
    const ids = PRODUTOS_PEDIDO.slice(0, 5).map(p => String(p.item));
    urgenciaTemplate['Bangu'] = ids;
    return { aplicavel: _urgAplicavel(), ids };
  });
  check('com itens marcados, a regra de urgência se aplica à loja', urg.aplicavel === true);

  const semMarcados = await page.evaluate(() => {
    const salvo = urgenciaTemplate['Bangu'];
    urgenciaTemplate['Bangu'] = [];
    const r = _urgAplicavel();
    urgenciaTemplate['Bangu'] = salvo;
    return r;
  });
  check('loja sem urgência marcada (Guarulhos/Itaquera hoje) não é restringida', semMarcados === false);

  const maglia = await page.evaluate(() => {
    const salvo = loja;
    loja = 'Maglia';
    urgenciaTemplate['Maglia'] = ['14', '15'];
    const r = _urgAplicavel();
    loja = salvo;
    return r;
  });
  check('Maglia fica fora (não foi citada no pedido — CLAUDE.md)', maglia === false);

  const lista = await page.evaluate(() => {
    _barrisSemPendente = false;
    _renderTravaBarrisSemanal();
    _urgPendente = true;
    _urgSemanaIni = wkKey(getMonday(new Date()));
    tab = 'pedido';
    window._pedidoFiltro = '';
    window._pedidoGrupo = 'BEBIDAS';
    render();
    const html = document.getElementById('content').innerHTML;
    const linhas = (html.match(/data-pid="/g) || []).length;
    return { html, linhas, urgN: urgenciaTemplate['Bangu'].length };
  });
  check(`a lista mostra só os itens de urgência (${lista.urgN}), não as 332 do catálogo`,
    lista.linhas === lista.urgN || (console.log('   → veio ' + lista.linhas + ' linha(s)'), false));
  check('explica por que a lista está curta', /Conte primeiro a urgência/.test(lista.html));
  check('o filtro de grupo sai da tela (não dá pra fugir pra outra categoria)',
    !/window\._pedidoGrupo='BEBIDAS'/.test(lista.html));
  check('Vazios/Preench saem também', !/⬜ Vazios/.test(lista.html) && !/✓ Preench/.test(lista.html));
  check('o Finalizar fica travado enquanto a urgência não sai',
    /🔒/.test(lista.html) && /Envie a urgência primeiro/.test(lista.html));
  check('o Urgência continua disponível — é o caminho de saída', /_abrirPreviaConfirmar\('urgencia'\)/.test(lista.html));

  // Enviar a urgência libera o catálogo inteiro
  const liberou = await page.evaluate(async () => {
    let corpos = [];
    const realReq = window.sbRequest;
    window.sbRequest = (url, opt) => { corpos.push({ url, body: opt && opt.body }); return Promise.resolve([]); };
    await _registrarUrgenciaEnviada(5);
    window.sbRequest = realReq;
    render();
    const html = document.getElementById('content').innerHTML;
    const linhas = (html.match(/data-pid="/g) || []).length;
    // Tabela renomeada pra gn_pedido_envio_semana no #974, quando passou a guardar
    // tambem a finalizacao.
    const conf = corpos.find(c => /gn_pedido_envio_semana/.test(c.url));
    return { pend: _urgPendente, linhas, gravou: !!conf, body: conf ? conf.body : '',
             voltouGrupo: /window\._pedidoGrupo=/.test(html) };
  });
  check('depois de enviar, a urgência deixa de pender', liberou.pend === false);
  check('e o catálogo inteiro volta (mais que os 5 de urgência)', liberou.linhas > 5);
  check('o filtro de grupo volta', liberou.voltouGrupo);
  check('o envio fica registrado no banco por loja/semana',
    liberou.gravou && /"loja_slug":"bangu"/.test(liberou.body) && /"semana_inicio"/.test(liberou.body));

  // Falha de rede na checagem da urgência NÃO pode travar o pedido da semana
  const urgSemRede = await page.evaluate(async () => {
    _urgPendente = true;
    const real = window.sbRequest;
    window.sbRequest = () => Promise.reject(new Error('Failed to fetch'));
    await _checarUrgenciaPendencia();
    window.sbRequest = real;
    return { pend: _urgPendente, falhou: _urgCheckFalhou };
  });
  check('sem internet a lista do Pedido abre inteira (pedido da semana não pode parar)',
    urgSemRede.pend === false && urgSemRede.falhou === true);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
