// "Quero criar o card também com a informação do couver, que tem também já no app home
//  painel de gestão, mostrando o resultado do último fim de semana e do mês."
//
// Card 🎵 Couvert do trio na Home da loja. A conta é a da aba Trios do Painel, pela MESMA
// função (_triosAgregar) — esta suíte cobra que o card e o Painel deem o mesmo saldo pro
// mesmo fim de semana. No MÊS, decisão do dono: só o que já aconteceu entra; o cachê dos
// fins de semana que ainda vêm aparece à parte (o Painel soma o mês inteiro).
//
// Fixture: a agenda real do Bangu de 31/10 a 29/11/2026, lida do banco em 06/11.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 500)); };

const ag = (data, cache, couver, extra) => Object.assign({ data, loja: 'bangu', artista: 'Trio ' + data, cache, couver_qtd: null,
  couver_valor: couver, couver_lancado_em: couver > 0 ? data + 'T23:00:00Z' : null, presenca_confirmada: true,
  banda_nao_veio: false, banda_nao_veio_motivo: null, horario_inicio: '20:00' }, extra || {});
const BANGU = [
  ag('2026-10-31', 600, 735), ag('2026-11-01', 800, 1330),
  ag('2026-11-07', 800, 0), ag('2026-11-08', 800, 0), ag('2026-11-14', 800, 0), ag('2026-11-15', 800, 0),
  ag('2026-11-21', 700, 0), ag('2026-11-22', 800, 0), ag('2026-11-28', 800, 0), ag('2026-11-29', 600, 0),
];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const abrir = async (quando) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, quando);
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(String(e.message || e)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + HOME);
      try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', 'masterLoja', '_TRIOS_STATUS'], ['_renderCouverHome', '_triosAgregar']); break; }
      catch (e) { if (t >= 4) throw new Error('a Home não carregou (ou falta o código novo)'); }
    }
    return { page, erros, ctx };
  };
  const montar = (page, rows, opts) => page.evaluate(async ({ rows, opts }) => {
    const orig = window.gnFetchJson;
    const urls = [];
    window.gnFetchJson = async (url, h, c, fb) => { urls.push(url); if (opts.falhar) return fb; return /gn_trios_agenda/.test(url) ? rows : []; };
    masterLoja = opts.masterLoja || null;
    try { await _renderCouverHome(true, { loja: opts.loja || 'BANGU', cargo: opts.cargo || 'gerente' }, !!opts.isMaster); }
    finally { window.gnFetchJson = orig; }
    const el = document.getElementById('couver-home-card');
    return { html: el.innerHTML, txt: el.textContent.replace(/\s+/g, ' ').trim(),
             blocos: Array.from(el.querySelectorAll('.couver-bloco')).map(b => b.textContent.replace(/\s+/g, ' ').trim()), urls };
  }, { rows, opts: opts || {} });

  // ── 05/11 (quinta): último fim de semana 31/10–01/11, mês até ontem = só 01/11 ─────────
  const a = await abrir('2026-11-05T15:00:00');
  const r = await montar(a.page, BANGU);
  check('o card aparece com os dois blocos: fim de semana e mês', r.blocos.length === 2 && /Couvert do trio/.test(r.txt), r.txt);
  check('fim de semana 31/10–01/11: saldo +R$ 665 (couvert 2.065 − cachê 1.400)',
    /31\/10–01\/11/.test(r.blocos[0]) && /R\$\s?665,00/.test(r.blocos[0]) && /2\.065,00/.test(r.blocos[0]) && /1\.400,00/.test(r.blocos[0]), r.blocos[0]);
  check('mês até ontem: só 01/11 entra — saldo +R$ 530 (1.330 − 800)', /Novembro até ontem/i.test(r.blocos[1]) && /R\$\s?530,00/.test(r.blocos[1]) && /Cachê R\$\s?800,00/.test(r.blocos[1]), r.blocos[1]);
  check('o cachê que ainda vem aparece à parte: R$ 6.100 em 4 fins de semana', /Ainda vem R\$\s?6\.100,00 de cachê contratado em 4 fins de semana/.test(r.txt), r.txt);
  check('saldo positivo em verde', /txt-green/.test(r.html));
  check('uma consulta só, só da loja, desde a segunda do último fim de semana', r.urls.length === 1 && /loja=eq\.bangu/.test(r.urls[0]) && /data=gte\.2026-10-26/.test(r.urls[0]), JSON.stringify(r.urls));

  // ── O MESMO saldo que o Painel calcula pro mesmo fim de semana ──────────────────────
  const painel = await a.page.evaluate(async (rows) => {
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url) => /gn_trios_agenda/.test(url) ? rows : [];
    const r0 = window.renderDashboard; window.renderDashboard = () => {};
    _triosPer = 'sem'; _triosGerOff = 0;
    try { await _loadTriosGerencia(); } finally { window.gnFetchJson = orig; window.renderDashboard = r0; }
    const s = _triosGerData && _triosGerData.porSemana && _triosGerData.porSemana['BANGU|2026-10-26'];
    return s ? { saldo: s.saldo, couver: s.couver, cache: s.cacheDevido, status: s.status } : null;
  }, BANGU);
  check('o Painel dá o mesmo saldo pro fim de semana (+665, positivo)', painel && painel.saldo === 665 && painel.couver === 2065 && painel.cache === 1400 && painel.status === 'positivo', JSON.stringify(painel));

  // ── Fim de semana sem couvert lançado: não inventa saldo ─────────────────────────────
  const sem = BANGU.map(x => x.data === '2026-11-01' ? ag('2026-11-01', 800, 0) : x);
  const r2 = await montar(a.page, sem);
  check('dia sem couvert lançado: o saldo não fecha ("—") e o card pede o lançamento de 01/11',
    /—/.test(r2.blocos[0]) && /falta lançar o couvert de 01\/11/.test(r2.blocos[0]) && /couvert em parte/i.test(r2.blocos[0]), r2.blocos[0]);

  // ── Saldo negativo em vermelho ───────────────────────────────────────────────────────
  const neg = BANGU.map(x => x.data === '2026-11-01' ? ag('2026-11-01', 800, 100) : x);
  const r3 = await montar(a.page, neg);
  check('saldo negativo em vermelho (−R$ 565 no fim de semana)', /−R\$\s?565,00/.test(r3.blocos[0]) && /txt-red/.test(r3.html), r3.blocos[0]);

  // ── Banda que não veio: cachê descontado, como no Painel ─────────────────────────────
  const naoVeio = BANGU.map(x => x.data === '2026-10-31' ? ag('2026-10-31', 600, 0, { banda_nao_veio: true, presenca_confirmada: false }) : x);
  const r4 = await montar(a.page, naoVeio);
  check('banda que não veio e a noite não arrecadou: cachê descontado (saldo +R$ 530, − R$ 600)',
    /R\$\s?530,00/.test(r4.blocos[0]) && /600,00 de quem não veio/.test(r4.blocos[0]), r4.blocos[0]);

  // ── Quem vê ──────────────────────────────────────────────────────────────────────────
  const mg = await montar(a.page, BANGU, { loja: 'MAGLIA' });
  check('Maglia (sem trio) não tem card', mg.html === '' && mg.urls.length === 0);
  const garcom = await montar(a.page, BANGU, { cargo: 'garcom' });
  check('cargo fora da plateia não vê', garcom.html === '');
  const mestre = await montar(a.page, BANGU.map(x => Object.assign({}, x, { loja: 'pedreira' })), { loja: 'GERAL', cargo: 'mestre', isMaster: true, masterLoja: 'PEDREIRA' });
  check('mestre olhando a Pedreira vê a agenda da Pedreira', /loja=eq\.pedreira/.test(mestre.urls[0] || '') && /665,00/.test(mestre.txt), mestre.txt);
  const falha = await montar(a.page, BANGU, { falhar: true });
  check('consulta que falha deixa recado, não some calado', /Não deu pra carregar/.test(falha.txt), falha.txt);
  check('nenhum erro de JavaScript', a.erros.length === 0, a.erros.join(' | '));
  await a.ctx.close();

  // ── 03/12: nenhum show de dezembro aconteceu ainda ───────────────────────────────────
  const b = await abrir('2026-12-03T15:00:00');
  const dez = [ag('2026-11-28', 800, 900), ag('2026-11-29', 600, 700), ag('2026-12-05', 800, 0), ag('2026-12-06', 800, 0)];
  const r5 = await montar(b.page, dez);
  check('começo de mês sem show acontecido: o bloco do mês diz isso, e o cachê futuro vem à parte',
    /Nenhum show do mês aconteceu ainda/.test(r5.blocos[1]) && /Ainda vem R\$\s?1\.600,00/.test(r5.txt) && /1 fim de semana/.test(r5.txt), r5.txt);
  check('o último fim de semana é o de 28–29/11, mesmo já sendo dezembro', /28\/11–29\/11/.test(r5.blocos[0]) && /R\$\s?200,00/.test(r5.blocos[0]), r5.blocos[0]);
  await b.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
