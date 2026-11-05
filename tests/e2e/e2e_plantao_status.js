// "A Taynara está de férias e no card aparece folga."
//
// O hero da Home mostra Gerente e Sub-Gerente do dia. _plantaoStatusFunc devolvia
// `{ folga: true }` para TUDO que não fosse presença, e a linha escrevia "de folga" —
// então férias, afastamento, falta, atestado e suspensão saíam todos com o mesmo rótulo.
//
// Dado real que gerou o print (gn_comissoes, BANGU, semana 40):
//   TAYNARA ALVES · Sub Gerente · ["PRESENTE","FÉRIAS","FÉRIAS","FÉRIAS","FÉRIAS","FÉRIAS","FÉRIAS"]
// Sábado é o índice 5 → FÉRIAS. O card dizia folga.
//
// Folga é um dia; férias é um período em que a loja está sem aquela pessoa. Quem lê o hero
// pra saber com quem contar hoje precisa da diferença — e uma FALTA de sub-gerente
// disfarçada de folga é pior ainda.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
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
    return typeof _plantaoStatusFunc === 'function' && typeof ESCALA_HOME_STATUS_LABEL === 'object';
  } catch (e) { return false; } }, { timeout: 30000 });

  // ── O motor ─────────────────────────────────────────────────────────────────
  const r = await page.evaluate(() => {
    // Dias exatamente como estão no banco pra Taynara na semana 40.
    const taynara = { nome: 'TAYNARA ALVES', setor: 'Sub Gerente',
      dias: ['PRESENTE','FÉRIAS','FÉRIAS','FÉRIAS','FÉRIAS','FÉRIAS','FÉRIAS'], horario_dias: [] };
    const sab = _plantaoStatusFunc(taynara, 5, '07:37');  // sábado, hora do print
    const seg = _plantaoStatusFunc(taynara, 0, '07:37');  // segunda, PRESENTE
    const porStatus = {};
    for (const st of ['FOLGA','FÉRIAS','AFASTAMENTO','BANCO DE HORAS','FALTA','ATESTADO','SUSPENSÃO','NÃO TRABALHADO']) {
      porStatus[st] = _plantaoStatusFunc({ dias: [st], horario_dias: [] }, 0, '10:00');
    }
    // Status que ninguém previu: não pode virar "folga" caladamente.
    const inventado = _plantaoStatusFunc({ dias: ['LICENÇA PATERNIDADE'], horario_dias: [] }, 0, '10:00');
    // Quem está escalado continua como estava.
    const emTurno = _plantaoStatusFunc({ dias: ['PRESENTE'], horario_dias: [{ entrada: '08:00', saida: '17:00' }] }, 0, '10:00');
    const foraDeTurno = _plantaoStatusFunc({ dias: ['PRESENTE'], horario_dias: [{ entrada: '15:00', saida: '23:00' }] }, 0, '07:37');
    return { sab, seg, porStatus, inventado, emTurno, foraDeTurno,
             labels: ESCALA_HOME_STATUS_LABEL, cores: ESCALA_HOME_STATUS_COLOR };
  });

  check('sábado da Taynara é reconhecido como ausência', r.sab.folga === true, JSON.stringify(r.sab));
  check('e o status FÉRIAS não é mais jogado fora', r.sab.status === 'FÉRIAS', JSON.stringify(r.sab));
  check('segunda, que é PRESENTE, não vira ausência', r.seg.folga === false, JSON.stringify(r.seg));
  for (const st of Object.keys(r.porStatus)) {
    check(`${st} chega na tela como ${st}, não como folga`,
      r.porStatus[st].status === st, JSON.stringify(r.porStatus[st]));
  }
  check('status fora do vocabulário não é rebatizado de folga',
    r.inventado.status === 'LICENÇA PATERNIDADE', JSON.stringify(r.inventado));
  check('quem está no turno continua em plantão', r.emTurno.emPlantao === true, JSON.stringify(r.emTurno));
  check('e quem ainda não chegou segue "escalado", não folga',
    r.foraDeTurno.folga === false && r.foraDeTurno.emPlantao === false, JSON.stringify(r.foraDeTurno));

  // ── A linha que aparece no card ─────────────────────────────────────────────
  const html = await page.evaluate(() => {
    const el = document.createElement('div'); el.id = 'hero-plantao'; document.body.appendChild(el);
    const esc = s => window.escapeHtml ? window.escapeHtml(s) : s;
    // Monta a linha do mesmo jeito que _renderPlantaoHome monta, sem a ida ao banco.
    const linha = (f, diaIdx) => {
      const st = _plantaoStatusFunc(f, diaIdx, '07:37');
      const rotulo = ESCALA_HOME_STATUS_LABEL[st.status] || st.status || 'Folga';
      const cor = ESCALA_HOME_STATUS_COLOR[st.status] || '#94a3b8';
      return { rotulo, cor };
    };
    return {
      ferias: linha({ dias: ['FÉRIAS'], horario_dias: [] }, 0),
      folga:  linha({ dias: ['FOLGA'], horario_dias: [] }, 0),
      falta:  linha({ dias: ['FALTA'], horario_dias: [] }, 0),
      afast:  linha({ dias: ['AFASTAMENTO'], horario_dias: [] }, 0),
    };
  });
  check('a linha da Taynara passa a dizer "Férias"', html.ferias.rotulo === 'Férias', JSON.stringify(html.ferias));
  check('quem está de folga continua dizendo "Folga"', html.folga.rotulo === 'Folga', JSON.stringify(html.folga));
  check('e uma FALTA de sub-gerente aparece como falta, não como folga',
    html.falta.rotulo === 'Falta', JSON.stringify(html.falta));
  check('afastamento também', html.afast.rotulo === 'Afastamento', JSON.stringify(html.afast));
  check('cada situação tem cor própria, em vez de tudo cinza',
    new Set([html.ferias.cor, html.folga.cor, html.falta.cor, html.afast.cor]).size === 4,
    JSON.stringify([html.ferias.cor, html.folga.cor, html.falta.cor, html.afast.cor]));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await ctx.close(); await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
