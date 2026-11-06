// "Quero que leve essa informação do banco para o app home lojas, igual fizemos nos
//  cancelamentos, couver e etc, sem precisar colocar ranking."
//
// Card ⏱ Banco de horas da loja na Home. O número é o da aba Banco do Painel, pela MESMA
// função (_bancoGerCenarioDaLoja) e o mesmo cartão (_bancoLojaCartaoHtml) — esta suíte cobra
// que os dois deem o mesmo resultado pro mesmo dado. Sem ranking: a loja só vê a si mesma.
//
// Conta conferível de cabeça: salário 2200 = R$ 10,00 por hora; negativa pelo valor cheio,
// positiva com +50%.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 500)); };

// Pedreira, ciclo 26/06 → 25/12/2026 (o pedido de 06/11).
const BH = [
  { mes: 'CONFIG', registros: { periodo_inicio: '2026-06-26', periodo_fim: '2026-12-25', salariosSetor: { 'Salão': 2200, 'Cozinha': 2200 } } },
  { mes: '2026-07', registros: [{ nome: 'Elias Rocha', horas: -8 }, { nome: 'Rita Lopes', horas: 6 }] },
  { mes: '2026-10', registros: [{ nome: 'Elias Rocha', horas: -4 }, { nome: 'Rita Lopes', horas: 4 }, { nome: 'Bruno Dias', horas: 3 }, { nome: 'Davi Souza', horas: 0, semBanco: 'FERIAS' }] },
  // Fora do ciclo (mês anterior ao 1º, e não é legado do 1º ciclo pela regra): não soma.
];
const ESCALA = [{ loja: 'PEDREIRA', all_data: { '30': { funcs: [
  { nome: 'Elias Rocha', setor: 'Salão' }, { nome: 'Rita Lopes', setor: 'Cozinha' }, { nome: 'Bruno Dias', setor: 'Cozinha' }, { nome: 'Davi Souza', setor: 'Salão' } ] } } }];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', 'masterLoja'], ['_renderBancoHome', '_bancoGerCenarioDaLoja', '_bancoLojaCartaoHtml']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  const montar = (opts) => page.evaluate(async ({ bh, escala, opts }) => {
    const orig = window.gnFetchJson; const urls = [];
    window.gnFetchJson = async (url, h, c, fb) => { urls.push(url);
      if (opts.falhar) return fb;
      if (/gn_banco_horas/.test(url)) return bh;
      if (/gn_comissoes/.test(url)) return opts.semEscala ? fb : escala;
      return []; };
    masterLoja = opts.masterLoja || null;
    try { await _renderBancoHome(opts.mostrar !== false, { loja: opts.loja || 'PEDREIRA', cargo: opts.cargo || 'gerente' }, !!opts.isMaster); }
    finally { window.gnFetchJson = orig; }
    const el = document.getElementById('banco-home-card');
    return { html: el.innerHTML, txt: el.textContent.replace(/\s+/g, ' ').trim(), urls };
  }, { bh: BH, escala: ESCALA, opts: opts || {} });

  // ── 1. O card e os números ──────────────────────────────────────────────────────────
  const r = await montar();
  check('o card aparece com o título do banco', /Banco de horas da loja/.test(r.txt), r.txt);
  check('ciclo da Pedreira: 26/06/26 → 25/12/26', /26\/06\/26/.test(r.txt) && /25\/12\/26/.test(r.txt), r.txt);
  check('a compensar: -12h = R$ 120,00 (Elias, -8 em Jul e -4 em Out)', /-12h/.test(r.txt) && /R\$ 120,00/.test(r.txt), r.txt);
  check('a pagar: +13h = R$ 195,00 (Rita +10, Bruno +3, com +50%)', /\+13h/.test(r.txt) && /R\$ 195,00/.test(r.txt), r.txt);
  check('sem ranking nem nome de outra loja', !/posição|º lugar|ranking/i.test(r.txt) && !/Bangu|Caxias|Boulevard/.test(r.txt), r.txt);

  // ── 2. Igual ao Painel, célula por célula ─────────────────────────────────────────────
  const painel = await page.evaluate(({ bh, escala }) => {
    let cfg = null; const porMes = {};
    bh.forEach(x => { if (x.mes === 'CONFIG') cfg = x.registros; else porMes[x.mes] = x.registros; });
    const c = _bancoGerCenarioDaLoja('PEDREIRA', cfg, porMes, '2026-11-06', 0, escala);
    return _bancoLojaCartaoHtml('PEDREIRA', c, { aberto: false }).replace(/onclick="[^"]*"/g, '');
  }, { bh: BH, escala: ESCALA });
  check('o cartão da Home é o mesmo do Painel (mesmo HTML, fora o onclick)',
    r.html.replace(/onclick="[^"]*"/g, '').includes(painel), '');

  // ── 3. Abre e fecha a lista de pessoas ───────────────────────────────────────────────
  // Igual ao Painel: fechado mostra quem passa de ±8h; o botão abre os saldos menores.
  check('fechado: aparecem Elias (-12h) e Rita (+10h), Bruno (+3h) fica escondido',
    /Elias Rocha/.test(r.txt) && /Rita Lopes/.test(r.txt) && !/Bruno Dias/.test(r.txt), r.txt);
  const aberto = await page.evaluate(() => { _bancoHomeToggle(); return document.getElementById('banco-home-card').textContent; });
  check('no toque abre e o Bruno aparece', /Bruno Dias/.test(aberto), aberto.slice(0, 300));
  const fechou = await page.evaluate(() => { _bancoHomeToggle(); return document.getElementById('banco-home-card').textContent; });
  check('e fecha de novo', !/Bruno Dias/.test(fechou));

  // ── 4. Consulta só da própria loja ───────────────────────────────────────────────────
  check('as duas consultas vêm filtradas pela loja (Pedreira / PEDREIRA)',
    r.urls.length === 2 && r.urls.some(u => /gn_banco_horas\?loja=eq\.Pedreira&/.test(u)) && r.urls.some(u => /gn_comissoes\?loja=eq\.PEDREIRA&/.test(u)), JSON.stringify(r.urls));

  // ── 5. Quem não vê ───────────────────────────────────────────────────────────────────
  const garcom = await montar({ cargo: 'garcom' });
  check('garçom não vê o card', garcom.html === '' && garcom.urls.length === 0);
  const maglia = await montar({ loja: 'MAGLIA' });
  check('Maglia não vê (não foi citada no pedido, e não tem banco)', maglia.html === '' && maglia.urls.length === 0);
  const escondido = await montar({ mostrar: false });
  check('com os cards da Home escondidos, some também', escondido.html === '');
  const master = await montar({ cargo: 'master', isMaster: true, masterLoja: 'PEDREIRA' });
  check('master olhando a Pedreira vê o card dela', /-12h/.test(master.txt));

  // ── 6. Falhas ────────────────────────────────────────────────────────────────────────
  const falha = await montar({ falhar: true });
  check('banco fora do ar: avisa em vez de mostrar zero', /Não deu pra carregar agora/.test(falha.txt) && !/0h/.test(falha.txt), falha.txt);
  const semEsc = await montar({ semEscala: true });
  check('sem a escala, as horas continuam certas e o R$ diz que falta salário',
    /-12h/.test(semEsc.txt) && /\+13h/.test(semEsc.txt) && !/R\$ 120,00/.test(semEsc.txt), semEsc.txt);

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
