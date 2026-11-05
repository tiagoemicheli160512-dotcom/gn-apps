// "Acho não ser necessário esse botão de salvar início do período. E ter a opção de ver o
//  último período e o ciclo atual."
//
// O pedido veio depois de a Bangu trocar, sozinha, o início de 26/03/2026 para 26/09/2026 —
// e como a data cadastrada é a ÂNCORA de todo o histórico, isso apagou o ciclo fechado, jogou
// Jul/Ago/Set como legado dentro do ciclo novo e tirou da loja justamente o seletor de ciclo
// anterior que ela queria. Por isso o cadastro some depois da primeira vez.
//
// O que este teste fixa:
//   1. loja já cadastrada não vê campo nem botão de salvar — só a leitura do ciclo;
//   2. loja sem ciclo ainda vê o cadastro (senão loja nova não começa);
//   3. salvarConfigBancoHoras() recusa sobrescrever uma âncora existente;
//   4. o seletor lista o ciclo atual e TODOS os já encerrados, sempre — não só na carência;
//   5. ciclo encerrado antigo é só leitura: abrir o modal de lançamento é bloqueado;
//   6. o ciclo que acabou de fechar CONTINUA aceitando lançamento durante a carência.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => {
        try {
          return typeof renderBancoHoras === 'function' && typeof _bhContexto === 'function'
            && typeof salvarConfigBancoHoras === 'function' && BH_CICLO_MESES !== undefined;
        } catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) throw e; }
  }

  // Põe a loja num estado conhecido: âncora 26/03/2026 e a data de "hoje" escolhida.
  const montar = (hoje, ancora) => page.evaluate(({ hoje, ancora }) => {
    window.hojeLocal = () => hoje;
    _bhConfig = ancora ? { periodo_inicio: ancora, periodo_fim: '', salariosSetor: {} } : null;
    _bhRegistros = {};
    _bhCicloVisao = 'atual';
    try { renderBancoHoras(); } catch (e) { return { erro: String(e && e.message) }; }
    const info = document.getElementById('bh-ciclo-info');
    const setup = document.getElementById('bh-ciclo-setup');
    const sel = document.getElementById('bh-ciclo-sel');
    return {
      infoVisivel: info && info.style.display !== 'none',
      setupVisivel: setup && setup.style.display !== 'none',
      infoTxt: (document.getElementById('bh-ciclo-info-txt') || {}).textContent || '',
      selHtml: sel ? sel.innerHTML : '',
      selVisivel: sel && sel.style.display !== 'none'
    };
  }, { hoje, ancora });

  // ── 1 e 2. Cadastro só na primeira vez ───────────────────────────────────────────────
  // 27/09/2026: a Bangu está no 2º ciclo (26/09/2026 → 25/03/2027).
  const cadastrada = await montar('2026-09-27', '2026-03-26');
  check('loja já cadastrada não vê o botão de salvar início',
    cadastrada.setupVisivel === false && cadastrada.infoVisivel === true);
  check('e vê o ciclo atual e a âncora, por escrito',
    /26\/09\/2026/.test(cadastrada.infoTxt) && /25\/03\/2027/.test(cadastrada.infoTxt)
      && /26\/03\/2026/.test(cadastrada.infoTxt));

  const semCiclo = await montar('2026-09-27', null);
  check('loja nova, sem ciclo, ainda consegue cadastrar',
    semCiclo.setupVisivel === true && semCiclo.infoVisivel === false);

  // ── 3. Não dá pra sobrescrever a âncora ──────────────────────────────────────────────
  const sobrescrever = await page.evaluate(async () => {
    _bhConfig = { periodo_inicio: '2026-03-26', periodo_fim: '2026-09-25', salariosSetor: {} };
    let mandou = false, aviso = '';
    const sbReal = window.sb, toastReal = window.showToast;
    window.sb = { from: () => ({ upsert: async () => { mandou = true; return { error: null }; } }) };
    window.showToast = (m) => { aviso = String(m || ''); };
    const el = document.getElementById('bh-config-inicio');
    if (el) el.value = '2026-09-26';
    try { await salvarConfigBancoHoras(); } catch (e) {}
    window.sb = sbReal; window.showToast = toastReal;
    return { mandou, aviso, ancoraDepois: _bhConfig.periodo_inicio };
  });
  check('salvar não sobrescreve a âncora de quem já tem ciclo (o caso da Bangu)',
    sobrescrever.mandou === false && sobrescrever.ancoraDepois === '2026-03-26');
  check('e explica por que não deixou', /gest/i.test(sobrescrever.aviso));

  // ── 4. Seletor com todos os ciclos, sempre ───────────────────────────────────────────
  // 15/02/2027: bem depois da carência do ciclo que fechou em 25/09/2026.
  const longe = await montar('2027-02-15', '2026-03-26');
  check('o seletor continua aparecendo fora da carência',
    longe.selVisivel === true && /Ciclo atual/.test(longe.selHtml));
  check('e lista o ciclo encerrado pra consulta',
    /26\/03\/2026 → 25\/09\/2026/.test(longe.selHtml));

  // Com dois ciclos já fechados os dois têm que estar lá.
  const doisFechados = await montar('2027-05-10', '2026-03-26');
  check('com dois ciclos encerrados, os dois aparecem',
    /26\/03\/2026 → 25\/09\/2026/.test(doisFechados.selHtml)
      && /26\/09\/2026 → 25\/03\/2027/.test(doisFechados.selHtml));

  // ── 5 e 6. Leitura x lançamento ──────────────────────────────────────────────────────
  const leitura = await page.evaluate(() => {
    window.hojeLocal = () => '2027-05-10';
    _bhConfig = { periodo_inicio: '2026-03-26', periodo_fim: '', salariosSetor: {} };
    _bhRegistros = {};
    // ciclo mais antigo, muito depois de qualquer carência
    _bhCicloVisao = '2026-03-26';
    const c = _bhContexto();
    return { somenteLeitura: c.somenteLeitura, verAnterior: c.verAnterior, inicio: c.alvo.inicio };
  });
  check('ciclo encerrado antigo fica marcado como só leitura',
    leitura.somenteLeitura === true && leitura.verAnterior === true && leitura.inicio === '2026-03-26');

  const bloqueio = await page.evaluate(async () => {
    window.hojeLocal = () => '2027-05-10';
    _bhConfig = { periodo_inicio: '2026-03-26', periodo_fim: '', salariosSetor: {} };
    _bhCicloVisao = '2026-03-26';
    let aviso = '';
    const toastReal = window.showToast;
    window.showToast = (m) => { aviso = String(m || ''); };
    const antes = _bhModalFunc;
    try { await abrirModalBancoHoras('Fulano'); } catch (e) {}
    window.showToast = toastReal;
    return { aviso, mudouFunc: _bhModalFunc !== antes };
  });
  check('e o modal de lançamento não abre nele',
    /consulta/i.test(bloqueio.aviso) && bloqueio.mudouFunc === false);

  const carencia = await page.evaluate(() => {
    // 27/09/2026 está dentro da carência do ciclo que fechou em 25/09/2026
    window.hojeLocal = () => '2026-09-27';
    _bhConfig = { periodo_inicio: '2026-03-26', periodo_fim: '', salariosSetor: {} };
    _bhCicloVisao = '2026-03-26';
    const c = _bhContexto();
    return { somenteLeitura: c.somenteLeitura, naCarencia: c.naCarencia, inicio: c.alvo.inicio };
  });
  check('o ciclo que acabou de fechar continua aceitando lançamento na carência',
    carencia.naCarencia === true && carencia.somenteLeitura === false && carencia.inicio === '2026-03-26');

  // ── 7. Consultar histórico não pode acender alerta ───────────────────────────────────
  // Alerta é coisa a fazer; em ciclo fechado não há o que fazer. Com saldo estourado no
  // ciclo antigo, navegar até ele não pode pintar o badge de vermelho.
  const badge = await page.evaluate(() => {
    window.hojeLocal = () => '2027-05-10';
    _bhConfig = { periodo_inicio: '2026-03-26', periodo_fim: '', salariosSetor: {} };
    _bhRegistros = { '2026-04': [{ nome: 'Fulano', horas: -40, obs: '' }] };
    _bhCicloVisao = 'atual';
    const noAtual = _bhCalcularAlertas().length;
    _bhCicloVisao = '2026-03-26';       // ciclo encerrado, só leitura
    const noFechado = _bhCalcularAlertas().length;
    return { noAtual, noFechado };
  });
  check('consultar ciclo encerrado não acende o badge de alerta', badge.noFechado === 0);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
