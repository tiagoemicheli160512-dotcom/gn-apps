// "A loja Norte Shopping tá mostrando um total de 300 kg de carne aproximadamente de
//  entrada, porém verificando com a loja foram entregues só 107 kg."
//
// Era a contagem de terça lançada também no campo de ENTRADA de terça — nas quatro carnes.
// Dado real da semana de 28/09: inicial 213,15 · contagem de terça 213,15 · ent_ter 213,15.
// Entrada real do dia: zero. A venda estimada passou de 320 pra 533 kg, estragando
// justamente a conta que serve pra apontar perda.
//
// Varri três meses de todas as lojas: o padrão aparece só nesse caso. Então não é defeito de
// cálculo — é lançamento. O que o app devia ter feito era desconfiar, e não aceitar calado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Reprodução fiel do que estava gravado, antes da limpeza.
const NORTE_28_09 = {
  carne_sol:  { inicial:'213.15', ter:'213.15', ent_seg:107.4, ent_ter:'213.15', autoEnt_seg:107.4 },
  picanha:    { inicial:'91.2',   ter:'91.20',  ent_seg:60,    ent_ter:'91.2',   autoEnt_seg:60 },
  carne_seca: { inicial:'48.2',   ter:'48.20',  ent_seg:'42',  ent_ter:'48.2' },
  camarao:    { inicial:'52.3',   ter:'52.30',  ent_seg:'53',  ent_ter:'52.3', autoEnt_seg:12, autoEnt_ter:12 },
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  const page = await ctx.newPage();
  await page.goto(('file://' + CAMINHOS.pub('gn-lojas-config.js')));
  await page.setContent(('<script src="file://' + CAMINHOS.pub('gn-lojas-config.js') + '"></script>'));
  await page.waitForFunction(() => typeof window.gnEntradaCarneSuspeita === 'function', { timeout: 15000 });

  const chama = (d, dia) => page.evaluate(([x, y]) => window.gnEntradaCarneSuspeita(x, y), [d, dia]);

  // ── 1. O caso real é pego ────────────────────────────────────────────────────────
  check('carne de sol: entrada igual à contagem do dia é apontada',
    /contagem deste dia/.test(await chama(NORTE_28_09.carne_sol, 'ter') || ''));
  check('picanha também', !!(await chama(NORTE_28_09.picanha, 'ter')));
  check('carne seca também', !!(await chama(NORTE_28_09.carne_seca, 'ter')));
  check('camarão também — mesmo tendo autoEnt daquele dia com OUTRO valor',
    !!(await chama(NORTE_28_09.camarao, 'ter')));

  // ── 2. O que é entrada de verdade não pode ser acusado ──────────────────────────
  // Esta é a metade que importa: alerta que grita à toa é alerta que ninguém lê.
  check('a entrada real de segunda (107,4) não é apontada',
    (await chama(NORTE_28_09.carne_sol, 'seg')) === null);
  check('entrada que ainda é o valor da automação nunca é questionada',
    (await chama({ inicial:'50', seg:'50', ent_seg:'50', autoEnt_seg:50 }, 'seg')) === null);
  check('campo de entrada vazio não gera aviso',
    (await chama({ inicial:'100', ter:'100', ent_ter:'' }, 'ter')) === null);
  check('entrada zero também não', (await chama({ inicial:'100', ent_ter:'0' }, 'ter')) === null);
  check('dia sem nada cadastrado não gera aviso',
    (await chama({ inicial:'100' }, 'qui')) === null);
  check('entrada normal, diferente de tudo, passa limpo',
    (await chama({ inicial:'213.15', ter:'190', ent_ter:'107.4' }, 'ter')) === null);

  // ── 3. Igual ao estoque inicial, mesmo em outro dia ─────────────────────────────
  const iniQui = await chama({ inicial:'213.15', qui:'180', ent_qui:'213.15' }, 'qui');
  check('entrada igual ao estoque inicial é apontada, em qualquer dia',
    /estoque inicial/.test(iniQui || ''));

  // ── 4. Tolerância: casas decimais não enganam nem atrapalham ───────────────────
  check('"52.3" e "52.30" são o mesmo número pra regra',
    !!(await chama({ inicial:'52.3', ter:'52.30', ent_ter:'52.3' }, 'ter')));
  check('diferença real de 100 g NÃO é apontada (é entrega mesmo)',
    (await chama({ inicial:'213.15', ter:'213.15', ent_ter:'213.25' }, 'ter')) === null);

  // ── 5. Entrada dá pra conferir quanto a conta estava inflada ───────────────────
  const contas = await page.evaluate((d) => {
    const DIAS = ['seg','ter','qua','qui','sex','sab','dom'];
    const soma = c => DIAS.reduce((a, x) => a + (parseFloat(c['ent_' + x]) || 0), 0);
    const limpo = c => DIAS.reduce((a, x) => a + (window.gnEntradaCarneSuspeita(c, x) ? 0 : (parseFloat(c['ent_' + x]) || 0)), 0);
    const r = {};
    Object.keys(d).forEach(k => { r[k] = { comErro: soma(d[k]), semSuspeitas: limpo(d[k]) }; });
    return r;
  }, NORTE_28_09);
  check('carne de sol: 320,6 na tela contra 107,4 de entrada real',
    Math.abs(contas.carne_sol.comErro - 320.55) < 0.01 && Math.abs(contas.carne_sol.semSuspeitas - 107.4) < 0.01);
  const inflado = Object.values(contas).reduce((a, x) => a + x.comErro - x.semSuspeitas, 0);
  check('somadas as quatro carnes, eram 404,85 kg de entrada que não existiram',
    Math.abs(inflado - 404.85) < 0.01);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
