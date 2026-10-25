// "Tem como colocar o tom degradê de cores igual colocamos nos cards das lojas no painel
//  de gestão, nos cards pra selecionar as lojas e também nos cards pedido, gorjetas e etc,
//  sempre seguindo a cor base — no home o amarelo e nas lojas o da própria loja."
//
// O degradê do card de loja virou uma receita só (--grad-identidade), usada em três lugares.
// Duas coisas podem dar errado e nenhuma aparece lendo o código:
//   1. o card de loja, que ele JÁ gostava, mudar no refactor — aqui é comparado contra o
//      origin/main, pixel do degradê computado;
//   2. a cor comer o contraste do nome ou da legenda — medido contra o pixel REAL atrás do
//      texto, não contra a propriedade (o tom antigo era translúcido, o novo é degradê:
//      nos dois casos o valor da propriedade não é a cor que o olho vê).
const CAMINHOS = require('../_env');
const fs = require('fs');
const { chromium } = require('playwright');
const SB_LIB = fs.readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
const ARQ = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const BASE = process.env.ARQ_BASE || CAMINHOS.BASE_HOME;
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 320)); };

const SESS = { nome: 'T', cargo: 'mestre', loja: null, permissoes: {} };
const LOJAS = [null, 'NORTE SHOPPING', 'BANGU', 'CAMPO GRANDE', 'MAGLIA', 'PEDREIRA'];
const COR = { 'NORTE SHOPPING': '#1a7a4a', BANGU: '#b81a1a', 'CAMPO GRANDE': '#065f46',
              MAGLIA: '#059669', PEDREIRA: '#7c3aed' };

function lum(c) { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); }
function razao(a, b) { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); }
const px = s => (s.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number).map(Math.round);

async function abrir(browser, arq, tema) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.addInitScript(t => { try { localStorage.setItem('gn_tema', t); } catch (e) {} }, tema);
  await page.goto('file://' + arq);
  await page.waitForFunction(() => { try { return typeof renderModules === 'function'; } catch (e) { return false; } }, { timeout: 30000 });
  await page.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('home-screen').style.display = 'block';
  });
  return { ctx, page, erros };
}

// O degradê do card de loja, computado — é o que o navegador vai pintar.
const LER_STORE = cor => {
  const d = document.createElement('div');
  d.className = 'store-card';
  d.style.setProperty('--gi-cor', cor);
  d.style.setProperty('--sc-cor', cor);   // o nome antigo, pra ler o main com a mesma sonda
  d.style.cssText += ';width:150px;height:90px';
  document.body.appendChild(d);
  const bg = getComputedStyle(d).backgroundImage;
  d.remove();
  return bg;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  for (const tema of ['escuro', 'claro']) {
    // ── 1. O card de loja não mudou ────────────────────────────────────────────────
    const b = await abrir(browser, BASE, tema);
    const antes = {};
    for (const [k, c] of Object.entries(COR)) antes[k] = await b.page.evaluate(LER_STORE, c);
    await b.ctx.close();

    const v = await abrir(browser, ARQ, tema);
    const depois = {};
    for (const [k, c] of Object.entries(COR)) depois[k] = await v.page.evaluate(LER_STORE, c);
    const mudou = Object.keys(COR).filter(k => antes[k] !== depois[k]);
    check(`[${tema}] o card de loja saiu igualzinho ao que já estava no ar`,
      mudou.length === 0, mudou.map(k => `${k}:\n  main ${antes[k]}\n  novo ${depois[k]}`).join('\n'));
    check(`[${tema}] e o card de loja é mesmo um degradê (a sonda não leu vazio)`,
      /linear-gradient/.test(depois.BANGU), depois.BANGU);

    // ── 2. Cards de módulo: a cor certa em cada contexto ───────────────────────────
    for (const loja of LOJAS) {
      const r = await v.page.evaluate(({ sess, loja }) => {
        masterLoja = loja;
        renderModules(sess, true);
        const linha = document.querySelector('.mod-row');
        const cs = getComputedStyle(linha);
        return { bg: cs.backgroundImage, cor: cs.getPropertyValue('--gi-cor').trim(),
                 ang: cs.getPropertyValue('--gi-ang').trim(), n: document.querySelectorAll('.mod-row').length };
      }, { sess: SESS, loja });
      const esperada = loja ? COR[loja] : '#FACC15';
      check(`[${tema}] módulo com ${loja || 'Todas as lojas'}: degradê na cor ${esperada}`,
        /linear-gradient/.test(r.bg) && r.cor.toLowerCase() === esperada.toLowerCase(),
        JSON.stringify(r).slice(0, 220));
    }
    const semCor = await v.page.evaluate(() => {
      masterLoja = null; renderModules({ nome: 'T', cargo: 'mestre', loja: null, permissoes: {} }, true);
      return [...document.querySelectorAll('.mod-row')].every(e => /linear-gradient/.test(getComputedStyle(e).backgroundImage));
    });
    check(`[${tema}] todos os cards de módulo receberam o degradê, não só o primeiro`, semCor);

    // ── 3. Seletor de loja: cada loja com a cara dela ──────────────────────────────
    const picker = await v.page.evaluate(() => {
      _lojasRestritas = false; masterLoja = null; renderLojaPickerGrid();
      const bs = [...document.querySelectorAll('#picker-grid .pick-btn')];
      return bs.map(b2 => ({ nome: (b2.querySelector('.pick-name') || {}).textContent,
                             cor: getComputedStyle(b2).getPropertyValue('--gi-cor').trim(),
                             grad: /linear-gradient/.test(getComputedStyle(b2).backgroundImage),
                             ponto: getComputedStyle(b2.querySelector('.pick-dot')).backgroundColor }));
    });
    check(`[${tema}] o seletor tem as 12 lojas mais "Todas as lojas"`, picker.length >= 13, picker.length + ' botões');
    check(`[${tema}] todo botão do seletor é um degradê`, picker.every(x => x.grad),
      JSON.stringify(picker.filter(x => !x.grad).slice(0, 3)));
    check(`[${tema}] e a cor do degradê bate com o pontinho de cada loja`,
      picker.every(x => px(x.ponto).join(',') === px(
        x.cor.startsWith('#') ? `rgb(${parseInt(x.cor.slice(1, 3), 16)},${parseInt(x.cor.slice(3, 5), 16)},${parseInt(x.cor.slice(5, 7), 16)})` : x.cor).join(',')),
      JSON.stringify(picker.slice(0, 3)));
    const todas = picker[picker.length - 1];
    check(`[${tema}] "Todas as lojas" usa o amarelo da identidade`,
      /Todas as lojas/.test(todas.nome) && todas.cor.toLowerCase() === '#facc15', JSON.stringify(todas));

    // ── 4. A cor não come o texto — medido no pixel real atrás dele ────────────────
    for (const loja of LOJAS) {
      const d = await v.page.evaluate(({ sess, loja }) => {
        masterLoja = loja; renderModules(sess, true);
        const linha = document.querySelector('.mod-row');
        const r = linha.getBoundingClientRect();
        const alvo = sel => { const el = linha.querySelector(sel), q = el.getBoundingClientRect();
          return { cor: getComputedStyle(el).color, x: Math.round(q.left - r.left + 6), y: Math.round(q.top - r.top + q.height / 2) }; };
        const out = { nome: alvo('.mod-name'), sub: alvo('.mod-sub') };
        [...linha.querySelectorAll('.mod-name,.mod-sub')].forEach(e => { e.style.visibility = 'hidden'; });
        return out;
      }, { sess: SESS, loja });
      const buf = await v.page.locator('.mod-row').first().screenshot();
      const fundo = await v.page.evaluate(async ({ b64, nome, sub }) => {
        const img = new Image();
        await new Promise(res => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        cv.getContext('2d').drawImage(img, 0, 0);
        const ler = p2 => [...cv.getContext('2d').getImageData(Math.min(p2.x, img.width - 1), Math.min(p2.y, img.height - 1), 1, 1).data].slice(0, 3);
        return { nome: ler(nome), sub: ler(sub) };
      }, { b64: buf.toString('base64'), nome: d.nome, sub: d.sub });
      const rn = razao(px(d.nome.cor), fundo.nome), rs = razao(px(d.sub.cor), fundo.sub);
      check(`[${tema}] ${loja || 'Todas as lojas'}: o NOME do app se lê sobre a cor (≥4,5:1)`,
        rn >= 4.5, `${rn.toFixed(2)}:1 sobre rgb(${fundo.nome})`);
      // A legenda no tema claro já estava abaixo de 4,5:1 antes desta mudança (3,63–4,26
      // no origin/main). O que se cobra aqui é não PIORAR: no escuro o mínimo absoluto,
      // no claro o piso do que já estava no ar.
      const piso = tema === 'escuro' ? 4.5 : 3.6;
      check(`[${tema}] ${loja || 'Todas as lojas'}: a legenda não piorou (≥${piso}:1)`,
        rs >= piso, `${rs.toFixed(2)}:1 sobre rgb(${fundo.sub})`);
    }

    check(`[${tema}] nenhum erro de JS`, v.erros.length === 0, v.erros.join(' | '));
    await v.ctx.close();
  }

  await browser.close();
  console.log('\n' + ARQ);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
