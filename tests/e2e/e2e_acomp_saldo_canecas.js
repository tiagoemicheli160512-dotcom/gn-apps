// Acompanhamento (26/11/2026, pedido do dono a partir do print da Home da Bangu):
//  1. "Esse número do barril é confuso pra entender, tem como transformar em caneca?"
//     → chopp em canecas: diferença em barris × 128 (+0,98 barril = +125 canecas).
//  2. "Quando tem dois números no mesmo item, − e +, como interpretar?"
//     → o número grande vira o SALDO DA SEMANA (soma das diferenças dos dias, que
//       "telescopa": última contagem × primeira, com chegou e vendido no meio); os dias
//       aparecem embaixo, pequenos ("dias −24,5 · +31,6").
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T14:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => !!window.gnAcomp && !!window.gnCarnesDiario, null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const A = gnAcomp, G = gnCarnesDiario;
    // Camarão da Bangu na semana de 23/11 (o print): seg 20, ter conta 0 com 24,5 que chegou
    // (contada só na quarta), qua 31,6 a mais.
    const carne = (c, vend) => { const lista = G.dias('camarao', c, vend); return { dias: lista, resumo: G.resumo(lista), contagens: G.contagens(c), entradas: G.entradas(c) }; };
    const oscila = carne({ inicial: 30, ter: 5.5, qua: 37.1, ent_seg: 0 }, [0, 0, 0, null, null, null, null]);
    const res = { vigente: true, hojeIdx: 3 };
    const P = (carnes, chopp) => ({ nome: 'Bangu', carnes: { camarao: carnes }, chopp, coca: {} });
    const itCam = A.ITENS.find(i => i.key === 'camarao'), itClaro = A.ITENS.find(i => i.key === 'CLARO');
    const cOsc = A.celula(res, P(oscila), itCam);
    const cBate = A.celula(res, P(carne({ inicial: 30, ter: 5.5, qua: 30.2 }, [0, 0, 0, null, null, null, null])), itCam);
    const cFalta = A.celula(res, P(carne({ inicial: 30, ter: 28, qua: 26 }, [0, 0, 0, null, null, null, null])), itCam);
    // Chopp: usou 0,98 barril a menos do que as vendas explicam (o "+0,98 bar." do print).
    const ch = st => ({ acomp: { CLARO: st } });
    const cSobra = A.celula(res, P(null, ch({ status: 'conferir', dif: -0.98, completo: true })), itClaro);
    const cPerda = A.celula(res, P(null, ch({ status: 'perda', dif: 0.5, completo: true })), itClaro);
    // Detalhe do chopp em canecas.
    const det = A.detalhe(Object.assign({ W: '2026-11-23', W1: '2026-11-16', QUI: '2026-11-26' }, res), P(null, { acomp: { CLARO: { iniEq: 3, entradas: 1, fimEq: 2.5, consumido: 1.5, litros: 101.5, canecas: 290, vendidoBarris: 2.27, dif: -0.77, rendimento: 193, completo: true, status: 'conferir' } } }), itClaro);
    const ler = html => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); const t = d.innerText.replace(/\s+/g, ' '); d.remove(); return t; };
    const detTxt = ler(det);
    const detCarne = ler(A.detalhe(res, P(oscila), itCam));
    return { cOsc, cBate, cFalta, cSobra, cPerda, detTxt, detCarne };
  });
  check('falta num dia e sobra no outro: o número grande é o saldo da semana (−24,5 + 31,6 = +7,1 kg)', r.cOsc.status === 'sobra' && r.cOsc.texto === '+7,1 kg' && r.cOsc.texto2 === 'dias −24,5 · +31,6', r.cOsc);
  check('…e se o saldo fica dentro da margem (1 kg), é "bate", com os dias embaixo', r.cBate.status === 'ok' && r.cBate.texto === '✓' && /^dias −24,5 · \+/.test(r.cBate.texto2 || ''), r.cBate);
  check('só falta nos dias: saldo negativo, sem a linha de dias', r.cFalta.status === 'falta' && r.cFalta.texto === '−4,0 kg' && !r.cFalta.texto2, r.cFalta);
  check('chopp em canecas: +0,98 barril = +125 canecas (× 128)', r.cSobra.status === 'sobra' && r.cSobra.texto === '+125 can.', r.cSobra);
  check('perda de chopp: −0,5 barril = −64 canecas', r.cPerda.status === 'falta' && r.cPerda.texto === '−64 can.', r.cPerda);
  // 26/11/2026: o detalhe passou a ser a conta em canecas, igual à Coca (início + chegou −
  // vendeu = deveria ter; contou). Sem a lista dos barris (fixture só com os totais), o início
  // sai em barris → canecas.
  check('detalhe do chopp em canecas: 3 barris = 384 + chegou 128 − vendeu 290 = deveria ter 222; contou 2½ = 320 → sobram 98',
    /3 barris = 384 canecas/.test(r.detTxt) && /chegou 128 \(1 barril\)/.test(r.detTxt) && /vendeu 290 = deveria ter 222/.test(r.detTxt) && /2½ barris = 320 canecas/.test(r.detTxt) && /Contou 320 · deveria ter 222 → ⚠ sobram 98 canecas — vendeu mais do que os barris mostram/.test(r.detTxt), r.detTxt);
  check('detalhe da carne mostra o saldo da semana e explica a oscilação', /Saldo da semana: \+7,1 kg/.test(r.detCarne) && /carne contada um dia depois/.test(r.detCarne), r.detCarne.slice(0, 300));
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
