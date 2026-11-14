// "fazer a melhoria do aviso" (14/11/2026)
//
// Bangu 10/11 noite fechou com Total do Sistema R$ 78.522,16; a foto do sistema dizia
// R$ 7.852,16 — um "2" a mais. Fechado, o valor foi pro Painel e virou "venda faltando no
// Check-list" de R$ 71 mil. Antes de fechar, o Caixa compara com o normal do mesmo turno no
// mesmo dia da semana e, se estiver 3× acima ou abaixo, pede confirmação.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

// Histórico de Bangu, turno da noite: terças em torno de R$ 7–8 mil; sábados ~R$ 15 mil.
const HIST = [];
const terca = ['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03'];
terca.forEach((d, i) => HIST.push({ data: d, total_sistema: 7000 + i * 150 }));
['2026-10-31', '2026-11-07'].forEach(d => HIST.push({ data: d, total_sistema: 15000 }));

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const pedidos = [];
  let falharHistorico = false;
  await ctx.route('**/rest/v1/**', async r => {
    const u = decodeURIComponent(r.request().url());
    if (/gn_caixa_fechamento\?loja=eq\./.test(u) && /status=eq\.FECHADO/.test(u)) {
      pedidos.push(u);
      if (falharHistorico) return r.abort('internetdisconnected');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HIST) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  const dialogos = []; let responder = true;
  page.on('dialog', d => { dialogos.push(d.message()); responder ? d.accept() : d.dismiss(); });
  await page.goto('file://' + ARQ);
  try { await page.waitForFunction(() => { try { return typeof S === 'object' && S !== null && typeof fecharCaixa === 'function'; } catch (e) { return false; } }, { timeout: 20000 }); }
  catch (e) { console.log('FALHOU: o Caixa não carregou'); process.exit(1); }
  const existe = await page.evaluate(() => typeof _confirmarTotalSistema === 'function');
  if (!existe) { console.log('FALHOU: o aviso de total fora do normal não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }

  const conferir = (valor, data) => page.evaluate(async ([v, d]) => {
    S.loja = 'BANGU'; S.fech = { id: 'f1', loja: 'BANGU', data: d || '2026-11-10', turno: 'NOITE', status: 'ABERTO' };
    _totalConfirmado = null;
    return await _confirmarTotalSistema(v);
  }, [valor, data]);

  // ── O caso de Bangu ──
  dialogos.length = 0; responder = false;
  const r1 = await conferir(78522.16);
  check('R$ 78.522,16 numa terça (normal ~R$ 7,5 mil) pede confirmação', dialogos.length === 1 && /10× MAIOR/.test(dialogos[0]) && /terça \(noite\)/.test(dialogos[0]) && /foto do sistema/.test(dialogos[0]), dialogos);
  check('…"Cancelar" não fecha (volta pra corrigir)', r1 === false);
  const q = pedidos[pedidos.length - 1] || '';
  check('compara com o mesmo turno, só caixas fechados, nas semanas antes da data', /loja=eq\.BANGU/.test(q) && /turno=eq\.NOITE/.test(q) && /status=eq\.FECHADO/.test(q) && /data=lt\.2026-11-10/.test(q), q);

  dialogos.length = 0;
  const r2 = await conferir(7852.16);
  check('o valor certo (R$ 7.852,16) fecha sem perguntar nada', r2 === true && dialogos.length === 0, dialogos);

  dialogos.length = 0; responder = false;
  const r3 = await conferir(785.22);
  check('um dígito a MENOS também avisa (R$ 785,22)', r3 === false && /MENOR/.test(dialogos[0] || ''), dialogos);

  dialogos.length = 0; responder = true;
  const r4 = await conferir(25000);
  check('dia de evento de verdade: "OK" fecha assim mesmo', r4 === true && dialogos.length === 1);

  // Sábado: o normal é o do sábado (~15 mil), não o da terça.
  dialogos.length = 0;
  const r5 = await conferir(16000, '2026-11-14');
  check('compara com o mesmo dia da semana quando tem histórico (sábado de R$ 16 mil não avisa só por ser maior que terça)', r5 === true, dialogos);

  // Sem internet pra buscar o histórico: não segura o fechamento.
  falharHistorico = true; dialogos.length = 0;
  const r6 = await conferir(78522.16);
  check('sem histórico (rede caiu) não trava o fechamento', r6 === true && dialogos.length === 0);
  falharHistorico = false;

  const ligado = await page.evaluate(() => /_confirmarTotalSistema\(sistema\)/.test(String(fecharCaixa)));
  check('o fechamento do caixa passa pelo aviso antes de gravar', ligado);
  check('nenhum erro de JavaScript', erros.length === 0, erros);

  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
