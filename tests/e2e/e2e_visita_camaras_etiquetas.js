// "No check-list das visitas, incluir etiquetas vencidas nas câmaras frigoríficas. Não tem.
//  Tive que colocar em outro setor." (15/11/2026)
//
// Item novo em Segurança Alimentar e Validades (salão), crítico e peso 3× como as outras
// validades, com observações e planos de ação prontos. Visita antiga, sem o item, mantém a nota.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => window.GNVck && window.GNVck.SUP_SETORES, null, { timeout: 25000 });

  const r = await page.evaluate(() => {
    const G = window.GNVck;
    const setor = G.SUP_SETORES.find(s => s.key === 'validade');
    const it = setor && setor.itens.find(i => i.key === 'val_camaras');
    const antiga = { itens: { validade: { val_cozinha: 3, val_estoque: 10, val_copa: 10, val_salao: 10, higiene_pessoal: 10, temp_registradas: 8 } } };
    const nova = JSON.parse(JSON.stringify(antiga)); nova.itens.validade.val_camaras = 2;
    const cA = G.calcSalao(antiga), cN = G.calcSalao(nova);
    return {
      existe: !!it, label: it && it.label, critico: it && it.critico, peso: it && it.peso,
      ordem: setor ? setor.itens.map(i => i.key) : [],
      notaAntiga: cA.nota, notaNova: cN.nota,
      criticoNovo: cN.criticos.some(c => c.chave === 'validade|val_camaras'),
    };
  });
  check('Segurança Alimentar e Validades tem o item das etiquetas nas câmaras frigoríficas', r.existe && /câmaras frigoríficas/.test(r.label) && /etiqueta vencida/.test(r.label), r);
  check('…crítico e com peso 3×, como as outras validades', r.critico === true && r.peso === 3, r);
  check('…logo depois do estoque (validades de cozinha/estoque/câmaras juntas)', r.ordem.indexOf('val_camaras') === r.ordem.indexOf('val_estoque') + 1, r.ordem);
  check('visita antiga (sem o item) não muda de nota — item sem resposta não conta', typeof r.notaAntiga === 'number' && r.notaAntiga === Math.round((3*3 + 10*3 + 10*3 + 10*2 + 10 + 8) / ((3+3+3+2+1+1) * 10) * 100), r);
  check('etiqueta vencida na câmara (nota 2) derruba a nota e entra como item crítico', r.notaNova < r.notaAntiga && r.criticoNovo, r);

  // Observações e planos de ação prontos do item (as tabelas OBS_SALAO/SUG_SALAO do módulo).
  const fonte = require('fs').readFileSync(CAMINHOS.pub('gn-visita-checklist.js'), 'utf8');
  check('observações prontas pro item (etiqueta vencida, sem etiqueta, ilegível, troca no ato)', /'validade\|val_camaras': \['Etiqueta vencida na câmara', 'Produto sem etiqueta na câmara'/.test(fonte));
  check('planos de ação prontos pro item (descartar, conferir as câmaras, reetiquetar, conferência diária)', /'validade\|val_camaras': \['Descartar na hora os produtos com etiqueta vencida/.test(fonte));

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
