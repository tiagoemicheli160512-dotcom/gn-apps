// "Erro ao salvar: Failed to execute 'setItem' on 'Storage': Setting the value of
//  'gn_estoque_v1' exceeded the quota."  — visto na Campo Grande e na Bangu.
//
// A causa não é o tamanho de nenhuma loja: o sbPull junta os dados de TODAS as lojas e de
// TODAS as semanas nas mesmas variáveis (`Object.assign(vendasAll, d.vendasAll)` pra cada
// linha que chega), e o autoSave gravava esse monte inteiro no localStorage. Só estIniAll
// tinha poda. Com 11 lojas e a linha da Bangu sozinha já em ~1 MB no servidor, o limite do
// navegador cai.
//
// E o estrago passa longe do aviso na tela, que é o que esta suíte existe pra fixar:
// cheio, o localStorage para de aceitar QUALQUER gravação. O autoSave engolia o erro
// calado, o app seguia com o estado ANTIGO em disco, e no carregamento seguinte voltava
// desse cache velho e o REENVIAVA pro servidor — foi assim que a Stella voltou a sumir
// depois de trazida de volta. "Consertei e desfez sozinho", sem ninguém conseguir
// explicar.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof _payloadLocal === 'function' && typeof _gravarLocal === 'function'
        && typeof _podarPorLojaSemana === 'function' && typeof autoSave === 'function';
  } catch (e) { return false; } }, null, { timeout: 25000 });

  // Monta o estado como o sbPull deixa: dados de VÁRIAS lojas e de muitas semanas, que é
  // o que acontece de verdade depois de alguns minutos de app aberto.
  const montarRede = () => page.evaluate(() => {
    const seg = d => { const x = new Date(d); const dow = x.getDay(); x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow)); return x.toISOString().slice(0, 10); };
    const hoje = new Date();
    const semanas = [];
    for (let i = 0; i < 40; i++) semanas.push(seg(new Date(hoje.getTime() - i * 7 * 86400000)));
    const lojas = ['BANGU', 'CAXIAS', 'PEDREIRA', 'RANCHO'];
    loja = 'BANGU';
    semana = new Date(semanas[0] + 'T12:00:00');
    estIniAll = {}; vendasAll = {}; contAll = {}; entradasAll = {}; transferAll = {}; pedidoAll = {};
    lojas.forEach(l => semanas.forEach(w => {
      const k = l + '|' + w;
      estIniAll[k] = { X: 1 }; vendasAll[k] = { Y: 2 }; contAll[k] = { Z: 3 };
      entradasAll[k] = [{ id: k }]; transferAll[k] = [{ id: k }]; pedidoAll[k] = { 9: { cx: 1 } };
    }));
    return { lojas: lojas.length, semanas: semanas.length, chaves: Object.keys(vendasAll).length };
  });
  const rede = await montarRede();
  check('o cenário tem o estado de várias lojas e muitas semanas, como o sync deixa',
    rede.chaves === 160, JSON.stringify(rede));

  // ══ 1. A PODA ═══════════════════════════════════════════════════════════════════
  const podado = await page.evaluate(() => {
    const p = _payloadLocal(8);
    const chaves = Object.keys(p.vendasAll);
    return {
      total: chaves.length,
      outrasLojas: chaves.filter(k => k.indexOf('BANGU|') !== 0).length,
      estIni: Object.keys(p.estIniAll).length,
      pedido: Object.keys(p.pedidoAll).length,
      entradas: Object.keys(p.entradasAll).length,
    };
  });
  check('o que vai pro navegador tem só a loja aberta',
    podado.outrasLojas === 0, JSON.stringify(podado));
  check('e só as últimas semanas, não as 40',
    podado.total > 0 && podado.total <= 9, JSON.stringify(podado));
  check('a poda vale pros seis mapas que crescem por semana',
    podado.estIni === podado.total && podado.pedido === podado.total && podado.entradas === podado.total,
    JSON.stringify(podado));

  // Os mapas por loja (sem semana) ficam inteiros: outras partes do app leem a entrada de
  // OUTRA loja (pagamento de transferência grava avaria na loja de destino).
  const inteiros = await page.evaluate(() => {
    minAll = { BANGU: { A: 1 }, CAXIAS: { B: 2 } };
    avariasAll = { BANGU: [{ id: 1 }], CAXIAS: [{ id: 2 }] };
    devolucoesAll = { BANGU: [], PEDREIRA: [{ id: 3 }] };
    const p = _payloadLocal(8);
    return { min: Object.keys(p.minAll).length, av: Object.keys(p.avariasAll).length,
             dev: Object.keys(p.devolucoesAll).length };
  });
  check('mínimos, avarias e devoluções de outras lojas NÃO são podados',
    inteiros.min === 2 && inteiros.av === 2 && inteiros.dev === 2, JSON.stringify(inteiros));

  // A configuração da rede precisa continuar indo, senão o app offline fica sem ficha.
  const config = await page.evaluate(() => {
    const p = _payloadLocal(8);
    return ['lookup', 'fichasCustom', 'insumosCustom', 'mapeamentoPedido', 'fatoresConversao',
            'pedidoRemovidos', 'pedidoRestaurados', 'pedidoCustom'].filter(k => !(k in p));
  });
  check('a configuração da rede continua no cache local', config.length === 0, JSON.stringify(config));

  // ══ 2. O QUE ACONTECE QUANDO NÃO CABE ═══════════════════════════════════════════
  // Cede espaço antes de desistir, em vez de falhar de primeira.
  const cedeu = await page.evaluate(() => {
    const orig = localStorage.setItem.bind(localStorage);
    let tentativas = 0;
    localStorage.setItem = function (k, v) {
      tentativas++;
      // Só aceita quando o payload já encolheu bastante — simula o navegador cheio.
      if (v.length > 2000) { const e = new Error('exceeded the quota'); e.name = 'QuotaExceededError'; throw e; }
      return orig(k, v);
    };
    const r = _gravarLocal();
    localStorage.setItem = orig;
    return { r, tentativas };
  });
  check('quando não cabe, tenta de novo com menos semanas em vez de desistir',
    cedeu.tentativas > 1, JSON.stringify(cedeu));
  check('e avisa que reduziu, quando consegue salvar reduzindo',
    cedeu.r.ok === false || cedeu.r.reduziu === true, JSON.stringify(cedeu.r));

  // ══ 3. O SILÊNCIO QUE CAUSOU A STELLA ═══════════════════════════════════════════
  // Era o pior pedaço: autoSave falhava calado e o app seguia como se tivesse salvo.
  const avisou = await page.evaluate(() => {
    _avisouLocalCheio = false;
    const toasts = [];
    const origToast = window.showToast;
    window.showToast = t => { toasts.push(String(t)); };
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () { const e = new Error('exceeded the quota'); e.name = 'QuotaExceededError'; throw e; };
    autoSave();
    localStorage.setItem = orig;
    window.showToast = origToast;
    return toasts;
  });
  check('autoSave que não consegue gravar NÃO fica mais calado',
    avisou.length > 0, JSON.stringify(avisou));
  check('e o aviso diz que os dados estão no servidor, não só que deu erro',
    avisou.some(t => /servidor/i.test(t)), JSON.stringify(avisou));

  // Mas avisa UMA vez: autoSave roda a cada tecla digitada.
  const segundaVez = await page.evaluate(() => {
    const toasts = [];
    const origToast = window.showToast;
    window.showToast = t => { toasts.push(String(t)); };
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () { const e = new Error('exceeded the quota'); e.name = 'QuotaExceededError'; throw e; };
    autoSave(); autoSave(); autoSave();
    localStorage.setItem = orig;
    window.showToast = origToast;
    return toasts;
  });
  check('mas não vira enxurrada: avisa uma vez, não a cada tecla',
    segundaVez.length === 0, JSON.stringify(segundaVez));

  // E o envio pro servidor NÃO pode parar por causa do cache local cheio — é onde o dado
  // de verdade mora.
  const sincronizou = await page.evaluate(() => {
    let agendou = 0;
    const orig = window.sbScheduleSync;
    window.sbScheduleSync = () => { agendou++; };
    const origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () { throw new Error('exceeded the quota'); };
    autoSave();
    localStorage.setItem = origSet;
    window.sbScheduleSync = orig;
    return agendou;
  });
  check('com o navegador cheio, o envio pro servidor continua acontecendo',
    sincronizou === 1, JSON.stringify(sincronizou));

  // ══ 4. O BOTÃO 💾 DIZ ALGO ÚTIL ═════════════════════════════════════════════════
  const msgBotao = await page.evaluate(() => {
    const toasts = [];
    const origToast = window.showToast;
    window.showToast = t => { toasts.push(String(t)); };
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () { const e = new Error("Failed to execute 'setItem' on 'Storage': Setting the value of 'gn_estoque_v1' exceeded the quota."); throw e; };
    salvarDados();
    localStorage.setItem = orig;
    window.showToast = origToast;
    return toasts.join(' | ');
  });
  check('o botão Salvar não mostra mais o erro cru do navegador',
    !/exceeded the quota/.test(msgBotao), msgBotao);
  check('e diz que os dados estão salvos no servidor',
    /servidor/i.test(msgBotao), msgBotao);
  check('e diz o que fazer', /suporte/i.test(msgBotao), msgBotao);

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
