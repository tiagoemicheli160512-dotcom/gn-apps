// "No app de Bangu, quando o estoquista Neto entra, não aparece a aba do chopp pra ser
//  contado primeiro, que é o padrão. Só ele relatou que o app entra direto e não pede a
//  contagem." (23/11/2026)
//
// Medido: segunda 23/11, Caxias, Norte, Nova América e Nova Iguaçu contaram às 8h; o Neto
// entrou às 8h32 (login novo no app Lojas) e passou direto. Causa: as travas da loja
// (barris, nota fiscal, urgência) só rodavam no fim do carregamento dos dados (sbPull). Quem
// abre o app SEM sessão faz o login depois disso — na hora da checagem não havia usuário
// (barris: "não é cargo que conta") e a loja era a padrão. Corrida: logar antes dos dados
// chegarem era cobrado; logar depois, não.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const cenario = async (confirmou) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-23T08:32:00');
    const pedidos = [];
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
    await ctx.route('**/rest/v1/**', r => {
      const req = r.request(), u = decodeURIComponent(req.url());
      if (/rpc\/verificar_login/.test(u))
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 17, nome: 'Neto', cargo: 'estoquista', loja: 'BANGU', permissoes: { lojas: true, lojas_abas: ['pedido', 'entrega'] } }]) });
      if (/gn_barris_semanal_confirmacao/.test(u)) {
        pedidos.push(u);
        return r.fulfill({ status: 200, contentType: 'application/json', body: confirmou && /loja_slug=eq\.bangu/.test(u) ? JSON.stringify([{ loja_slug: 'bangu' }]) : '[]' });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
    await page.goto('file://' + LOJAS);
    await page.waitForFunction(() => { try { return typeof confirmarLogin === 'function' && !!document.getElementById('loginOverlay'); } catch (e) { return false; } }, null, { timeout: 25000 });
    // Os dados do carregamento chegam ANTES do login (o caso do Neto).
    await page.waitForTimeout(3000);
    const antes = await page.evaluate(() => !!document.getElementById('barris-semanal-trava-overlay'));
    await page.fill('#loginNome', 'Neto');
    await page.fill('#loginSenha', '1234');
    await page.evaluate(() => confirmarLogin());
    await page.waitForTimeout(2500);
    const depois = await page.evaluate(() => { const o = document.getElementById('barris-semanal-trava-overlay'); return o ? o.textContent.replace(/\s+/g, ' ').slice(0, 200) : null; });
    const logado = await page.evaluate(() => usuarioAtual && usuarioAtual.nome);
    await ctx.close();
    return { antes, depois, logado, pedidos, erros };
  };

  const r = await cenario(false);
  check('o login do Neto (estoquista de Bangu) funcionou', r.logado === 'Neto', r.logado);
  check('antes do login não há trava (ainda não se sabe quem é)', r.antes === false);
  check('logou DEPOIS de os dados chegarem e Bangu não contou nesta segunda: a contagem de barris aparece', !!r.depois && /Contagem semanal de barris/.test(r.depois), r.depois);
  check('a checagem é da loja do Neto (bangu), não da loja padrão', r.pedidos.some(u => /loja_slug=eq\.bangu&semana_inicio=eq\.2026-11-23/.test(u)), r.pedidos);
  const r2 = await cenario(true);
  check('se Bangu já contou nesta segunda, o login do Neto entra direto', r2.depois === null, r2.depois);
  check('nenhum erro de JavaScript', r.erros.length === 0 && r2.erros.length === 0, r.erros.concat(r2.erros));
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
