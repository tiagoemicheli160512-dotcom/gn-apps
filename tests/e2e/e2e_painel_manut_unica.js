// Painel de Gestão (07/11/2026): a manutenção aparecia com três números na mesma tela —
// o chip "🔧 37 manut." do topo e o atalho do app Manutenção ("37 pendentes") contavam
// só o Check-list de HOJE; o card do meio dizia "72 manutenções pendentes". O de hoje
// deixava de fora a loja que ainda não abriu o Check-list do dia e os itens do RH.
// Agora os três saem de _manutRedeResumo (a régua de _manutPendentesDaLoja, loja a loja).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Hoje 07/11. Bangu abriu o Check-list hoje (1 pendente, 1 resolvido); Caxias NÃO abriu
// hoje, mas tem 2 pendentes desde 20/10 (repetidos até ontem); Pedreira tem 1 item do RH.
const M = (descricao, status) => ({ descricao, setor: 'Salão', tipo: 'Manutenção', status });
const CHK = [
  { data_operacao: '2026-11-07', loja: 'Bangu', manutencao: [M('Lâmpada', 'Pendente'), M('Pia', 'Resolvido')] },
  { data_operacao: '2026-11-06', loja: 'Caxias', manutencao: [M('Freezer', 'Pendente'), M('Porta', 'Em andamento')] },
  { data_operacao: '2026-11-06', loja: 'Bangu', manutencao: [M('Pia', 'Pendente')] },
  { data_operacao: '2026-10-20', loja: 'Caxias', manutencao: [M('Freezer', 'Pendente'), M('Porta', 'Pendente')] },
];
// Esperado: Bangu 1 (Lâmpada; Pia resolvida hoje), Caxias 2 (paradas: abertas 20/10), Pedreira 1 (RH, 15/10, parada) = 4; 3 paradas.

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-07T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', 'LOJA_COM_KEY'], ['_manutRedeResumo', '_manutRedeCarregar', '_renderHealthChips', 'loadManutBadge', 'setBadge']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  const r = await page.evaluate(async (CHK) => {
    const LOJAS = [{ loja: LOJA_COM_KEY.PEDREIRA || 'PEDREIRA', all_data: { manut_oficial_items: [{ descricao: 'Telhado', setor: 'Estrutura', status: 'Pendente', created_at: '2026-10-15T10:00:00Z' }] } }];
    const urls = [];
    window.gnFetchJson = async (u, h, c, fb) => {
      urls.push(c);
      if (c === 'manutRede:chk') return CHK;
      if (c === 'manutRede:lojas') return LOJAS.map(l => ({ loja: l.loja, manut: l.all_data.manut_oficial_items }));
      if (c === 'chips:clRows') return CHK.filter(x => x.data_operacao === '2026-11-07');   // só o de hoje (o que o chip usava)
      return fb;
    };
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    document.getElementById('home-screen').style.display = 'block';
    renderModules(session, true);
    _manutRedeCache = null;
    await _renderHealthChips();
    await loadManutBadge();
    // O card do Painel: a MESMA função com o que o loader do Painel busca.
    const card = _manutRedeResumo(CHK, LOJAS, '2026-11-07');
    const chip = [...document.querySelectorAll('#health-chips span')].map(e => e.textContent).find(t => /manut/.test(t)) || '';
    window._openChipDetail('manut');
    const detalhe = document.body.innerText.match(/Manutenções pendentes por loja[\s\S]{0,200}/);
    return { chip, badge: document.getElementById('badge-manutencao').textContent, card, detalhe: detalhe ? detalhe[0].replace(/\s+/g, ' ') : '',
      consultas: urls.filter(c => /^manutRede:/.test(c)).length };
  }, CHK);

  check('o card do Painel conta 4 pendentes, 3 paradas há mais de 5 dias', r.card.total === 4 && r.card.paradas === 3, JSON.stringify(r.card));
  check('o chip do topo diz o MESMO número do card (4, não 1 do Check-list de hoje)', /🔧 4 manut\./.test(r.chip), r.chip);
  check('o atalho do app Manutenção também diz 4', r.badge === '4 pendentes', r.badge);
  check('Caxias, que não abriu o Check-list hoje, entra (2)', r.card.porLoja.CAXIAS === 2, JSON.stringify(r.card.porLoja));
  check('o item do RH entra (Pedreira 1)', r.card.porLoja.PEDREIRA === 1);
  check('a manutenção resolvida hoje não conta (Bangu 1)', r.card.porLoja.BANGU === 1);
  check('o detalhe do chip lista as lojas com o mesmo número', /Caxias[^·]*2 itens/.test(r.detalhe) && /Bangu[^·]*1 item/.test(r.detalhe), r.detalhe);
  check('chip e atalho buscam uma vez só (cache): 2 consultas, não 4', r.consultas === 2, r.consultas);
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
