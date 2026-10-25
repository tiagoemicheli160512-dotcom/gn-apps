// A GRADE da aba Banco, com os dados reais da Bangu — o print que o dono mandou.
// O teste de função prova a regra; este prova que a tela usa a regra: que renderBancoHoras
// passa os meses do ciclo em vista, e que trocar pro ciclo encerrado devolve o histórico.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const FX  = require('' + CAMINHOS.fix('fx_bangu_tela.json') + '');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');

let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const escritas = [];
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), url = req.url(), m = req.method();
    if (m !== 'GET') escritas.push({ metodo: m, tabela: url.split('/rest/v1/')[1].split('?')[0] });
    if (/gn_banco_horas/.test(url) && m === 'GET')
      return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(FX.bh) });
    if (/gn_comissoes/.test(url) && m === 'GET')
      return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify([{ all_data: FX.all_data }]) });
    r.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try { return typeof carregarBancoHoras === 'function'; } catch (e) { return false; } }, { timeout: 30000 });

  // Estado de depois do login, com o cadastro da semana vigente.
  await page.evaluate((fx) => {
    LOJA = 'Bangu';
    usuarioLogado = { nome: 'Tiago', cargo: 'mestre' };
    comissoesWD = { funcs: fx.all_data['40'].funcs };
  }, FX);
  await page.evaluate(() => carregarBancoHoras(true));
  await page.waitForFunction(() => {
    const e = document.getElementById('bh-tabela'); return e && /DALVA ROCHA/.test(e.textContent);
  }, { timeout: 25000 });

  const nomesDaGrade = () => page.evaluate(() =>
    [...document.querySelectorAll('#bh-tabela tbody tr td:first-child')]
      .map(td => td.childNodes[0].textContent.trim()).filter(Boolean));
  const cabecalhos = () => page.evaluate(() =>
    [...document.querySelectorAll('#bh-tabela thead th')].map(th => th.textContent.trim()));

  const atual = await nomesDaGrade();
  const th = await cabecalhos();

  check('a grade mostra o ciclo novo (Out/26 em diante), não os meses do ciclo fechado',
    th.some(h => /out/i.test(h)) && !th.some(h => /abr|mai|jun/i.test(h)), th.join(' | '));

  ['ELZA QUEIROZ', 'ELZA XAVIER ( CHEFE)', 'IVO QUEIROZ', 'LIA GOMES', 'VERA URBANO'].forEach(n =>
    check(`a grade não lista ${n} (saiu, último lançamento no ciclo fechado)`, !atual.includes(n)));

  [['CÁIO KLEIN', 'CÁIO WANDER'], ['NARA HORTA', 'NARA OVIDIO'], ['SARA ZENHA', 'TULIO BRAGA'],
   ['UBIRATA SERRA', 'UBIRATA WANDER'], ['VERA HORTA', 'VERA JARDIM']].forEach(([c, comp]) =>
    check(`a grade não duplica "${c}" ao lado de "${comp}"`, !atual.includes(c) && atual.includes(comp)));

  check('a grade tem 37 linhas: 36 do cadastro + RUI ZENHA, que tem lançamento em Out/26',
    atual.length === 37 && atual.includes('RUI ZENHA'), `${atual.length} linhas`);

  check('nenhuma linha repetida', new Set(atual).size === atual.length);

  // Quem está na grade sem estar no cadastro é apontado — senão a loja não entende por quê.
  const marcaForaCadastro = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('#bh-tabela tbody tr')]
      .find(x => /RUI ZENHA/.test(x.cells[0].textContent));
    return tr ? tr.textContent : '';
  });
  check('RUI ZENHA aparece marcada como fora do cadastro', /fora do cadastro/.test(marcaForaCadastro), marcaForaCadastro);

  // ── Trocar pro ciclo encerrado devolve o histórico ──
  await page.evaluate(() => _bhVerCiclo('2026-03-26'));
  await page.waitForFunction(() => /ELZA QUEIROZ/.test(document.getElementById('bh-tabela').textContent), { timeout: 15000 });
  const fechado = await nomesDaGrade();
  ['ELZA QUEIROZ', 'ELZA XAVIER ( CHEFE)', 'LIA GOMES', 'VERA URBANO', 'NARA HORTA', 'SARA ZENHA', 'UBIRATA SERRA'].forEach(n =>
    check(`no ciclo encerrado, ${n} volta pra grade`, fechado.includes(n)));

  // ── A aba é leitura: abrir e trocar de ciclo não grava nada ──
  check('abrir a aba e trocar de ciclo não gravou nada no banco', escritas.length === 0,
    JSON.stringify(escritas));
  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
