// "É possível os cards das lojas ter o mesmo degradê de cores do card onde tem as
//  informações, todas as lojas, boa tarde e etc."
//
// Mudança de APARÊNCIA nos cards do Painel de Gestão. O que um teste precisa cobrar aqui
// não é o desenho — é o que cor demais estraga: o CONTRASTE dos números dentro do card.
// Cada card carrega meta, dias da semana, funcionários e valor por funcionário em 9px,
// sobre um fundo que agora é colorido. Um texto que some não dá erro nenhum na tela.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const { MEDIDOR } = require('' + CAMINHOS.fix('medidor_contraste.js') + '');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const resultados = {};
  for (const tema of ['claro', 'escuro']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(String(e)));
    await page.goto('file://' + HOME);
    await page.waitForFunction(() => { try { return typeof renderDashboard === 'function'; } catch (e) { return false; } }, { timeout: 20000 });
    await page.evaluate(t => { if (t === 'escuro') document.documentElement.setAttribute('data-tema', 'escuro'); }, tema);

    await page.evaluate(async () => {
      window.gnFetchJson = async (u, h, c, fb) => fb;
      session = { id: 1, nome: 'Nathalia', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
      masterLoja = '';
      showHome(session);
      await new Promise(r => setTimeout(r, 500));
      // Faturamento em todas as lojas, pra todos os cards ficarem "has-data".
      _dashFat = {}; LOJAS_LISTA.forEach((k, i) => { _dashFat[k] = 12000 - i * 800; });
      _dashFuncCount = {}; LOJAS_LISTA.forEach(k => { _dashFuncCount[k] = 35; });
      renderDashboard();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await page.waitForTimeout(300);

    const r = await page.evaluate(({ medidorSrc }) => {
      const cards = [...document.querySelectorAll('.store-card')];
      const cs = cards.map(c => getComputedStyle(c).backgroundImage);
      const corDe = c => (c.style.getPropertyValue('--gi-cor') || c.style.getPropertyValue('--sc-cor') || '').trim();
      // MEDIDOR() varre o documento e devolve a LISTA de textos abaixo de 3:1 — não tem
      // medir(el). A primeira versão deste teste chamou M.medir e passou no vazio; agora
      // a lista é comparada com a do arquivo de produção, que é a pergunta certa pra uma
      // mudança de cor: ela piorou alguma coisa?
      const ruins = eval('(' + medidorSrc + ')')();
      return {
        n: cards.length,
        temGradiente: cs.filter(x => /linear-gradient/.test(x)).length,
        semGradiente: cs.filter(x => !/linear-gradient/.test(x)).length,
        cores: cards.map(corDe),
        amostra: cs[0] || '',
        ruins,
      };
    }, { medidorSrc: MEDIDOR.toString() });

    resultados[tema] = r;
    check(`[${tema}] os cards de loja existem no painel`, r.n >= 10, r.n);
    check(`[${tema}] TODOS usam o degradê, nenhum ficou chapado`,
      r.temGradiente === r.n && r.semGradiente === 0, `${r.temGradiente}/${r.n}`);
    check(`[${tema}] o degradê é o mesmo do hero: 145deg, três paradas`,
      /145deg/.test(r.amostra) && (r.amostra.match(/rgb|color\(/g) || []).length >= 3, r.amostra);
    check(`[${tema}] cada card carrega a cor da SUA loja (identidade, não decoração)`,
      r.cores.every(c => /^#[0-9a-f]{6}$/i.test(c)) && new Set(r.cores).size >= 8,
      r.cores.join(' '));
    // O que a cor pode estragar.
    // (a comparação com produção vem depois, fora do laço)
    check(`[${tema}] nenhum erro de JS`, erros.length === 0, erros.join(' | '));
    await ctx.close();
  }

  // ══ O CONTRASTE PIOROU? ═══════════════════════════════════════════════════════════
  // Comparação direta com o arquivo em produção, no MESMO estado e nos dois temas: um
  // texto que já era fraco antes não é regressão desta mudança; um texto novo na lista é.
  const MAIN = process.env.ARQ_MAIN
    || CAMINHOS.BASE_HOME;
  const medirArquivo = async (arquivo, tema) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const pg = await c.newPage();
    await pg.goto('file://' + arquivo);
    await pg.waitForFunction(() => typeof renderDashboard === 'function', { timeout: 20000 });
    await pg.evaluate(t => { if (t === 'escuro') document.documentElement.setAttribute('data-tema', 'escuro'); }, tema);
    await pg.evaluate(async () => {
      window.gnFetchJson = async (u, h, cc, fb) => fb;
      session = { id: 1, nome: 'Nathalia', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
      masterLoja = ''; showHome(session);
      await new Promise(r => setTimeout(r, 500));
      _dashFat = {}; LOJAS_LISTA.forEach((k, i) => { _dashFat[k] = 12000 - i * 800; });
      _dashFuncCount = {}; LOJAS_LISTA.forEach(k => { _dashFuncCount[k] = 35; });
      renderDashboard();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await pg.waitForTimeout(300);
    const out = await pg.evaluate(src => eval('(' + src + ')')(), MEDIDOR.toString());
    await c.close();
    return out;
  };
  const fs = require('fs');
  if (fs.existsSync(MAIN)) {
    for (const tema of ['claro', 'escuro']) {
      const antes = await medirArquivo(MAIN, tema);
      const depois = resultados[tema].ruins;
      const chave = x => x.txt + '|' + x.cor;
      const setAntes = new Set(antes.map(chave));
      const novos = depois.filter(x => !setAntes.has(chave(x)));
      check(`[${tema}] o degradê não criou nenhum texto com contraste abaixo de 3:1`,
        novos.length === 0, JSON.stringify(novos.slice(0, 5)));
      console.log(`      (fracos em produção: ${antes.length} · agora: ${depois.length})`);
    }
  } else {
    check('comparação de contraste com produção', false, 'arquivo de main não encontrado: ' + MAIN);
  }

  // A cor do card tem que ser a mesma do pontinho e a mesma do hero daquela loja.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const p2 = await ctx2.newPage();
  await p2.goto('file://' + HOME);
  await p2.waitForFunction(() => typeof renderDashboard === 'function', { timeout: 20000 });
  const coerente = await p2.evaluate(async () => {
    window.gnFetchJson = async (u, h, c, fb) => fb;
    session = { id: 1, nome: 'Nathalia', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    masterLoja = ''; showHome(session);
    await new Promise(r => setTimeout(r, 500));
    _dashFat = {}; LOJAS_LISTA.forEach(k => { _dashFat[k] = 9000; });
    renderDashboard();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return [...document.querySelectorAll('.store-card')].map(c => ({
      card: (c.style.getPropertyValue('--gi-cor') || c.style.getPropertyValue('--sc-cor') || '').trim().toLowerCase(),
      dot: (c.querySelector('.sc-dot')?.style.background || '').trim().toLowerCase(),
    }));
  });
  const hexDoRgb = s => {
    const m = s.match(/\d+/g); if (!m) return s;
    return '#' + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('');
  };
  check('a cor do degradê é a MESMA do pontinho da loja',
    coerente.length >= 10 && coerente.every(x => x.card === hexDoRgb(x.dot)),
    JSON.stringify(coerente.slice(0, 3)));
  await ctx2.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
