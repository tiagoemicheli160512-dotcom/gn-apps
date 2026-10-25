// "Na função horista também não pedir banco nem jovem aprendiz."
//
// Gerente e Sub Gerente já ficavam de fora. O detalhe é que Horista e Jovem Aprendiz estão em
// DOIS campos diferentes do cadastro, e cada loja usou de um jeito — os combos abaixo são os
// que existem de verdade na base hoje (semana 37):
//
//   tipo JOVEM APRENDIZ + setor Salão ............ 11 pessoas  -> só o TIPO pega
//   tipo HORISTA + setor Salão/ASG/Cozinha/vazio .. 12 pessoas -> só o TIPO pega
//   tipo HORISTA + setor Horista ..................  2 pessoas -> os dois pegam
//   tipo CLT / MENSALISTA + setor Horista .........  1 pessoa   -> só o SETOR pega
//
// Ou seja: fazer só por setor deixaria os 11 jovens aprendizes sendo cobrados, e fazer só por
// tipo deixaria a pessoa da Campo Grande. Por isso a regra olha os dois.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// [setor, tipo, esperaSemBanco, descrição]
const CASOS = [
  ['Gerente',     'CLT / MENSALISTA', true,  'Gerente (já era)'],
  ['Sub Gerente', 'CLT / MENSALISTA', true,  'Sub Gerente (já era)'],
  ['Salão',       'JOVEM APRENDIZ',   true,  'Jovem Aprendiz no Salão — os 11 da base'],
  ['Salão',       'HORISTA',          true,  'Horista no Salão'],
  ['ASG',         'HORISTA',          true,  'Horista na ASG'],
  ['Cozinha',     'HORISTA',          true,  'Horista na Cozinha'],
  ['',            'HORISTA',          true,  'Horista sem setor preenchido'],
  ['Horista',     'HORISTA',          true,  'Horista nos dois campos'],
  ['Horista',     'CLT / MENSALISTA', true,  'setor Horista com tipo CLT — a pessoa da Campo Grande'],
  ['Salão',       'CLT / MENSALISTA', false, 'CLT do Salão continua sendo cobrado'],
  ['Cozinha',     'CLT / MENSALISTA', false, 'CLT da Cozinha continua sendo cobrado'],
  ['Caixa',       '',                 false, 'sem tipo preenchido continua sendo cobrado'],
  ['Salão',       'jovem aprendiz',   true,  'tipo em minúscula também conta'],
  [' Horista ',   'CLT / MENSALISTA', true,  'setor com espaço em volta também conta'],
];

// Quando o helper não existe (arquivo antigo), aplica a regra que estava no lugar dele — só
// o setor. É o que deixa a contraprova medir COMPORTAMENTO em vez da ausência da função.
// Tudo por identificador direto: os Sets são `const` no escopo do script e não aparecem em
// window, então window['BH_SETORES_SEM_BANCO'] é sempre undefined.
async function avaliar(page, qual) {
  return page.evaluate(({ casos, qual }) => casos.map(c => {
    const f = { setor: c[0], tipo: c[1] };
    try {
      if (qual === 'chk') {
        if (typeof _bhSemBanco === 'function') return !!_bhSemBanco(f);
        return !!BH_SETORES_SEM_BANCO.has((f.setor || '').trim());
      }
      if (typeof _bhSemBancoHome === 'function') return !!_bhSemBancoHome(f);
      return !!BH_SETORES_SEM_BANCO_HOME.has((f.setor || '').trim());
    } catch (e) { return 'ERRO:' + (e && e.message); }
  }), { casos: CASOS, qual });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });

  const ALVOS = [[CHK, 'chk', 'Check-list'], [HOME, 'home', 'Painel']];
  for (const [arquivo, qual, rotulo] of ALVOS) {
    const page = await ctx.newPage();
    for (let t = 1; ; t++) {
      await page.goto('file://' + arquivo);
      try {
        // Espera pelo Set, que existe nas duas versões — esperar pela função nova faria a
        // contraprova só estourar o tempo sem medir nada. Por identificador direto: `const`
        // no escopo do script não vira propriedade de window.
        await page.waitForFunction((q) => {
          try {
            return q === 'chk' ? (BH_SETORES_SEM_BANCO instanceof Set)
                               : (BH_SETORES_SEM_BANCO_HOME instanceof Set);
          } catch (e) { return false; }
        }, qual, { timeout: 25000 });
        break;
      } catch (e) { if (t >= 3) { console.log(`FALHOU: ${rotulo} — a lista de setores não carregou`); falhou++; break; } }
    }
    const res = await avaliar(page, qual).catch(() => null);
    if (!res) { console.log(`FALHOU: ${rotulo} — não deu pra avaliar`); falhou++; await page.close(); continue; }
    CASOS.forEach((c, i) => check(`${rotulo}: ${c[3]}`, res[i] === c[2]));
    await page.close();
  }

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
