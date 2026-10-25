// A categoria no app Home: painel macro e relatório.
//
// O ponto que importa aqui é aritmético. O agrupamento por categoria tem que somar
// EXATAMENTE o mesmo total que o KPI do topo — se uma linha antiga (sem categoria) cair
// fora da conta, o quadro passa a mentir em silêncio, que é pior que não ter o quadro.
// Por isso o teste mistura registros novos com os antigos, que são 28 no banco hoje.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

// Dados reais do banco, com e sem categoria.
const DADOS = {
  BANGU: [
    { data: '2026-10-16', valor: 89.99, motivo: 'Rodízio pra 2 lançou meia', motivo_categoria: 'Erro de lançamento', autor: 'Aryano', foto: 'u1' },
    { data: '2026-10-16', valor: 13.99, motivo: 'Garçom registrou errado',   motivo_categoria: 'Erro de lançamento', autor: 'Aryano', foto: 'u2' },
  ],
  CAXIAS: [
    { data: '2026-10-16', valor: 452.96, motivo: 'TROCA DE PEDIDO', motivo_categoria: '', autor: 'Renata', foto: 'u3' }, // linha ANTIGA
    { data: '2026-10-15', valor: 29.99,  motivo: 'não tinha sorvete, pegou pudim', motivo_categoria: 'Produto em falta', autor: 'Jonas', foto: null },
  ],
};
const TOTAL = 89.99 + 13.99 + 452.96 + 29.99;

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof _buildCancelPanel === 'function' && typeof _cancelRelatorioTexto === 'function'
        && typeof _cancelPorCategoriaHtml === 'function';
  } catch (e) { return false; } }, { timeout: 30000 });

  const out = await page.evaluate((d) => {
    _dashCancelPer = d;
    _dashCaixaSemConferencia = _dashCaixaSemConferencia || {};
    _dashPer = 'sem'; _dashWoff = 0;
    const painel = _buildCancelPanel();
    const rel = _cancelRelatorioTexto(false).msg;
    const dados = _cancelMacroDados();
    return { painel, rel, total: dados.valor, qtd: dados.qtd };
  }, DADOS);

  // ── A conta ─────────────────────────────────────────────────────────────────
  check('o total não mudou com a categoria entrando', Math.abs(out.total - TOTAL) < 0.005,
    `esperado ${TOTAL}, veio ${out.total}`);
  check('e as 4 notas continuam contadas', out.qtd === 4, out.qtd);

  check('o painel tem o bloco por categoria', /POR CATEGORIA/.test(out.painel), out.painel.slice(0, 200));
  for (const cat of ['Erro de lançamento', 'Produto em falta', 'Sem categoria']) {
    check(`a categoria "${cat}" aparece no painel`, out.painel.includes(cat),
      (out.painel.match(/POR CATEGORIA[\s\S]{0,700}/) || [''])[0]);
  }
  check('a linha antiga sem categoria entra como "Sem categoria", em vez de sumir da soma',
    out.painel.includes('Sem categoria'), 'sem o grupo, R$ 452,96 sumiria do agrupamento');

  // ── O relatório ─────────────────────────────────────────────────────────────
  check('o relatório traz o agrupamento por categoria', /Por categoria:/.test(out.rel),
    out.rel.slice(0, 400));
  check('com a maior primeiro (Sem categoria, R$ 452,96 da linha antiga)',
    /Por categoria:\s*\n\s*Sem categoria/.test(out.rel), (out.rel.match(/Por categoria:[\s\S]{0,180}/) || [''])[0]);
  check('e a soma das categorias fecha com o total do topo', (() => {
    const bloco = (out.rel.match(/Por categoria:\n([\s\S]*?)\n\n/) || [])[1] || '';
    const soma = [...bloco.matchAll(/R\$\s*([\d.]+),(\d{2})/g)]
      .reduce((a, m) => a + parseFloat(m[1].replace(/\./g, '') + '.' + m[2]), 0);
    return Math.abs(soma - TOTAL) < 0.02;
  })(), (out.rel.match(/Por categoria:[\s\S]{0,220}/) || [''])[0]);

  // ── A linha de cada nota ────────────────────────────────────────────────────
  check('nota nova aparece como categoria — detalhe',
    out.rel.includes('Erro de lançamento — Rodízio pra 2 lançou meia'),
    (out.rel.match(/Bangu[\s\S]{0,200}/) || [''])[0]);
  check('nota antiga aparece com o motivo que ela tem, sem "undefined" nem traço solto',
    out.rel.includes('TROCA DE PEDIDO') && !/—\s*—/.test(out.rel) && !/undefined/.test(out.rel),
    (out.rel.match(/Caxias[\s\S]{0,200}/) || [''])[0]);

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await ctx.close(); await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
