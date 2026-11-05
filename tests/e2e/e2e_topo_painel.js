// O topo do Painel repaginado: cartão arredondado com a cor da loja, fachada
// desenhada, nome maior e os três números como cartões. Mudança de APARÊNCIA — então
// o que este teste cobra é que nada de conteúdo ou comportamento tenha ido junto:
//
//   - todos os pedaços continuam na tela (nome, trocar loja, plantão, loja ativa,
//     data, saudação, números, acessos);
//   - a cor continua sendo a da loja (identidade: Bangu vermelha, Maglia verde);
//   - as linhas da gerência cabem em UMA linha cada (a primeira tentativa, com o
//     desenho flutuando no canto, fazia cada uma quebrar em duas);
//   - nada passa da largura da tela, em 390, 360 e 320px;
//   - "Trocar loja" continua abrindo o seletor.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof showHome === 'function'; } catch (e) { return false; } }, { timeout: 20000 });

  const montar = (comLoja) => page.evaluate(async (comLoja) => {
    window.gnFetchJson = async (u, h, c, fb) => fb;
    session = { id: 1, nome: 'Tiago Silva', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    masterLoja = comLoja ? LOJAS_LISTA[0] : '';
    showHome(session);
    await new Promise(r => setTimeout(r, 400));
    const pl = document.getElementById('hero-plantao');
    pl.innerHTML = ['Gerente: ANTÔNIO ALVES · 08:00–17:00', 'Sub-Gerente: A.CAROLINA BRAGA · 12:00–22:00']
      .map(t => `<div style="font-size:11.5px;color:rgba(0,0,0,.6);margin-top:3px">${t}</div>`).join('');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return masterLoja;
  }, comLoja);

  const loja = await montar(true);
  const r = await page.evaluate(() => {
    const txt = (id) => (document.getElementById(id)?.textContent || '').trim();
    const hero = document.getElementById('hero');
    const linhas = [...document.querySelectorAll('#hero-plantao > div')];
    const umaLinha = linhas.every(l => l.getBoundingClientRect().height < 22);
    const svg = document.querySelector('.hero-ilustra');
    const nome = document.getElementById('hero-loja-name').getBoundingClientRect();
    const botao = document.getElementById('hero-sel-btn').getBoundingClientRect();
    return {
      nomeLoja: txt('hero-loja-name'), temBotao: !!document.getElementById('hero-sel-btn'),
      plantaoLinhas: linhas.length, umaLinha,
      lojaAtiva: txt('hero-loja-chip'), data: txt('hero-date'),
      saudacao: txt('hero-greeting'), sub: txt('hero-sub'),
      temIlustracao: !!svg,
      corDaIlustracao: svg ? getComputedStyle(svg).color : '',
      corDoTema: getComputedStyle(document.documentElement).getPropertyValue('--cor').trim(),
      arredondado: parseInt(getComputedStyle(hero).borderTopLeftRadius) >= 16,
      // nome e botão na MESMA linha (centro vertical próximo)
      botaoAoLado: Math.abs((nome.top + nome.height / 2) - (botao.top + botao.height / 2)) < 16,
    };
  });

  check('o nome da loja continua lá', /BANGU|Bangu/i.test(r.nomeLoja));
  check('"Trocar loja" continua lá, ao lado do nome', r.temBotao && r.botaoAoLado);
  check('o plantão continua lá', r.plantaoLinhas === 2);
  check('e cada pessoa cabe em uma linha só', r.umaLinha);
  check('o selo LOJA ATIVA continua lá', /LOJA ATIVA/.test(r.lojaAtiva));
  check('a data continua lá', /de .* de 20\d\d/.test(r.data));
  check('a saudação continua lá', /(Bom dia|Boa tarde|Boa noite), Tiago!/.test(r.saudacao));
  check('a linha de contexto continua lá', r.sub.length > 0);
  check('o topo virou cartão arredondado', r.arredondado);
  check('tem a fachada desenhada', r.temIlustracao);
  check('e ela usa a cor da loja (identidade, não enfeite)',
    r.corDaIlustracao.replace(/\s/g, '') === _hexParaRgb(r.corDoTema));

  // Larguras de celular: nada pode vazar pro lado.
  for (const w of [390, 360, 320]) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.waitForTimeout(150);
    const vaza = await page.evaluate(w => ({
      doc: document.documentElement.scrollWidth,
      hero: Math.ceil(document.getElementById('hero').getBoundingClientRect().right),
      tela: w,
    }), w);
    check(`a ${w}px o topo não passa da tela`, vaza.hero <= w);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // "Todas as lojas" — a outra cara do mesmo topo.
  await montar(false);
  const t = await page.evaluate(() => ({
    nome: (document.getElementById('hero-loja-name').textContent || '').trim(),
    semSelo: getComputedStyle(document.getElementById('hero-loja-chip')).display === 'none',
    temIlustracao: !!document.querySelector('.hero-ilustra'),
  }));
  check('em "Todas as lojas" o título muda', /Todas as lojas|Mestre/i.test(t.nome));
  check('e o selo LOJA ATIVA some (não há loja escolhida)', t.semSelo);
  check('a fachada continua desenhada', t.temIlustracao);

  // O seletor de loja continua abrindo.
  const abriu = await page.evaluate(() => {
    openLojaPicker();
    // Pelo id: a classe .picker-overlay é usada por vários (senha, visita pendente),
    // e o querySelector pegava o primeiro deles, que está fechado.
    const ov = document.getElementById('picker-overlay');
    return !!ov && getComputedStyle(ov).display !== 'none';
  });
  check('"Trocar loja" ainda abre o seletor', abriu);

  check('nenhum erro de JS', erros.length === 0);
  if (erros.length) erros.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();

function _hexParaRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}
