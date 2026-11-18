// Check-list › 📊 Gestão (18/11/2026, print do dono no tema escuro): "não dá pra ver o valor
// das vendas do dia, e ao sincronizar com o servidor, se tiver olhando, ele volta lá pra
// cima, como se recarregasse a página."
//
// Cobra: (1) o valor do dia e os cartões de datas especiais usam as cores do tema (não o
// preto/branco fixo que sumia no escuro); (2) a atualização automática não troca a aba por
// "Carregando..." nem mexe na rolagem — o mesmo no livro de Caixa.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = fs.readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

const DIAS = Array.from({ length: 17 }, (_, i) => ({ data_operacao: `2026-11-${String(i + 1).padStart(2, '0')}`, venda_salao: 20000 + i * 100, venda_delivery: 1000, vendas: null }));

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-18T07:35:00');
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  let pedidos = 0;
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url()); const aceita = String(r.request().headers()['accept'] || '');
    if (/checklist_diario/.test(u) && /data_operacao=gte\.2026-11-01/.test(u)) { pedidos++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DIAS) }); }
    if (aceita.includes('pgrst.object')) return r.fulfill({ status: 200, contentType: 'application/vnd.pgrst.object+json', body: 'null' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('gn_session_v1', JSON.stringify({ id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { checklist: true, master: true }, ts: Date.now() }));
  });
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try { return typeof renderGestao === 'function' && typeof switchTab === 'function'; } catch (e) { return false; } }, null, { timeout: 30000 });
  await page.evaluate(async () => {
    document.documentElement.setAttribute('data-tema', 'escuro');
    LOJA = 'Norte Shopping';
    document.querySelectorAll('body *').forEach(e => { if (getComputedStyle(e).position === 'fixed' && !e.closest('#tab-gestao')) e.style.display = 'none'; });
    switchTab('gestao', document.querySelector('[onclick*="switchTab(\'gestao\'"]'));
    _gestaoView = 'mensal'; await renderGestao();
  });
  await page.waitForTimeout(300);

  // (1) Cores no tema escuro
  const cor = await page.evaluate(() => {
    const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    const fundo = lum(getComputedStyle(document.body).backgroundColor);
    const cel = [...document.querySelectorAll("#tab-gestao td div")].find(d => /^R\$\s?\d/.test(d.textContent.trim()));
    const card = [...document.querySelectorAll('#tab-gestao div')].find(d => /^2026$/.test(d.textContent.trim()) && d.parentElement && /Consciência/.test(d.closest('[style*="margin-bottom:6px"]')?.textContent || ''));
    const cardFundo = card ? lum(getComputedStyle(card.parentElement).backgroundColor) : null;
    return { fundo, valor: cel ? lum(getComputedStyle(cel).color) : null, cardFundo };
  });
  check('tema escuro: o valor do dia aparece claro sobre o fundo escuro', cor.valor !== null && cor.fundo < 0.2 && cor.valor > 0.6, cor);
  check('…e o cartão da Consciência Negra deixa de ser branco no escuro', cor.cardFundo !== null && cor.cardFundo < 0.3, cor);

  // (2) Rolagem
  const rol = await page.evaluate(async () => {
    window.scrollTo(0, 900); await new Promise(r => setTimeout(r, 50));
    const antes = window.scrollY; let viuCarregando = false;
    const el = document.getElementById('tab-gestao');
    const mo = new MutationObserver(() => { if (/Carregando dados/.test(el.textContent)) viuCarregando = true; }); mo.observe(el, { childList: true, subtree: true });
    await renderGestao({ silencioso: true });
    mo.disconnect();
    return { antes, depois: window.scrollY, viuCarregando };
  });
  check('atualização automática não mostra "Carregando dados..."', rol.viuCarregando === false, rol);
  check('…e a tela fica onde estava (não volta pro topo)', rol.antes > 500 && Math.abs(rol.depois - rol.antes) <= 1, rol);
  const fonte = fs.readFileSync(CHK, 'utf8');
  check('o relógio de 30 s chama a versão silenciosa (Gestão e Caixa)', /_activeTab==='gestao' && !document\.hidden\) renderGestao\(\{ silencioso: true \}\)/.test(fonte) && /renderLivroCaixa\(\{ silencioso: true \}\)/.test(fonte));
  const manual = await page.evaluate(async () => { let viu = false; const el = document.getElementById('tab-gestao'); const mo = new MutationObserver(() => { if (/Carregando dados/.test(el.textContent)) viu = true; }); mo.observe(el, { childList: true, subtree: true }); await renderGestao(); mo.disconnect(); return viu; });
  check('trocar de mês/visão (manual) continua mostrando o "Carregando"', manual === true);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
