// Redesenho que chega sozinho, depois de um envio/carga em segundo plano (28/11/2026).
// Continuação do e2e_redesenho_preserva: lá ficou protegida a recarga periódica; aqui, o
// redesenho que vem no FIM de um envio — o mais frequente, porque acontece ~1-2 s depois de
// QUALQUER alteração. No histórico de Gorjetas ele aparece como gravações a cada 2-3 s com o
// valor pela metade (Bangu S47: "5" 16 vezes, "8" 20 vezes antes do 800).
//  1. Gorjetas: fim do envio pra nuvem redesenhava e gravava "15" em vez de 15000.
//  2. Lojas: fila de entregas subindo / divergências / catálogo chegando redesenhava o
//     formulário (render()) por cima de quem digitava.
//  3. Check-list › Utensílios: a lista oficial chegando depois de abrir a aba redesenhava a
//     contagem já começada.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const COM = process.env.ARQ_COM || CAMINHOS.pub('gn-comissoes.html');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = fs.readFileSync('' + CAMINHOS.fix('supabase.min.js') + '', 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };
const espera = ms => new Promise(z => setTimeout(z, ms));
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  // ── 1. Gorjetas › Pool: fim do envio no meio da correção ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, timezoneId: 'America/Sao_Paulo' });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-28T10:00:00-03:00');
    let remoto = null, patches = 0;
    // Rede de celular: cada ida ao servidor leva 700 ms — o envio termina no meio da digitação.
    await ctx.route('**/rest/v1/**', async r => { const q = r.request(); await espera(700);
      if (/gn_comissoes\?/.test(q.url()) && q.method() === 'PATCH') { patches++; remoto = JSON.parse(q.postData()).all_data; return r.fulfill({ status: 204, body: '' }); }
      if (q.method() !== 'GET') return r.fulfill({ status: 204, body: '' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/gn_comissoes\?/.test(q.url()) && remoto ? [{ all_data: remoto }] : []) }); });
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
    const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
    for (let t = 1; ; t++) { await page.goto('file://' + COM); try { await page.waitForFunction(() => { try { return typeof renderPool === 'function' && typeof _syncNow === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
    remoto = await page.evaluate(() => {
      _logAuditoriaCom = () => {};
      LOJA = 'LOJA TESTE'; LOJA_NOME = 'Loja Teste'; usuarioAtual = 'Ana'; abasPermitidas = null;
      const i = calcSemIdxAtual(); const f = { id: 0, nome: 'ANA', tipo: 'CLT / MENSALISTA', dias: Array(7).fill('PRESENTE') };
      state.allData = { [String(i)]: { brutos: [100, 100, 100, 100, 100, 100, 100], funcs: [f], dist: 'SIM', vDist: 0, semIdx: i } };
      state.semIdx = i; state.tab = 'pool';
      ['seletor-loja', 'login'].forEach(id => document.getElementById(id).style.display = 'none');
      document.getElementById('app').style.display = 'flex'; render();
      return JSON.parse(JSON.stringify(state.allData));
    });
    // Digita, sai (dispara o envio), volta logo pra corrigir — devagar, como no celular.
    await page.click('.pool-card input.pi'); await page.keyboard.type('150'); await page.keyboard.press('Tab');
    await page.click('.pool-card input.pi'); await page.keyboard.type('15', { delay: 150 });
    await page.waitForTimeout(2500);
    const g = await page.evaluate(() => { const i = document.querySelector('.pool-card input.pi'); return { v: i && i.value, foco: document.activeElement === i, vDist: getWD(state.semIdx).vDist }; });
    check('Gorjetas: o envio terminou no meio da correção (houve PATCH)', patches >= 1, patches);
    check('Gorjetas: o fim do envio não tira o "Valor a distribuir" de quem está digitando', g.v === '15' && g.foco, g);
    check('…e não grava o valor pela metade (continua o 150 de antes, não 15)', g.vDist === 150, g);
    await page.keyboard.type('000'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
    const final = await page.evaluate(() => getWD(state.semIdx).vDist);
    check('…ao sair do campo grava o valor completo (15000)', final === 15000, final);
    await page.waitForTimeout(2500);
    const tela = await page.evaluate(() => ({ v: document.querySelector('.pool-card input.pi').value, vDist: getWD(state.semIdx).vDist }));
    check('…e depois do envio a tela mostra o valor novo (o redesenho adiado acontece)', tela.v === '15000' && tela.vDist === 15000, tela);
    check('nenhum erro de JavaScript (Gorjetas)', erros.length === 0, erros);
    await ctx.close();
  }
  // ── 2. Lojas: fila de entregas subindo por cima do formulário ──
  {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-28T10:00:00');
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
    const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + LOJAS);
      try { await page.waitForFunction(() => { try { return typeof goTab === 'function' && typeof _epFilaPendente !== 'undefined'; } catch (e) { return false; } }, { timeout: 20000 }); break; }
      catch (e) { if (t >= 4) throw e; }
    }
    const prep = () => page.evaluate(() => {
      loja = 'PEDREIRA'; usuarioAtual = { nome: 'Luiz', cargo: 'estoquista' }; abasPermitidas = null;
      carregarEntregas = async () => {};
      const c = document.getElementById('content');
      c.insertAdjacentHTML('beforeend', '<input id="qtd-teste" type="text" inputmode="decimal">');
      document.getElementById('qtd-teste').focus();
    });
    await prep(); await page.keyboard.type('12');
    // Uma confirmação na fila, enviada com sucesso agora (rede voltou / 2ª confirmação).
    const env = await page.evaluate(async () => {
      let n = 0; sbRequest = async (rota, o) => { n++; return /gn_provisoes/.test(rota) ? [{ id: 'P1' }] : []; };
      _lancarCarneEntregaNoChecklist = () => {}; _epFilaSalvar = () => {};
      _epFilaPendente = { PEDREIRA: [{ id: 'P1', status: 'RECEBIDO_OK', qtdRec: 5, valRec: 50, diff: 0, validado_por: 'Luiz', prov: { id: 'P1' } }] };
      await _epProcessarFila(); await new Promise(z => setTimeout(z, 50));
      return { n, resta: (_epFilaPendente.PEDREIRA || []).length };
    });
    check('Lojas: a confirmação da fila foi enviada (claim + recebimento)', env.n >= 2 && env.resta === 0, env);
    const l = await page.evaluate(() => { const i = document.getElementById('qtd-teste'); return { existe: !!i, v: i && i.value, foco: document.activeElement === i }; });
    check('Lojas: a fila de entregas subindo não apaga a quantidade sendo digitada', l.existe && l.v === '12' && l.foco, l);
    await page.evaluate(() => (document.getElementById('qtd-teste') || {blur(){}}).blur()); await page.waitForTimeout(100);
    check('…e a tela é refeita quando a pessoa sai do campo', await page.evaluate(() => !document.getElementById('qtd-teste')));
    check('nenhum erro de JavaScript (Lojas)', erros.length === 0, erros);
    await ctx.close();
  }
  // ── 3. Check-list › Utensílios: lista oficial chegando depois de abrir a aba ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
    await ctx.route('**/rest/v1/**', r => {
      const req = r.request(), url = req.url(); const aceita = String((req.headers() || {})['accept'] || '');
      if (req.method() === 'GET' && /gn_lojas/.test(url)) {
        const linha = { all_data: { utensilios_saldo: {} } };
        return r.fulfill({ status: 200, contentType: aceita.includes('pgrst.object') ? 'application/vnd.pgrst.object+json' : 'application/json', body: JSON.stringify(aceita.includes('pgrst.object') ? linha : [linha]) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e)));
    await page.addInitScript(() => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('gn_session_v1', JSON.stringify({ id: 7, nome: 'Bangu Loja', cargo: 'gerente', loja: 'BANGU', permissoes: { checklist: true }, ts: Date.now() }));
      localStorage.setItem('gn_nav_loja', JSON.stringify({ loja: 'BANGU', ts: Date.now() }));
    });
    await page.goto('file://' + CHK);
    await page.waitForFunction(() => { try { return typeof renderUtensilios === 'function' && typeof switchTab === 'function'; } catch (e) { return false; } }, { timeout: 30000 });
    await page.evaluate(async () => {
      LOJA = 'Bangu'; usuarioLogado = { nome: 'Bangu Loja', cargo: 'gerente' };
      switchTab('utensilios', document.getElementById('tab-btn-utensilios'));
      await new Promise(z => setTimeout(z, 300));
      const l = document.getElementById('utens-lista');
      l.insertAdjacentHTML('beforeend', '<input id="cont-teste" type="number">');
      document.getElementById('cont-teste').focus();
    });
    await page.keyboard.type('7');
    await page.evaluate(() => carregarManutOficial()); await page.waitForTimeout(200);
    const u = await page.evaluate(() => { const i = document.getElementById('cont-teste'); return { existe: !!i, v: i && i.value, foco: document.activeElement === i }; });
    check('Check-list: a lista oficial chegando não apaga a contagem de utensílio sendo digitada', u.existe && u.v === '7' && u.foco, u);
    await page.evaluate(() => (document.getElementById('cont-teste') || {blur(){}}).blur()); await page.waitForTimeout(100);
    check('…e a lista é refeita quando a pessoa sai do campo', await page.evaluate(() => !document.getElementById('cont-teste')));
    check('nenhum erro de JavaScript (Check-list)', erros.length === 0, erros);
    await ctx.close();
  }
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
