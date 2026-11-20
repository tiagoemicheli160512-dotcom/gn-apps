// "Pode implementar o aviso" (20/11/2026)
//
// Guarulhos 16/08 noite fechou com Total do Sistema R$ 2.111.196,00; a foto do sistema dizia
// R$ 21.111,96 — a vírgula ficou de fora. Antes de fechar, o Caixa compara o total com a soma
// dos comprovantes lançados no próprio caixa; mais de 20% de diferença pede confirmação.
// Funciona mesmo sem histórico (loja/turno novo), que é onde o aviso do histórico não chega.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

// Comprovantes reais de Guarulhos 16/08 (soma R$ 19.774,19).
const COMP = [322.21, 197.97, 1547.82, 194.96, 1177.56, 1363.1, 1072.22, 1024.61, 1450.46, 147.51, 1182.11, 267.22,
  812.68, 1497.24, 929.01, 40.5, 873.98, 1410.67, 22.07, 961.4, 194.12, 353.01, 1230.6, 240.84, 1260.32];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  let historico = [];      // sem histórico: o caso que o aviso antigo não cobria
  await ctx.route('**/rest/v1/**', async r => {
    const u = decodeURIComponent(r.request().url());
    if (/gn_caixa_fechamento\?loja=eq\./.test(u) && /status=eq\.FECHADO/.test(u))
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(historico) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  const dialogos = []; let responder = true;
  page.on('dialog', d => { dialogos.push(d.message()); responder ? d.accept() : d.dismiss(); });
  await page.goto('file://' + ARQ);
  try { await page.waitForFunction(() => { try { return typeof S === 'object' && S !== null && typeof fecharCaixa === 'function'; } catch (e) { return false; } }, { timeout: 20000 }); }
  catch (e) { console.log('FALHOU: o Caixa não carregou'); process.exit(1); }
  const existe = await page.evaluate(() => typeof _totalForaDosComprovantes === 'function');
  if (!existe) { console.log('FALHOU: o aviso total × comprovantes não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }

  const conferir = (valor, comps) => page.evaluate(async ([v, cs]) => {
    S.loja = 'GUARULHOS'; S.fech = { id: 'f1', loja: 'GUARULHOS', data: '2026-08-16', turno: 'NOITE', status: 'ABERTO' };
    S.comprovantes = cs.map((x, i) => ({ id: 'c' + i, bandeira: 'Pix', valor: x }));
    _totalConfirmado = null;
    return await _confirmarTotalSistema(v);
  }, [valor, comps]);

  // ── O caso de Guarulhos ──
  dialogos.length = 0; responder = false;
  const r1 = await conferir(2111196, COMP);
  check('R$ 2.111.196,00 com R$ 19.774,19 de comprovantes pede confirmação (mesmo sem histórico)',
    dialogos.length === 1 && /2\.111\.196,00/.test(dialogos[0]) && /19\.774,19/.test(dialogos[0]), dialogos);
  check('…a mensagem aponta vírgula/dígito fora do lugar e manda conferir a foto',
    /vírgula/.test(dialogos[0] || '') && /107× maior/.test(dialogos[0] || '') && /foto do sistema/.test(dialogos[0] || ''), dialogos);
  check('…"Cancelar" não fecha (volta pra corrigir)', r1 === false);

  dialogos.length = 0;
  const r2 = await conferir(21111.96, COMP);
  check('o valor da foto (R$ 21.111,96, 6,3% acima dos comprovantes) fecha sem perguntar', r2 === true && dialogos.length === 0, dialogos);

  dialogos.length = 0;
  const r3 = await conferir(19774.19, COMP);
  check('total igual aos comprovantes fecha sem perguntar', r3 === true && dialogos.length === 0, dialogos);

  // Vírgula pro outro lado: Bangu 02/10 ficou com 11,682 pra R$ 11.682,47 de comprovantes.
  dialogos.length = 0; responder = false;
  const r4 = await conferir(11.68, [11682.47]);
  check('vírgula a mais (R$ 11,68 × R$ 11.682,47) também avisa como "menor"', r4 === false && /1000× menor/.test(dialogos[0] || '') && /vírgula/.test(dialogos[0] || ''), dialogos);

  // Diferença grande sem ser vírgula: comprovante faltando (Rancho 04/11: 7.093 × 11.080).
  dialogos.length = 0; responder = false;
  const r5 = await conferir(7093.18, [11080.46]);
  check('36% abaixo dos comprovantes avisa com a diferença em % e a dica de comprovante a mais',
    r5 === false && /36%/.test(dialogos[0] || '') && /comprovante lançado a mais/.test(dialogos[0] || '') && !/vírgula/.test(dialogos[0] || ''), dialogos);

  dialogos.length = 0; responder = false;
  const r5b = await conferir(13000, [10000]);
  check('30% acima avisa com a dica de comprovante faltando', r5b === false && /faltado lançar comprovante/.test(dialogos[0] || ''), dialogos);

  // 20% é o limite: diferença de troco/arredondamento não incomoda.
  dialogos.length = 0;
  const r6 = await conferir(11900, [10000]);
  check('até 20% de diferença não pergunta (fecha direto)', r6 === true && dialogos.length === 0, dialogos);

  // OK = o valor está certo: fecha, e não pergunta de novo pelo histórico.
  historico = ['2026-07-19', '2026-07-26', '2026-08-02', '2026-08-09'].map(d => ({ data: d, total_sistema: 20000 }));
  dialogos.length = 0; responder = true;
  const r7 = await conferir(2111196, COMP);
  check('"OK" fecha assim mesmo, com uma pergunta só (não repete pelo histórico)', r7 === true && dialogos.length === 1, dialogos);

  // Sem comprovante lançado: quem decide é o aviso antigo (histórico).
  dialogos.length = 0; responder = false;
  const r8 = await conferir(2111196, []);
  check('sem comprovantes, o aviso do histórico continua valendo', r8 === false && dialogos.length === 1 && /MAIOR que o normal/.test(dialogos[0] || ''), dialogos);

  const ligado = await page.evaluate(() => /_totalForaDosComprovantes\(/.test(String(_confirmarTotalSistema)) && /_confirmarTotalSistema\(sistema\)/.test(String(fecharCaixa)));
  check('o fechamento do caixa passa pelo aviso antes de gravar', ligado);
  check('nenhum erro de JavaScript', erros.length === 0, erros);

  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
