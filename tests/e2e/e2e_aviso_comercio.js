// Card do Dia do Comércio (segunda, 19/10) no Home, pra reforçar a escala.
//
// O pedido tinha uma parte que é fácil errar: "card que some no final do dia". Aviso
// vencido no ar é o que ensina a equipe a ignorar os outros — então a janela de datas é
// o que este teste mais vigia.
//
// O peso é ALTO (vermelho, topo) por um motivo medido, não por ênfase: segunda de feriado
// é o maior dia da rede. Nas duas últimas as 11 lojas somaram R$ 330 mil (07/09) e
// R$ 440 mil (12/10), contra ~R$ 68 mil numa segunda comum — o 12/10 passou do domingo
// médio (R$ 307 mil). Escalar como segunda é o erro caro.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
global.window = {};
require(CAMINHOS.pub('gn-avisos.js'));
const AV = global.window;
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };
const ids = (dia, loja) => AV.gnAvisosAtivos(dia, { loja: loja || 'BANGU', cargo: 'gerente' }).map(a => a.id);

// ── A janela ───────────────────────────────────────────────────────────────
check('não aparece antes de entrar em cartaz', !ids('2026-10-16').includes('dia-comercio-2026'), ids('2026-10-16'));
check('aparece na véspera da véspera (17/10)', ids('2026-10-17').includes('dia-comercio-2026'));
check('aparece no domingo 18/10', ids('2026-10-18').includes('dia-comercio-2026'));
check('aparece NO dia, segunda 19/10', ids('2026-10-19').includes('dia-comercio-2026'));
check('e some no dia seguinte — o "some no final do dia" do pedido',
  !ids('2026-10-20').includes('dia-comercio-2026'), ids('2026-10-20'));
check('não volta depois', !ids('2026-11-19').includes('dia-comercio-2026'));

// ── O conteúdo ─────────────────────────────────────────────────────────────
const a = AV.gnAvisoPorId('dia-comercio-2026');
check('existe como entrada no registro, não como HTML solto no app', !!a);
check('o título diz a data e o que fazer', /19\/10/.test(a.titulo) && /reforce a escala/i.test(a.titulo), a.titulo);
check('diz que é segunda e feriado', /segunda/i.test(a.sub) && /feriado/i.test(a.sub), a.sub);
check('traz o número que justifica o alarde, não só o alarde',
  /440 mil/.test(a.texto) && /68 mil/.test(a.texto), a.texto);
check('peso alto — vai pro topo e pinta de vermelho', a.peso === 'alto');
check('e por isso vem ANTES da eleição na lista',
  ids('2026-10-19')[0] === 'dia-comercio-2026', ids('2026-10-19'));
check('tem itens práticos', Array.isArray(a.itens) && a.itens.length >= 4, (a.itens||[]).length);
check('o primeiro item é o que evita o erro caro: escalar como segunda',
  /domingo forte/.test(a.itens[0]), a.itens[0]);

// ── Escopo ─────────────────────────────────────────────────────────────────
check('vale pras 11 lojas', ids('2026-10-19', 'CAXIAS').includes('dia-comercio-2026'));
check('e a Maglia fica de fora, por não ter sido citada (CLAUDE.md)',
  !ids('2026-10-19', 'MAGLIA').includes('dia-comercio-2026'), ids('2026-10-19', 'MAGLIA'));

// ── Na tela do Home ────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto(('file://' + CAMINHOS.pub('gn-home.html')));
  await page.waitForFunction(() => typeof _renderAvisoEleicoesHome === 'function' && typeof gnAvisosAtivos === 'function', { timeout: 30000 });

  // O renderizador lê a data do relógio; o teste fixa o dia pra medir a tela de 19/10.
  const html = await page.evaluate(() => {
    const real = Date;
    class Falsa extends real { constructor(...a){ super(...(a.length?a:['2026-10-19T10:00:00'])); } static now(){ return new real('2026-10-19T10:00:00').getTime(); } }
    window.Date = Falsa;
    const el = document.getElementById('eleicoes-escala-home-card') || (() => {
      const d = document.createElement('div'); d.id = 'eleicoes-escala-home-card'; document.body.appendChild(d); return d; })();
    try { _renderAvisoEleicoesHome(true, { loja: 'BANGU', cargo: 'gerente' }, false); }
    finally { window.Date = real; }
    return el.innerHTML;
  });
  check('o card chega na tela do Home', /Dia do Com[eé]rcio 19\/10/.test(html), html.slice(0, 220));
  check('pintado de vermelho, como aviso de peso alto', /#DC2626/.test(html), html.slice(0, 300));
  check('com a contagem dizendo que é hoje', /é hoje/.test(html), (html.match(/é hoje|faltam \d+ dias|é amanhã/) || [''])[0]);
  check('o <b> do texto é aplicado, não mostrado como código',
    /<b>R\$ 440 mil<\/b>/.test(html) && !/&lt;b&gt;/.test(html), (html.match(/440 mil[\s\S]{0,40}/) || [''])[0]);
  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await ctx.close(); await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
