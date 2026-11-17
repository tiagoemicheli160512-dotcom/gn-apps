// "Marquei errado o dia, hoje é 17, coloquei no dia 18 a visita no Norte Shopping
//  presencial… é possível ter um alerta quando marcar no dia errado?" (17/11/2026)
//
// Registrar a chegada tocando no card de outro dia passa a perguntar ANTES de gravar:
// 1ª pergunta "registrar em HOJE?" (OK = grava hoje); se não, 2ª "manter o dia tocado?"
// (OK = grava no dia tocado; Cancelar = não grava). No dia de hoje, nada muda.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

const HOJE = '2026-11-17', AMANHA = '2026-11-18';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, HOJE + 'T10:24:00');
  const posts = [];
  await ctx.route('**/rest/v1/**', route => {
    const req = route.request(), url = req.url();
    if (/gn_chk_visitas/.test(url) && req.method() === 'POST') {
      const b = JSON.parse(req.postData() || '[]'); posts.push(b);
      const rows = (Array.isArray(b) ? b : [b]).map((x, i) => ({ ...x, id: 900 + posts.length * 10 + i }));
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  let respostas = [], perguntas = [];
  page.on('dialog', d => { perguntas.push(d.message()); const r = respostas.shift(); r ? d.accept() : d.dismiss(); });
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _visCalDetalheHtml === 'function' && typeof _visRegistrarChegada === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  if (!(await page.evaluate(() => typeof _visDiaErradoConfirmar === 'function'))) {
    console.log('FALHOU: o alerta de dia errado não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const montar = dia => page.evaluate(d => {
    session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    _visSupList = [{ id: 1, nome: 'Tiago', cargo: 'mestre' }]; _visSupSelecionado = 'Tiago';
    navigator.geolocation.getCurrentPosition = (res, rej) => rej(new Error('sem gps no teste'));
    let box = document.getElementById('_teste-dia'); if (!box) { box = document.createElement('div'); box.id = '_teste-dia'; document.body.appendChild(box); }
    box.innerHTML = _visCalDetalheHtml(d);
    if (!document.getElementById('visitas-sup-content')) { const a = document.createElement('div'); a.id = 'visitas-sup-content'; document.body.appendChild(a); }
    const sel = document.getElementById('visreg-destino-' + d); const o = sel && [...sel.options].find(x => /NORTE|Norte/.test(x.value)); if (o) sel.value = o.value;
    return !!sel;
  }, dia);
  const registrar = async (dia, resp) => {
    respostas = resp.slice(); perguntas = []; const antes = posts.length;
    await page.evaluate(d => _visRegistrarChegada(d), dia);
    await page.waitForTimeout(400);
    const novo = posts.slice(antes).flat();
    return { perguntas: perguntas.slice(), datas: novo.map(b => b.data), status: await page.evaluate(d => (document.getElementById('visreg-status-' + d) || {}).textContent || '', dia) };
  };

  // 1. O caso do Tiago: toca no 18 sendo 17 → OK na 1ª pergunta → grava HOJE.
  check('o card do dia 18 abre com o formulário de chegada', await montar(AMANHA));
  const r1 = await registrar(AMANHA, [true, true]);   // [dia errado: hoje?] [sem foto?]
  check('tocar no 18 sendo 17: pergunta antes de gravar, dizendo AMANHÃ e o dia de hoje',
    /Atenção ao dia da visita/.test(r1.perguntas[0] || '') && /quarta 18\/11 \(AMANHÃ\)/.test(r1.perguntas[0]) && /hoje é terça 17\/11/.test(r1.perguntas[0]), r1.perguntas);
  check('…OK grava a visita em HOJE (17/11), não no 18', r1.datas.length === 1 && r1.datas[0] === HOJE, r1);

  // 2. Cancelar a 1ª e confirmar a 2ª: mantém o dia tocado (registro de dia passado esquecido).
  await montar('2026-11-16');
  const r2 = await registrar('2026-11-16', [false, true, true]);
  check('dia passado: pode manter, confirmando de novo (fala ONTEM e que o check-list vai junto)',
    /ONTEM/.test(r2.perguntas[0] || '') && /check-list desta visita também fica nesse dia/.test(r2.perguntas[1] || '') && r2.datas[0] === '2026-11-16', r2);

  // 3. Cancelar as duas: não grava nada.
  await montar(AMANHA);
  const r3 = await registrar(AMANHA, [false, false]);
  check('cancelar as duas perguntas: nada é gravado e a tela diz pra conferir o dia', r3.datas.length === 0 && /confira o dia/.test(r3.status), r3);

  // 4. Hoje: nenhuma pergunta de dia (só a do "sem foto").
  await montar(HOJE);
  const r4 = await registrar(HOJE, [true]);
  check('no card de hoje não pergunta nada de dia e grava hoje', !r4.perguntas.some(p => /Atenção ao dia/.test(p)) && r4.datas[0] === HOJE, r4);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
