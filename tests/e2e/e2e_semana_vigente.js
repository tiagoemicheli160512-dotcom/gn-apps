// "Precisamos colocar o app sempre que abrir na semana vigente, vi que tem gente vendo a
//  semana errada, e criar um aviso caso clique em mudar a semana, pra ter a certeza que
//  quer de fato olhar outra semana."
//
// A causa era uma linha: state.semIdx = ld('semIdx', calcSemIdxAtual()). A semana ficava
// GRAVADA no aparelho — quem consultasse uma semana antiga uma vez abria nela pra sempre,
// e lançava bruto, falta e folga lá sem perceber. O teste mais importante aqui é o
// primeiro: com uma semana velha salva no localStorage, o app TEM que abrir na vigente.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-comissoes.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  // Semana ANTIGA já gravada, como no aparelho de quem consultou o passado uma vez.
  await ctx.addInitScript(() => { try {
    localStorage.setItem('gn_session_v1', JSON.stringify({ id:1, nome:'Tiago', cargo:'mestre',
      loja:'BANGU', permissoes:{ master:true, comissoes:true }, ts: Date.now() }));
    localStorage.setItem('gn_BANGU_usuario', JSON.stringify('Tiago'));
    localStorage.setItem('gn_BANGU_semIdx', JSON.stringify(12));
    localStorage.setItem('gn_aviso_guia_v1', '1');
  } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof setSemIdx === 'function' && typeof calcSemIdxAtual === 'function'
      && typeof state === 'object' && Array.isArray(CAL);
  } catch (e) { return false; } }, { timeout: 30000 });
  await page.waitForTimeout(400);

  const ATUAL = await page.evaluate(() => calcSemIdxAtual());

  // ══ 1. A causa do problema ════════════════════════════════════════════════════════
  const aberto = await page.evaluate(() => ({ sem: state.semIdx, salvo: JSON.parse(localStorage.getItem('gn_BANGU_semIdx') || 'null') }));
  check('abre na semana VIGENTE mesmo com uma semana antiga gravada no aparelho',
    aberto.sem === ATUAL, `abriu em ${aberto.sem}, vigente é ${ATUAL}, salvo era ${aberto.salvo}`);

  // ══ 2. Sair da semana atual pede confirmação ═════════════════════════════════════
  await page.evaluate(() => { state.tab = 'semana'; render(); });
  await page.evaluate(a => setSemIdx(a - 3), ATUAL);
  await page.waitForTimeout(200);
  const ov = page.locator('#avisoTrocaSemana');
  check('clicar pra outra semana abre o aviso', await ov.isVisible());
  check('e NÃO troca a semana enquanto não confirmar',
    (await page.evaluate(() => state.semIdx)) === ATUAL);
  const txtAviso = (await page.evaluate(() => document.getElementById('avisoTrocaSemana').textContent)).replace(/\s+/g, ' ');
  check('o aviso diz que o que for lançado vai pra outra semana',
    /vai para/.test(txtAviso) && /bruto do dia/.test(txtAviso), txtAviso);
  check('e o botão em destaque é o de FICAR na semana atual', await page.evaluate(() => {
    const c = document.querySelector('.sem-cancel'), o = document.querySelector('.sem-ok');
    const corC = getComputedStyle(c).backgroundColor, corO = getComputedStyle(o).backgroundColor;
    return /Ficar na semana atual/.test(c.textContent) && corC !== corO;
  }));

  // ══ 3. Cancelar mantém tudo no lugar ═════════════════════════════════════════════
  await page.evaluate(() => cancelarTrocaSemana());
  await page.waitForTimeout(200);
  check('cancelar mantém a semana atual', (await page.evaluate(() => state.semIdx)) === ATUAL);
  check('e o seletor volta a mostrar a semana em que a tela está',
    (await page.evaluate(() => { const s = document.querySelector('.wnav select'); return s ? +s.value : null; })) === ATUAL);
  check('o aviso some', await ov.isHidden());

  // ══ 4. Confirmar troca de verdade ════════════════════════════════════════════════
  await page.evaluate(a => setSemIdx(a - 3), ATUAL);
  await page.waitForTimeout(150);
  await page.evaluate(() => confirmarTrocaSemana());
  await page.waitForTimeout(250);
  check('confirmar troca a semana', (await page.evaluate(() => state.semIdx)) === ATUAL - 3);

  // ══ 5. Já fora da semana atual, não pergunta de novo ═════════════════════════════
  await page.evaluate(a => setSemIdx(a - 4), ATUAL);
  await page.waitForTimeout(200);
  check('navegando entre semanas antigas não pergunta de novo',
    (await page.evaluate(() => state.semIdx)) === ATUAL - 4 && await ov.isHidden());

  // ══ 6. O alerta fica à vista em TODAS as abas ════════════════════════════════════
  const faixaEm = async (aba) => {
    await page.evaluate(t => { state.tab = t; render(); }, aba);
    await page.waitForTimeout(150);
    const el = page.locator('#avisoSemanaFora');
    return (await el.count()) === 1 && await el.isVisible();
  };
  for (const aba of ['semana', 'funcs', 'pool', 'resumo']) {
    check(`a faixa de "não é a semana atual" aparece na aba ${aba}`, await faixaEm(aba));
  }
  const txtFaixa = (await page.evaluate(() => document.getElementById('avisoSemanaFora').textContent)).replace(/\s+/g, ' ');
  check('a faixa diz qual semana está vendo e qual é a atual',
    /NÃO está na semana atual/.test(txtFaixa) && /a atual é/.test(txtFaixa), txtFaixa);

  // ══ 7. Voltar pra atual: um toque, sem perguntar ═════════════════════════════════
  await page.evaluate(() => voltarSemanaAtual());
  await page.waitForTimeout(250);
  check('"Voltar pra atual" volta sem perguntar nada',
    (await page.evaluate(() => state.semIdx)) === ATUAL && await ov.isHidden());
  check('e a faixa some quando está na semana certa',
    (await page.locator('#avisoSemanaFora').count()) === 0);

  // ══ 8. A semana não fica mais gravada ════════════════════════════════════════════
  await page.evaluate(a => setSemIdx(a - 5, true), ATUAL);
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForFunction(() => { try { return typeof calcSemIdxAtual === 'function' && typeof state === 'object'; }
    catch (e) { return false; } }, { timeout: 30000 });
  await page.waitForTimeout(400);
  check('recarregando depois de olhar outra semana, abre na vigente de novo',
    (await page.evaluate(() => state.semIdx)) === ATUAL,
    await page.evaluate(() => state.semIdx));

  // ══ 9. Cabe no celular ═══════════════════════════════════════════════════════════
  await page.evaluate(a => { setSemIdx(a - 2, true); }, ATUAL);
  await page.waitForTimeout(200);
  check('a faixa cabe nos 390px', await page.evaluate(() => {
    const el = document.getElementById('avisoSemanaFora');
    const r = el.getBoundingClientRect();
    return r.left >= -1 && r.right <= 391;
  }));
  await page.evaluate(a => setSemIdx(a), ATUAL);
  await page.evaluate(a => setSemIdx(a - 1), ATUAL);
  await page.waitForTimeout(200);
  check('a folha de confirmação cabe nos 390px', await page.evaluate(() => {
    const el = document.querySelector('.sem-sheet');
    const r = el.getBoundingClientRect();
    const estoura = [...el.querySelectorAll('*')].some(e => e.getBoundingClientRect().right > 391);
    return r.left >= -1 && r.right <= 391 && !estoura;
  }));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
