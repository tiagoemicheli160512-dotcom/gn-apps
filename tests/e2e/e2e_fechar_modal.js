// Bug relatado no PR #975 e que o usuário pediu pra corrigir: o × e o Cancelar dos modais
// "Nova apresentação" e "Importar agenda" (aba Trios) chamavam fecharModal(event) passando o
// evento do próprio botão. Como fecharModal só fechava quando e.target era o FUNDO do modal,
// o clique no × não fechava nada.
//
// O teste também garante o oposto, que é o motivo da checagem existir: clicar DENTRO da caixa
// não pode fechar o modal no meio do preenchimento (o clique borbulha até o modal-bg).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 950 } });
  await ctx.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + PEDIDOS);
    try {
      await page.waitForFunction(() => {
        try { return typeof fecharModal === 'function' && typeof _triosNovoModal === 'function'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: app Pedidos não carregou'); falhou++; break; } }
  }

  const aberto = () => page.evaluate(() => document.getElementById('modal-bg').classList.contains('ativo'));

  // ── Nova apresentação: o × ──────────────────────────────────────────────────────────
  await page.evaluate(() => { S.lojas = [{ slug_pedido: 'bangu', nome_display: 'Bangu' }]; _triosNovoModal(); });
  check('o modal Nova apresentação abre', await aberto());
  await page.click('#modal-box .modal-close');
  check('clicar no × fecha (antes não fechava nada)', !(await aberto()));

  // ── Nova apresentação: o Cancelar ───────────────────────────────────────────────────
  await page.evaluate(() => _triosNovoModal());
  const temCancelar = await page.evaluate(() =>
    [...document.querySelectorAll('#modal-box button')].some(b => b.textContent.trim() === 'Cancelar'));
  check('o modal tem botão Cancelar', temCancelar);
  await page.evaluate(() => {
    [...document.querySelectorAll('#modal-box button')].find(b => b.textContent.trim() === 'Cancelar').click();
  });
  check('clicar em Cancelar fecha', !(await aberto()));

  // ── Importar agenda: o × ────────────────────────────────────────────────────────────
  await page.evaluate(() => _triosImportarModal());
  check('o modal Importar agenda abre', await aberto());
  await page.click('#modal-box .modal-close');
  check('o × do Importar agenda também fecha', !(await aberto()));

  // ── O que a checagem protege: clique dentro da caixa NÃO fecha ──────────────────────
  await page.evaluate(() => _triosNovoModal());
  await page.click('#modal-box .form-label');     // clique num rótulo, dentro da caixa
  check('clique dentro da caixa continua NÃO fechando (borbulha até o fundo)', await aberto());
  const input = await page.$('#modal-box input');
  if (input) { await input.click(); }
  check('clique num campo também não fecha', await aberto());

  // ── E o clique no fundo continua fechando ───────────────────────────────────────────
  await page.evaluate(() => {
    const bg = document.getElementById('modal-bg');
    bg.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // target = o próprio fundo
  });
  check('clique no fundo continua fechando', !(await aberto()));

  // ── Chamada por código continua funcionando (é o que o Por loja usa) ────────────────
  const porCodigo = await page.evaluate(() => {
    _triosNovoModal();
    let erro = null;
    try { fecharModal(); } catch (e) { erro = String(e); }
    return { erro, aberto: document.getElementById('modal-bg').classList.contains('ativo') };
  });
  check('fecharModal() sem argumento fecha e não lança', porCodigo.erro === null && porCodigo.aberto === false);

  // ── E a forma antiga usada em outros pontos do arquivo não quebrou ──────────────────
  const formaAntiga = await page.evaluate(() => {
    _triosNovoModal();
    let erro = null;
    try { fecharModal({ target: document.getElementById('modal-bg') }); } catch (e) { erro = String(e); }
    return { erro, aberto: document.getElementById('modal-bg').classList.contains('ativo') };
  });
  check('a chamada antiga fecharModal({target: modal-bg}) segue funcionando',
    formaAntiga.erro === null && formaAntiga.aberto === false);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
