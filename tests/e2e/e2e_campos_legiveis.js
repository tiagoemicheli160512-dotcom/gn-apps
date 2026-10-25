// "No app check-list, na parte das datas, ficou uma cor escura, que quase não dá pra ver."
//
// O fundo do campo era token (--s2) e a cor do texto estava presa num quase-preto fixo.
// No tema escuro: preto sobre preto.
//
// Por que os testes de tema não pegaram: o medidor de contraste olha NÓS DE TEXTO, e o
// valor de um input[type=date] é desenhado pelo navegador no shadow DOM — não existe nó
// de texto nenhum ali. Este teste mede o par cor/fundo do PRÓPRIO campo, que é o que o
// navegador usa pra desenhar o valor.
//
// E não dá pra medir isso contra o arquivo do origin/main como "regressão": o defeito já
// está no ar. Aqui o padrão é ABSOLUTO — 4,5:1, que é o mínimo pra texto pequeno.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + extra); };

const MEDE_CAMPOS = () => {
  const num = c => (String(c || '').match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const razao = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); };
  const fundoDe = el => { let n = el;
    while (n && n !== document.documentElement) {
      const v = num(getComputedStyle(n).backgroundColor);
      if (v.length >= 3 && (v.length < 4 || v[3] > .5)) return v.slice(0, 3);
      n = n.parentElement;
    }
    const v = num(getComputedStyle(document.body).backgroundColor);
    return v.length >= 3 ? v.slice(0, 3) : [255, 255, 255]; };
  const out = [];
  for (const el of document.querySelectorAll('input, textarea, select')) {
    const t = (el.type || '').toLowerCase();
    if (['checkbox', 'radio', 'range', 'file', 'hidden', 'color', 'button', 'submit'].includes(t)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let cor = num(cs.color); if (cor.length < 3) continue;
    const f = fundoDe(el);
    if (cor.length >= 4 && cor[3] < 1) { const a = cor[3]; cor = [0,1,2].map(i => Math.round(cor[i]*a + f[i]*(1-a))); }
    // opacity do próprio campo (readonly usa isso) entra na conta: é o que o olho vê.
    const op = parseFloat(cs.opacity);
    if (op < 1) cor = [0,1,2].map(i => Math.round(cor[i]*op + f[i]*(1-op)));
    out.push({ id: el.id || ('[' + t + ']'), tipo: t, r: +razao(cor.slice(0,3), f).toFixed(2),
               cor: cs.color, fundo: 'rgb(' + f.join(',') + ')', opacidade: cs.opacity });
  }
  return out;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + ARQ);
    try { await page.waitForFunction(() => { try {
      return typeof COMISSOES_STATUS === 'object' && typeof gnTema === 'object' && gnTema !== null;
    } catch (e) { return false; } }, { timeout: 30000 }); break; }
    catch (e) { if (t >= 4) throw new Error('o Check-list não carregou'); }
  }
  await page.waitForTimeout(500);

  const MIN = 4.5;
  for (const tema of ['escuro', 'claro']) {
    await page.evaluate(t => gnTema.aplicar(t), tema);
    await page.waitForTimeout(450);   // deixa a transição assentar
    const campos = await page.evaluate(MEDE_CAMPOS);
    const ruins = campos.filter(c => c.r < MIN);
    const datas = campos.filter(c => c.tipo === 'date' || c.tipo === 'time');
    check(`tema ${tema}: achou os campos de data/hora pra medir (${datas.length})`, datas.length > 0);
    check(`tema ${tema}: o valor digitado é legível em TODOS os ${campos.length} campos (mín. ${MIN}:1)`,
      ruins.length === 0);
    ruins.slice(0, 8).forEach(c => console.log(`      ${c.r}:1  ${c.id} (${c.tipo})  ${c.cor} sobre ${c.fundo}${c.opacidade !== '1' ? ' · opacidade ' + c.opacidade : ''}`));
    const pior = datas.length ? Math.min(...datas.map(c => c.r)) : 0;
    console.log(`      (pior contraste entre data/hora no ${tema}: ${pior}:1)`);
  }

  // O navegador desenha o ícone do calendário e o seletor pelo color-scheme. Preso em
  // "light", o ícone sai preto sobre o campo escuro — e isso nenhuma medição de cor pega,
  // porque o ícone é do navegador.
  await page.evaluate(() => gnTema.aplicar('escuro'));
  await page.waitForTimeout(300);
  check('no escuro, o calendário nativo também é desenhado escuro (color-scheme acompanha)',
    await page.evaluate(() => {
      const el = document.querySelector('input[type=date]');
      return el && getComputedStyle(el).colorScheme.trim() === 'dark';
    }), await page.evaluate(() => { const el = document.querySelector('input[type=date]');
      return el ? getComputedStyle(el).colorScheme : 'sem campo'; }));
  await page.evaluate(() => gnTema.aplicar('claro'));
  await page.waitForTimeout(300);
  check('e no claro volta a ser claro',
    await page.evaluate(() => {
      const el = document.querySelector('input[type=date]');
      return el && getComputedStyle(el).colorScheme.trim() === 'light';
    }));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0);
  reais.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
