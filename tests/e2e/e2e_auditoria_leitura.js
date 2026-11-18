// "No app home das lojas, no resultado das auditorias, as respostas e as ações ficam ruins
//  pra ver. É possível melhorar, assim como cada aba pra verificar as pontuações — tem loja
//  que não vai nem perceber que tem que arrastar pro lado." (18/11/2026, prints do dono)
//
// Modo leitura (GNVck.abrirLeitura, o que a Home da loja abre):
//  · as seções aparecem TODAS, em grade (nada de faixa rolando pro lado), com a nota;
//  · a resposta de cada item é um selo ("✕ Não conforme"), não três botões travados;
//  · ação corretiva / responsável / prazo / preventiva viram texto corrido (sem caixa
//    cortando), com ";" virando lista;
//  · botões "Seção anterior / Próxima seção";
//  · nada passa da largura da tela em 320 px.
// E no modo de edição (supervisor preenchendo) os campos continuam campos.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

const LINHA = {
  id: 'x1', visita_id: 'v1', loja: 'Bangu', data: '2026-11-18', tipo: 'padrao', visitante: 'Tiago', finalizada: true,
  dados: {
    seguranca_alimentos: { finalizada: true,
      itens: { 0: { resp: 'NAO' }, 1: { resp: 'SIM' }, 2: { resp: 'NA' }, 3: { resp: 'SIM' }, 4: { resp: 'SIM' } },
      planoAcao: [{ itemIdx: 0, crit: 'CRITICO', itemLabel: 'Etiqueta de validade secundária', prazoMax: '2026-11-19', prazo: '2026-11-19',
        acaoCorretiva: 'Etiquetar todos os produtos abertos; Descartar os vencidos',
        responsavel: 'Líder de cozinha; Sub-gerente; Gerente',
        acaoPreventiva: 'Colar o mapa de prateleiras na porta das geladeiras; Treinar a equipe no padrão; Gerente confere no fechamento' }] },
    gestao_pessoas: { finalizada: true, itens: { 0: { resp: 'SIM' } } },
  },
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => window.GNVck && window.GNVck.abrirLeitura, null, { timeout: 30000 });

  const r = await page.evaluate(l => {
    GNVck.abrirLeitura(l);
    const m = document.getElementById('_vck-modal');
    const secoes = [...m.querySelectorAll('.vck-secao')];
    const grade = m.querySelector('.vck-secoes');
    const largos = [...m.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.tagName);
    return {
      nSecoes: secoes.length, gradeDisplay: grade && getComputedStyle(grade).display, gradeOverflow: grade && getComputedStyle(grade).overflowX,
      secaoTexto: secoes.map(s => s.innerText.replace(/\s+/g, ' ')),
      selos: [...m.querySelectorAll('.vck-resp')].map(s => s.textContent.trim()),
      botoesResp: [...m.querySelectorAll('button')].filter(b => /^(✓ SIM|✕ NÃO|N\/A)$/.test(b.textContent.trim())).length,
      campos: m.querySelectorAll('input:not([placeholder^="🔍"]), textarea').length,
      txt: m.innerText.replace(/\s+/g, ' '),
      nav: !!m.querySelector('.vck-nav-secao'), largos, sw: m.scrollWidth, cw: m.clientWidth,
    };
  }, LINHA);
  check('todas as 5 seções aparecem na tela, em grade (sem rolar pro lado)', r.nSecoes === 5 && r.gradeDisplay === 'grid' && r.gradeOverflow !== 'auto', r);
  check('…cada seção com a sua nota (Segurança 🔴, Gestão de Pessoas com %)', /Segurança de Alimentos.*%/.test(r.secaoTexto[0]) && r.secaoTexto.some(t => /Gestão de Pessoas.*100%/.test(t)), r.secaoTexto);
  check('resposta de cada item vira selo (Não conforme / Conforme / N/A), sem os 3 botões', r.selos.includes('✕ Não conforme') && r.selos.includes('✓ Conforme') && r.selos.some(s => /N\/A/.test(s)) && r.botoesResp === 0, r.selos);
  check('plano de ação em texto corrido: nenhuma caixa de digitação na leitura', r.campos === 0, r.campos);
  check('…com o texto inteiro (responsável completo, sem corte) e prazo em dd/mm/aaaa',
    /Líder de cozinha/.test(r.txt) && /Sub-gerente/.test(r.txt) && /Gerente confere no fechamento/.test(r.txt) && /Prazo \(máx\. 19\/11\/2026\) 19\/11\/2026/.test(r.txt), r.txt.slice(r.txt.indexOf('Plano'), r.txt.indexOf('Plano') + 400));
  check('botões de seção anterior/próxima', r.nav && /Próxima seção ›/.test(r.txt));
  check('nada passa da largura da tela em 320 px', r.largos.length === 0 && r.sw <= r.cw, r);

  const prox = await page.evaluate(() => { [...document.querySelectorAll('#_vck-modal button')].find(b => /Próxima seção/.test(b.textContent)).click();
    return document.querySelector('#_vck-modal .vck-secao.on').innerText.replace(/\s+/g, ' '); });
  check('"Próxima seção" troca pra seção seguinte', /Calibração/.test(prox), prox);

  // Modo de edição (supervisor, auditoria aberta): campos continuam campos e os 3 botões voltam.
  const ed = await page.evaluate(l => {
    const d = JSON.parse(JSON.stringify(l.dados)); d.seguranca_alimentos.finalizada = false;
    GNVck.abrirLeitura(Object.assign({}, l, { dados: d }));
    // força modo edição sobre o mesmo render
    const st = GNVck._estado(); st.somenteLeitura = false; st.dados.fechada = false; GNVck._padraoTipo('seguranca_alimentos');
    const m = document.getElementById('_vck-modal');
    return { campos: m.querySelectorAll('textarea').length, botoes: [...m.querySelectorAll('button')].filter(b => /^(✓ SIM|✕ NÃO|N\/A)$/.test(b.textContent.trim())).length };
  }, LINHA);
  check('edição: os campos de texto e os botões SIM/NÃO/N/A continuam', ed.campos >= 2 && ed.botoes === 15, ed);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
