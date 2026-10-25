// "Podemos colocar as lojas com mais cancelamento em ordem do melhor pro pior, embaixo
//  desse relatório que aparece dos motivos."
//
// Um ranking é uma afirmação sobre quem está melhor, e é fácil ele mentir de três jeitos
// que ninguém percebe olhando a tela:
//   1. ordenar por REAIS — aí a loja maior é sempre a pior, só por ser maior;
//   2. premiar quem NÃO RESPONDEU — loja que não assinou tem zero cancelamento no papel,
//      e um zero não conferido no topo é exatamente o incentivo errado;
//   3. a tela dizer uma ordem e o relatório do WhatsApp mandar outra.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Fixture com o caso que o ranking existe pra resolver: Itaquera cancela MAIS em reais que
// Guarulhos, mas fatura quase o triplo — em % do faturamento ela está melhor.
//   Itaquera     R$ 1.500 de R$ 300.000 = 0,50%
//   Norte        R$ 1.200 de R$ 200.000 = 0,60%
//   Guarulhos    R$   800 de R$  80.000 = 1,00%   ← a pior, e a que menos cancela em reais
//   Bangu        R$   300 sem faturamento no período → sem % , vai pro fim
//   Caxias       zero, com todos os caixas assinados  → zero conferido, o melhor
//   Pedreira     zero, mas sem ninguém assinar        → FORA do ranking
const FIX = {
  cancel: {
    'ITAQUERA':       [{ data: '2026-10-24', valor: 1500, motivo: 'a', motivo_categoria: 'Cliente desistiu', autor: 'Gilda', foto: 'x' }],
    'NORTE SHOPPING': [{ data: '2026-10-24', valor: 1200, motivo: 'b', motivo_categoria: 'Troca de pedido ou produto', autor: 'Ana', foto: 'x' }],
    'GUARULHOS':      [{ data: '2026-10-24', valor: 800,  motivo: 'c', motivo_categoria: 'Erro de lançamento', autor: 'Léo', foto: 'x' }],
    'BANGU':          [{ data: '2026-10-24', valor: 300,  motivo: 'd', motivo_categoria: 'Outro', autor: 'Rita', foto: 'x' }],
  },
  fat: { 'ITAQUERA': 300000, 'NORTE SHOPPING': 200000, 'GUARULHOS': 80000, 'BANGU': 0, 'CAXIAS': 150000, 'PEDREIRA': 90000 },
  decl: {
    'CAXIAS':   { caixas: 10, declarados: 10, abertos: 0, responsaveis: ['Bia'] },
    'PEDREIRA': { caixas: 10, declarados: 0,  abertos: 0, responsaveis: [] },
  },
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof _buildCancelPanel === 'function' && typeof _cancelRankingLinhas === 'function'
        && typeof _cancelRelatorioTexto === 'function';
  } catch (e) { return false; } }, { timeout: 30000 });

  const montar = f => page.evaluate(f2 => {
    _dashCancelPer = f2.cancel;
    _dashFat = f2.fat;
    _dashDeclPer = f2.decl;
    _dashPer = 'mes'; _dashMoff = 0;
    return { html: _buildCancelPanel(), linhas: _cancelRankingLinhas(_cancelMacroDados()),
             texto: _cancelRelatorioTexto(true).msg };
  }, f);

  const r = await montar(FIX);

  // ── A ordem ────────────────────────────────────────────────────────────────────────
  const ordem = r.linhas.map(l => l.nome);
  check('o ranking existe e traz as lojas certas', r.linhas.length === 5, JSON.stringify(ordem));
  check('a loja com ZERO conferido vem em primeiro', ordem[0] === 'Caxias', JSON.stringify(ordem));
  check('depois vem a menor % do faturamento, não o menor valor em reais',
    ordem[1] === 'Itaquera' && ordem[2] === 'Norte Shopping' && ordem[3] === 'Guarulhos',
    JSON.stringify(r.linhas.map(l => ({ n: l.nome, pct: l.pct, v: l.valor }))));
  check('quem cancela MENOS em reais pode ser a pior — e aqui é (Guarulhos, 1,00%)',
    ordem[3] === 'Guarulhos' && r.linhas[3].valor === 800 &&
    r.linhas.some(l => l.valor > 800 && l.pct < r.linhas[3].pct),
    JSON.stringify(r.linhas.map(l => ({ n: l.nome, pct: l.pct, v: l.valor }))));
  check('loja sem faturamento no período vai pro FIM, não pro topo',
    ordem[4] === 'Bangu' && r.linhas[4].pct === null, JSON.stringify(r.linhas[4]));

  const pcts = r.linhas.filter(l => l.pct !== null).map(l => +l.pct.toFixed(2));
  check('os percentuais estão certos (0 · 0,50 · 0,60 · 1,00)',
    JSON.stringify(pcts) === JSON.stringify([0, 0.5, 0.6, 1]), JSON.stringify(pcts));

  // ── O zero não conferido fica de fora ──────────────────────────────────────────────
  check('loja que não assinou NÃO entra no ranking como se fosse a melhor',
    !ordem.includes('Pedreira'), JSON.stringify(ordem));
  // O rodapé não pode juntar "fechou caixa e não assinou" com "não fechou caixa": a
  // primeira é cobrança de alguém, a segunda não é de ninguém.
  check('a tela separa o zero NÃO conferido de quem nem fechou caixa',
    /1 loja ficou de fora com zero NÃO conferido/.test(r.html) && /5 sem caixa fechado/.test(r.html),
    (r.html.match(/ficou de fora[^<]*/) || ['(nada)'])[0]);

  // ── Onde fica na tela ──────────────────────────────────────────────────────────────
  const pos = await page.evaluate(h => {
    const d2 = document.createElement('div'); d2.innerHTML = h;
    const txt = d2.textContent;
    return { cat: txt.indexOf('POR CATEGORIA'), rank: txt.indexOf('DO MELHOR PRO PIOR'),
             lojas: txt.indexOf('Itaquera'), criterio: /% do faturamento/.test(txt) };
  }, r.html);
  check('o ranking aparece DEPOIS do bloco de categorias', pos.cat >= 0 && pos.rank > pos.cat, JSON.stringify(pos));
  check('e ANTES da lista loja a loja', pos.rank < pos.lojas, JSON.stringify(pos));
  check('a tela diz em cima de qual critério ele ordena', pos.criterio === true, JSON.stringify(pos));

  // ── O relatório conta a MESMA história ─────────────────────────────────────────────
  const noTexto = (r.texto.match(/\d+º ([^:]+):/g) || []).map(x => x.replace(/^\d+º /, '').replace(/:$/, ''));
  check('o relatório do WhatsApp traz o mesmo ranking, na mesma ordem',
    JSON.stringify(noTexto) === JSON.stringify(ordem), JSON.stringify({ texto: noTexto, tela: ordem }));
  check('e diz o critério também', /% do faturamento/.test(r.texto),
    r.texto.slice(r.texto.indexOf('melhor pro pior'), r.texto.indexOf('melhor pro pior') + 120));

  // ── Não quebra nos casos de borda ──────────────────────────────────────────────────
  const umaSo = await montar({ cancel: { 'BANGU': FIX.cancel.BANGU }, fat: { 'BANGU': 50000 }, decl: {} });
  check('com uma loja só, não desenha ranking (não é ranking, é repetição)',
    !/DO MELHOR PRO PIOR/.test(umaSo.html), umaSo.html.slice(0, 160));

  const vazio = await montar({ cancel: {}, fat: {}, decl: {} });
  check('sem nenhum cancelamento, o painel segue de pé e sem ranking',
    !/DO MELHOR PRO PIOR/.test(vazio.html) && vazio.html.length > 200, String(vazio.html).slice(0, 160));

  const semFat = await montar({ cancel: FIX.cancel, fat: {}, decl: {} });
  check('sem nenhum faturamento carregado, ordena pelo que dá pra saber e não quebra',
    semFat.linhas.length === 4 && semFat.linhas.every(l => l.pct === null)
      && semFat.linhas[0].valor === 300, JSON.stringify(semFat.linhas.map(l => [l.nome, l.valor])));

  // Nome de loja com HTML dentro não pode virar marcação.
  const comHtml = await page.evaluate(() => {
    const salvo = LOJA_DISPLAY['BANGU'];
    LOJA_DISPLAY['BANGU'] = 'Ban<img src=x onerror=alert(1)>gu';
    _dashCancelPer = { 'BANGU': [{ data: '2026-10-24', valor: 300, motivo: 'd', motivo_categoria: 'Outro', autor: 'R', foto: 'x' }],
                       'GUARULHOS': [{ data: '2026-10-24', valor: 800, motivo: 'c', motivo_categoria: 'Outro', autor: 'L', foto: 'x' }] };
    _dashFat = { 'BANGU': 50000, 'GUARULHOS': 80000 };
    _dashDeclPer = {};
    const h = _buildCancelPanel();
    LOJA_DISPLAY['BANGU'] = salvo;
    return h;
  });
  check('nome de loja com HTML dentro é escapado, não interpretado',
    comHtml.includes('&lt;img') && !comHtml.includes('<img src=x'),
    comHtml.slice(Math.max(0, comHtml.indexOf('Ban') - 40), comHtml.indexOf('Ban') + 90));

  // ── O faturamento, que é o denominador do % ────────────────────────────────────────
  // "Tem como colocar o valor do faturamento, ao selecionar mês, semana."
  // Sem ele a ordem é uma afirmação que ninguém consegue conferir: o % aparece, mas a
  // conta que o produziu fica escondida.
  const comFat = await montar(FIX);
  check('cada linha mostra de quanto faturamento saiu o %',
    /de R\$ 300,0k faturados/.test(comFat.html) && /de R\$ 200,0k faturados/.test(comFat.html)
      && /de R\$ 80,0k faturados/.test(comFat.html),
    (comFat.html.match(/de R\$ [^<]*/g) || []).slice(0, 4).join(' | '));
  check('loja sem faturamento no período diz isso, em vez de "de R$ 0"',
    /sem faturamento no período/.test(comFat.html) && !/de R\$ 0 faturados/.test(comFat.html),
    (comFat.html.match(/sem faturamento[^<]*/g) || ['(nada)'])[0]);
  check('a conta fecha: cancelado ÷ faturado = o % mostrado',
    comFat.linhas.filter(l => l.pct !== null).every(l =>
      Math.abs(l.valor / l.fat * 100 - l.pct) < 0.0001),
    JSON.stringify(comFat.linhas.map(l => [l.nome, l.valor, l.fat, l.pct])));

  // Trocar de período troca o faturamento: é o mesmo _dashFat que alimenta os cards, e
  // ele é recarregado a cada mudança de semana/mês no Painel.
  const semana = await montar({
    cancel: { 'ITAQUERA': [{ data: '2026-10-24', valor: 400, motivo: 'a', motivo_categoria: 'Outro', autor: 'G', foto: 'x' }],
              'GUARULHOS': [{ data: '2026-10-24', valor: 200, motivo: 'b', motivo_categoria: 'Outro', autor: 'L', foto: 'x' }] },
    fat: { 'ITAQUERA': 70000, 'GUARULHOS': 18000 }, decl: {},
  });
  check('ao trocar o período, o faturamento da linha acompanha',
    /de R\$ 70,0k faturados/.test(semana.html) && !/de R\$ 300,0k/.test(semana.html),
    (semana.html.match(/de R\$ [^<]*/g) || []).join(' | '));
  check('e o % é recalculado em cima do faturamento daquele período',
    Math.abs(semana.linhas.find(l => l.nome === 'Itaquera').pct - 0.5714) < 0.001,
    JSON.stringify(semana.linhas.map(l => [l.nome, l.pct])));

  check('o relatório também diz de quanto faturamento saiu',
    /de R\$ 300,0k/.test(comFat.texto) && /sem faturamento no período/.test(comFat.texto),
    (comFat.texto.match(/\dº [^\n]*/g) || []).slice(0, 3).join(' | '));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log('\n' + ARQ);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
