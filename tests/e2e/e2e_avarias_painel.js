// Pedido do dono (20/11/2026): "trazer as informações de avarias que ficam no app Pedido
// para o Painel de Gestão, por loja, com relatório individual e geral, e aba que expande pra
// ver os itens — isso é importante pra mim."
//
// Cobra (Painel › Operação › ⚠️ Avarias, período do Painel):
//  · só avaria comum do período (saída pra terceiro, empréstimo pago e cancelada ficam fora;
//    mês anterior fora); total, nº de itens e quantas ainda sem valor do Compras;
//  · ranking de quem mais perdeu pra quem menos; tocar leva até a loja;
//  · cada loja fechada; abre e mostra os itens com status, quantidade, quem registrou e o
//    desperdício do rodízio/buffet daquela loja;
//  · relatório geral (rede) e individual (lojas marcadas, com a posição na rede);
//  · Maglia fora; nada passa de 390 px.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-20T15:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof renderDashboard === 'function' && typeof _plToggle === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _buildAvariasPanel === 'function'))) {
    console.log('FALHOU: a aba Avarias do Painel não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const r = await page.evaluate(async () => {
    const av = (id, ts, insumo, qtd, valor, status, extra) => Object.assign({ id, ts, insumo, qtd, valorTotal: valor, status, registrado_por: 'Fernando' }, extra || {});
    _dashLojasAll = [
      { loja: 'BANGU', all_data: { avariasAll: { BANGU: [
        av('b1', '2026-11-19T22:40:25Z', 'CHOPP BRAHMA 350ML', 0.7, 0, 'pendente'),
        av('b2', '2026-11-10T15:00:00Z', 'PICANHA', 1.5, 120, 'loja_confirmou'),
        av('b3', '2026-11-03T15:00:00Z', 'ARROZ', 2, 10, 'finalizado'),
        av('b4', '2026-10-28T15:00:00Z', 'FEIJÃO', 1, 50, 'finalizado'),                                   // mês passado
        av('b5', '2026-11-12T15:00:00Z', 'TOALHA', 3, 99, 'pendente', { tipo: 'saida_terceiro' }),       // não é perda
        av('b6', '2026-11-12T15:00:00Z', 'GELO', 3, 15, 'cancelado'),                                     // cancelada
      ] } } },
      { loja: 'PEDREIRA', all_data: { avariasAll: { PEDREIRA: [ av('p1', '2026-11-16T15:59:23Z', 'ABOBORA SERGIPANA', 3.5, 14.4, 'loja_confirmou', { unidade: 'KG' }) ] } } },
      { loja: 'SAO_GONCALO', all_data: { avariasAll: { 'SÃO GONÇALO': [ av('s1', '2026-11-17T17:04:22Z', 'GUARANA LATA', 1, 3, 'loja_confirmou') ] } } },
      { loja: 'MAGLIA', all_data: { avariasAll: { MAGLIA: [ av('m1', '2026-11-15T15:00:00Z', 'X', 1, 999, 'finalizado') ] } } },
    ];
    window.gnFetchJson = async (url, h, nome, fb) => {
      if (nome === 'avariasPainel:desp') return [
        { loja: 'BANGU', data: '2026-11-14', tipo: 'rodizio', teve: true, itens: [{ insumo: 'PICANHA', qtd: 1.5, unidade: 'KG' }], assinado_por: 'Fernando' },
        { loja: 'BANGU', data: '2026-11-15', tipo: 'feijoada', teve: false, itens: [] },
        { loja: 'CAXIAS', data: '2026-11-14', tipo: 'rodizio', teve: true, itens: [{ insumo: 'ARROZ', qtd: 2, unidade: 'KG' }], assinado_por: 'Ana' },
      ];
      return fb === undefined ? [] : fb;
    };
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    _dashPer = 'mes'; _dashMoff = 0; _dashTab = 'avarias';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('home-screen').style.display = 'flex';
    const el = document.getElementById('dash-section'); el.style.display = 'block';
    const montar = () => { el.innerHTML = _buildAvariasPanel(); };
    renderDashboard = montar;
    montar(); await new Promise(res => setTimeout(res, 300)); montar();
    const box = k => [...el.querySelectorAll('.pl-loja')].find(x => x.dataset.painel === 'avarias' && x.dataset.loja === k);
    const vis = k => { const b = box(k); const n = b && b.querySelector('.pl-notas'); return !!n && getComputedStyle(n).display !== 'none'; };
    const out = { txt: el.innerText.replace(/\s+/g, ' '), lojas: [...el.querySelectorAll('.pl-loja')].map(x => x.dataset.loja),
      rank: [...el.querySelectorAll('.pl-rank')].map(x => x.innerText.replace(/\s+/g, ' ').trim()), fechadas: !vis('BANGU') && !vis('PEDREIRA') };
    box('BANGU').querySelector('.pl-cab').click();
    out.aberta = vis('BANGU') && !vis('PEDREIRA');
    out.itens = [...box('BANGU').querySelectorAll('.av-item')].map(x => x.innerText.replace(/\s+/g, ' ').trim());
    out.desp = [...box('BANGU').querySelectorAll('.av-desp')].map(x => x.innerText.replace(/\s+/g, ' ').trim());
    window.scrollTo(0, 0);
    [...el.querySelectorAll('.pl-rank')].find(x => /Pedreira/.test(x.innerText)).click();
    await new Promise(res => setTimeout(res, 900));
    out.rankAbriu = vis('PEDREIRA'); out.topPedreira = Math.round(box('PEDREIRA').getBoundingClientRect().top);
    out.hdrH = Math.round(document.querySelector('.app-hdr').getBoundingClientRect().height);
    out.noFim = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;
    out.cabeVisivel = box('PEDREIRA').querySelector('.pl-cab').getBoundingClientRect().bottom <= window.innerHeight;
    out.largos = [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).length;
    out.relGeral = _avRelatorioTexto(false).msg;
    _avFiltroLojaToggle('PEDREIRA', true); _avFiltroLojaToggle('CAMPO GRANDE', true);
    out.relInd = _avRelatorioTexto(false);
    out.grupo = DASH_GRUPOS.find(g => g.g === 'operacao').abas.map(a => a[0]).join();
    return out;
  });
  check('aba "⚠️ Avarias" no grupo Operação', /vendidos,avarias/.test(r.grupo), r.grupo);
  check('total do mês: R$ 147,40 (120 + 10 + 14,40 + 3) em 5 itens de 4 lojas (Caxias pelo desperdício), 1 ainda sem valor — fora o mês passado, saída pra terceiro e cancelada',
    /Avarias no período R\$ 147,40/i.test(r.txt) && /5 itens · 4 lojas · 1 ainda sem valor/.test(r.txt) && /a que está sem valor conta como R\$ 0/.test(r.txt), r.txt.slice(0, 400));
  check('desperdício do rodízio/buffet: 2 dias com desperdício declarado ("não teve" não conta)', /Desperdício rodízio\/buffet 2 dias com desperdício declarado/i.test(r.txt), r.txt.slice(0, 500));
  check('lojas com avaria ou desperdício (Bangu, Pedreira, São Gonçalo, Caxias), da maior perda pra menor; Maglia fora', r.lojas.join() === 'BANGU,PEDREIRA,SÃO GONÇALO,CAXIAS' && !/Maglia/.test(r.txt), r.lojas);
  check('ranking com valor e itens (Bangu R$ 130,00 · 3 itens · 1 s/ valor)', /1º Bangu R\$ 130,00 3 itens · 1 s\/ valor/.test(r.rank[0]), r.rank);
  check('as lojas vêm fechadas; tocar abre só aquela', r.fechadas && r.aberta, r);
  check('aberta, mostra cada item com data, quantidade, status, quem registrou e o valor (ou "s/ valor")',
    r.itens.length === 3 && /^19\/11 CHOPP BRAHMA 350ML · 0,7 aguardando valor \(Compras\) · registrado por Fernando s\/ valor$/.test(r.itens[0]) && /PICANHA · 1,5 valor confirmado · aguardando Financeiro .* R\$ 120,00/.test(r.itens[1]) && /ARROZ · 2 finalizada .* R\$ 10,00/.test(r.itens[2]), r.itens);
  check('…e o desperdício do rodízio daquela loja (o "não teve" da feijoada não aparece)', r.desp.length === 1 && /14\/11 🍖 Rodízio: PICANHA 1,5 KG · Fernando/.test(r.desp[0]), r.desp);
  check('tocar no ranking abre a loja e rola até ela, abaixo do cabeçalho fixo (ou até o fim da página, visível)', r.rankAbriu && r.topPedreira >= r.hdrH && r.cabeVisivel && (r.topPedreira < r.hdrH + 60 || r.noFim), { rankAbriu: r.rankAbriu, top: r.topPedreira, hdr: r.hdrH, noFim: r.noFim, vis: r.cabeVisivel });
  check('lojas sem nada no período listadas embaixo', /Sem avaria no período · 7 lojas/i.test(r.txt), r.txt.slice(-300));
  check('relatório geral: rede, total, cada loja com os itens e o desperdício', /AVARIAS — REDE/.test(r.relGeral) && /Total: R\$ 147,40 · 5 itens \(1 ainda sem valor do Compras\)/.test(r.relGeral) && /Bangu — R\$ 130,00 \(3 itens\)/.test(r.relGeral) && /14\/11 Rodízio: PICANHA 1,5 KG/.test(r.relGeral) && !/Maglia/.test(r.relGeral), r.relGeral);
  check('relatório individual: só as lojas marcadas, com a posição na rede e quem não teve avaria', /AVARIAS — CAMPO GRANDE, PEDREIRA/.test(r.relInd.msg) && /Pedreira: 2º de 4 · R\$ 14,40/.test(r.relInd.msg) && /Campo Grande: sem avaria no período/.test(r.relInd.msg) && !/Bangu —/.test(r.relInd.msg) && /Total: R\$ 14,40 · 1 item/.test(r.relInd.msg), r.relInd.msg);
  check('nada passa da largura em 390 px', r.largos === 0, r.largos);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
