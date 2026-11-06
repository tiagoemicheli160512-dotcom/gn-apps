// "Eu já vinha sentindo muita informação. Mas elas são importantes, teria uma forma de
//  redesenhar?" (06/11/2026) — fase 2: os números da loja (venda, meta, cancelamento, nota
//  sem 10%, couvert, banco de horas) viram seis quadradinhos em "📈 Como a loja está".
//  Tocar abre o card completo embaixo. A venda do mês, que aparecia em dois cards, vira UM
//  quadradinho que abre os dois.
//
// O que esta suíte cobra:
//  - o quadradinho mostra os MESMOS números do card (pelos renders reais, não por fixture
//    do quadradinho);
//  - card vazio (a senha não pode ver) não vira quadradinho — cada senha segue vendo só o
//    que é permitido;
//  - card que deu erro não fica com número velho no quadradinho.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Mesmo cenário de e2e_vendas_sem10_rede_home (hoje 05/11): Bangu 110 mil no mês, +10%
// contra outubro, 2º de 5 em faturamento; R$ 1.100 de nota sem 10% em 2 notas.
const dia = (d, loja, v) => ({ loja, data_operacao: d, venda_salao: v, venda_delivery: 0 });
const FAT = [
  dia('2026-10-01', 'Bangu', 50000), dia('2026-10-04', 'Bangu', 50000),
  dia('2026-11-01', 'Bangu', 55000), dia('2026-11-04', 'Bangu', 55000),
  dia('2026-10-02', 'Pedreira', 10000), dia('2026-11-02', 'Pedreira', 15000),
  dia('2026-10-03', 'Caxias', 50000), dia('2026-11-03', 'Caxias', 40000),
  dia('2026-11-05', 'Pedreira', 999999),
  dia('2026-10-01', 'Maglia', 1000), dia('2026-11-01', 'Maglia', 11000),
  dia('2026-11-01', 'Nova América', 30000),
];
const FECH = [
  { loja: 'BANGU', data: '2026-11-02', status: 'FECHADO', sem_nota10_por: null, gn_caixa_cancelamento: [{ valor: 550 }], gn_caixa_gorjeta: [{ valor: 600 }, { valor: 500 }] },
  { loja: 'CAXIAS', data: '2026-11-03', status: 'FECHADO', sem_nota10_por: null, gn_caixa_cancelamento: [], gn_caixa_gorjeta: [{ valor: 400 }] },
];
const BH = [
  { mes: 'CONFIG', registros: { periodo_inicio: '2026-06-26', periodo_fim: '2026-12-25', salariosSetor: { 'Salão': 2200 } } },
  { mes: '2026-10', registros: [{ nome: 'Elias Rocha', horas: -12 }, { nome: 'Rita Lopes', horas: 13 }] },
];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-05T15:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', 'masterLoja'], ['_homeTile', '_homeOrganizar', '_renderCancelRedeHome', '_renderBancoHome']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  await page.evaluate(() => { document.getElementById('home-screen').style.display = 'block'; });
  const espera = () => page.evaluate(() => new Promise(r => setTimeout(r, 30)));
  const montar = (opts) => page.evaluate(async ({ FAT, FECH, BH, opts }) => {
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url, h, c, fb) => {
      if (opts.falhar) return fb;
      if (/checklist_diario/.test(url)) return FAT;
      if (/gn_caixa_fechamento/.test(url)) return FECH;
      if (/gn_banco_horas/.test(url)) return BH;
      if (/gn_comissoes/.test(url)) return [{ loja: 'BANGU', all_data: { '30': { funcs: [{ nome: 'Elias Rocha', setor: 'Salão' }, { nome: 'Rita Lopes', setor: 'Salão' }] } } }];
      return [];
    };
    _cancelRedeHome = null; _cancelRedeHomeChave = ''; _cancelRedeHomeIndo = false;
    masterLoja = null;
    const sess = { loja: opts.loja || 'BANGU', cargo: opts.cargo || 'gerente' };
    try {
      await _renderCancelRedeHome(true, sess, false);
      await _renderVendaMesHome(true, sess, false);
      await _renderBancoHome(true, sess, false);
    } finally { window.gnFetchJson = orig; }
    await new Promise(r => setTimeout(r, 30));
  }, { FAT, FECH, BH, opts: opts || {} });
  const estado = () => page.evaluate(() => {
    const sec = document.getElementById('home-sec-resultado');
    const tiles = {};
    sec.querySelectorAll('.home-tile').forEach(t => { tiles[t.dataset.tile] = t.textContent.replace(/\s+/g, ' ').trim(); });
    const vis = id => { const el = document.getElementById(id); return !!el && el.innerHTML.trim() !== '' && el.offsetParent !== null; };
    const naGaveta = id => !!document.getElementById(id).closest('.home-tiles-gaveta');
    const ids = ['vendas-rede-home-card', 'venda-mes-home-card', 'cancel-rede-home-card', 'sem10-rede-home-card', 'couver-home-card', 'banco-home-card'];
    const v = {}, g = {}; ids.forEach(id => { v[id] = vis(id); g[id] = naGaveta(id); });
    return { secVisivel: sec.style.display !== 'none', ordem: [...sec.querySelectorAll('.home-tile')].map(t => t.dataset.tile), tiles, vis: v, gaveta: g,
      txt: id => '' };
  });
  const txtCard = id => page.evaluate(id => document.getElementById(id).textContent.replace(/\s+/g, ' ').trim(), id);

  // ── 1. Gerente do Bangu: os quadradinhos aparecem com os números dos cards ───────────
  await montar();
  let e = await estado();
  check('"Como a loja está" aparece', e.secVisivel);
  check('quadradinhos na ordem: venda, meta, cancelamento, nota sem 10%, banco (sem couvert: não carregado aqui)',
    e.ordem.join(',') === 'venda,meta,cancel,sem10,banco', e.ordem.join(','));
  check('venda: R$ 110,0 mil, ▲ 10,0% e 2º de 5 — os números do card da rede',
    /R\$ 110,0 mil/.test(e.tiles.venda) && /▲ 10,0%/.test(e.tiles.venda) && /2º de 5/.test(e.tiles.venda), e.tiles.venda);
  const cardVendas = await txtCard('vendas-rede-home-card');
  check('… e o card da rede diz o mesmo (110.000, +10,0%, 2º de 5)', /110\.000,00/.test(cardVendas) && /\+10,0%/.test(cardVendas) && /2º de 5/.test(cardVendas), cardVendas);
  // O número grande é o do card: o 10% que não entrou (10% de R$ 1.100 = R$ 110), não o valor das notas.
  check('nota sem 10%: R$ 110,00 perdido em 2 notas, igual ao número grande do card',
    /R\$\s?110,00/.test(e.tiles.sem10) && /10% perdido em 2 notas/.test(e.tiles.sem10) && /R\$\s?110,00\s*de 10% que não entrou/.test(await txtCard('sem10-rede-home-card')), e.tiles.sem10);
  check('cancelamento: o % do card (550 de 110.000 = 0,50%)', /0,50%/.test(e.tiles.cancel) && /0,50%/.test(await txtCard('cancel-rede-home-card')), e.tiles.cancel);
  check('banco de horas: −12h +13h, com o prazo do ciclo', /−12h \+13h/.test(e.tiles.banco) && /ciclo fecha em \d+ dias/.test(e.tiles.banco), e.tiles.banco);
  check('meta de hoje: o quadradinho existe', /Meta de hoje/.test(e.tiles.meta), e.tiles.meta);
  check('a venda do mês aparece em UM quadradinho só (não duplica)', e.ordem.filter(k => k === 'venda').length === 1 && !e.ordem.includes('vendas'));
  check('começa tudo fechado: nenhum card de resultado à vista', Object.values(e.vis).every(v => !v), JSON.stringify(e.vis));

  // ── 2. Tocar abre o(s) card(s) certo(s) e fecha de novo ──────────────────────────────
  await page.click('.home-tile[data-tile="venda"]'); await espera();
  e = await estado();
  check('tocar em Venda abre OS DOIS cards de venda (rede e mês passado), e só eles',
    e.vis['vendas-rede-home-card'] && e.vis['venda-mes-home-card'] && !e.vis['cancel-rede-home-card'] && !e.vis['banco-home-card'], JSON.stringify(e.vis));
  await page.click('.home-tile[data-tile="banco"]'); await espera();
  e = await estado();
  check('tocar em outro troca: abre o banco e fecha a venda', e.vis['banco-home-card'] && !e.vis['vendas-rede-home-card'], JSON.stringify(e.vis));
  // O card do banco tem botão próprio de abrir a lista: tem que funcionar lá dentro.
  await page.evaluate(() => _bancoHomeToggle()); await espera();
  e = await estado();
  check('o card aberto continua funcionando por dentro (lista do banco abre) sem sair do lugar',
    e.vis['banco-home-card'] && e.gaveta['banco-home-card'] && /Rita Lopes/.test(await txtCard('banco-home-card')));
  await page.click('.home-tile[data-tile="banco"]'); await espera();
  e = await estado();
  check('tocar de novo fecha', Object.values(e.vis).every(v => !v), JSON.stringify(e.vis));

  // ── 3. Redesenho (a Home redesenha a cada volta) não duplica nem perde ───────────────
  await montar(); e = await estado();
  check('depois de redesenhar: os mesmos 5 quadradinhos, sem repetir', e.ordem.join(',') === 'venda,meta,cancel,sem10,banco', e.ordem.join(','));

  // ── 4. Permissão: cada senha só vê o que já via ──────────────────────────────────────
  await montar({ cargo: 'garcom' }); e = await estado();
  check('garçom: só o quadradinho que já via (a meta do mês); cancelamento, nota, venda da rede e banco não aparecem',
    e.ordem.join(',') === 'meta', e.ordem.join(','));
  check('… e os cards proibidos estão vazios, não só escondidos',
    await page.evaluate(() => ['vendas-rede-home-card', 'cancel-rede-home-card', 'sem10-rede-home-card', 'banco-home-card'].every(id => document.getElementById(id).innerHTML.trim() === '')));
  await page.evaluate(() => { ['vendas-rede-home-card', 'venda-mes-home-card', 'cancel-rede-home-card', 'sem10-rede-home-card', 'couver-home-card', 'banco-home-card'].forEach(id => { document.getElementById(id).innerHTML = ''; }); _homeOrganizar(); });
  e = await estado();
  check('sem nenhum card, a seção some', !e.secVisivel && e.ordem.length === 0);

  // ── 5. Card que falha não deixa número velho ─────────────────────────────────────────
  await montar(); 
  await montar({ falhar: true }); e = await estado();
  check('banco fora do ar: some o quadradinho e o card volta pro lugar avisando',
    !e.ordem.includes('banco') && !e.gaveta['banco-home-card'] && /Não deu pra carregar/.test(await txtCard('banco-home-card')), e.ordem.join(','));

  // ── 6. Celular: dois por linha, sem alargar a página ─────────────────────────────────
  await montar(); 
  const lay = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.home-tile')].map(x => x.getBoundingClientRect());
    return { duas: t.length >= 2 && Math.abs(t[0].top - t[1].top) < 2 && t[2].top > t[0].top, larga: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
  });
  check('390px: dois quadradinhos por linha e a página não alarga', lay.duas && !lay.larga, JSON.stringify(lay));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
