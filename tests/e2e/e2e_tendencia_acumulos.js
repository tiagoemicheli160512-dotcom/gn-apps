// Painel: tendência dos acúmulos (28/11/2026) — "28" sozinho não diz se a loja está zerando
// ou acumulando. Manutenção, caixa sem conferência e divergência do Financeiro passam a dizer
// quanto mudou em 7 dias (▲ acumulou / ▼ zerou / = igual), contado com os mesmos dados.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-28T10:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) { await page.goto('file://' + HOME); try { await page.waitForFunction(() => { try { return typeof _loadDashAll === 'function' && typeof _manutRedeResumo === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
  if (!(await page.evaluate(() => typeof _tendTxt === 'function'))) { console.log('FALHOU: a tendência dos acúmulos não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }
  const r = await page.evaluate(async () => {
    const m = (setor, desc, status) => ({ setor, tipo: 'Elétrica', descricao: desc, status: status || 'Pendente' });
    // Bangu: em 18/11 (≤ 21/11) tinha A e B pendentes; hoje A resolvido, B, C, D pendentes → 3 agora × 2 há 7 dias = ▲ 1.
    const manutRows = [
      { loja: 'BANGU', data_operacao: '2026-11-27', manutencao: [m('Cozinha', 'A', 'Resolvido'), m('Cozinha', 'B'), m('Salão', 'C'), m('Salão', 'D')] },
      { loja: 'BANGU', data_operacao: '2026-11-18', manutencao: [m('Cozinha', 'A'), m('Cozinha', 'B')] },
      // Caxias: tinha 3 em 15/11, hoje 1 → ▼ 2.
      { loja: 'CAXIAS', data_operacao: '2026-11-26', manutencao: [m('Bar', 'X'), m('Bar', 'Y', 'Resolvido'), m('Bar', 'Z', 'Resolvido')] },
      { loja: 'CAXIAS', data_operacao: '2026-11-15', manutencao: [m('Bar', 'X'), m('Bar', 'Y'), m('Bar', 'Z')] },
    ];
    const res = _manutRedeResumo(manutRows, [], '2026-11-28');
    // Divergências: Pedreira com 3 pendentes hoje; 1 conferida depois de 21/11 (nova); 1 identificada em 25/11 (pendente há 7 dias).
    const D = (em, resolvido) => Object.assign({ tem_divergencia: true, conferido_em: em, itens: { total_real: { label: 'Total', dif: -10 } } }, resolvido ? { divergencia_resolvida: { resolvido_em: resolvido } } : {});
    const dados = { confs: { p1: D('2026-11-10T12:00:00Z'), p2: D('2026-11-12T12:00:00Z'), p3: D('2026-11-25T12:00:00Z'), p4: D('2026-11-11T12:00:00Z', '2026-11-25T12:00:00Z') },
      fechs: [{ id: 'p1', loja: 'PEDREIRA', data: '2026-11-09', turno: 'DIA' }, { id: 'p2', loja: 'PEDREIRA', data: '2026-11-11', turno: 'DIA' }, { id: 'p3', loja: 'PEDREIRA', data: '2026-11-24', turno: 'DIA' }, { id: 'p4', loja: 'PEDREIRA', data: '2026-11-10', turno: 'DIA' }] };
    const rk = _divRanking(dados, '2026-11-28').find(x => x.k === 'PEDREIRA');
    // Caixa sem conferência via o carregamento do Painel: c1 e c2 conferidos em 26/11 (depois de 21/11); c3 nunca;
    // c4 (24/11) já passou dos 3 dias de prazo hoje, mas há 7 dias nem existia → hoje 2 (c3, c4), há 7 dias 3 (c1, c2, c3).
    const fechamentos = [{ id: 'c1', loja: 'BANGU', data: '2026-11-05', turno: 'DIA' }, { id: 'c2', loja: 'BANGU', data: '2026-11-06', turno: 'DIA' },
      { id: 'c3', loja: 'BANGU', data: '2026-11-07', turno: 'DIA' }, { id: 'c4', loja: 'BANGU', data: '2026-11-24', turno: 'DIA' }];
    const lojaRow = { loja: 'BANGU', all_data: { caixa_conferencias: { c1: { conferido_em: '2026-11-26T12:00:00Z' }, c2: { conferido_em: '2026-11-26T12:00:00Z' } } } };
    window._fetchFatLongo = async () => ({});
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url, h, nome, fb) => nome === 'dash:caixaFechadosRows' ? fechamentos : nome === 'dash:lojasOfRows' ? [lojaRow] : (fb === undefined ? [] : fb);
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block'; document.getElementById('dash-section').style.display = 'block';
    await _loadDashAll();
    const A = _computeAlertas();
    return { manutAgora: res.porLoja, manut7: res.porLoja7, tB: _tendTxt(res.porLoja.BANGU, res.porLoja7.BANGU), tC: _tendTxt(res.porLoja.CAXIAS, res.porLoja7.CAXIAS),
      div: { agora: rk.pend.length, antes: rk.pend7 }, caixa: { agora: (_dashCaixaSemConferencia.BANGU || []).length, antes: _dashCaixaSemConf7.BANGU || 0 },
      alertaCaixa: (A.find(a => a.ico === '💰' && a.loja === 'BANGU') || {}).msg || '' };
  });
  check('manutenção Bangu: 3 agora × 2 há 7 dias → "▲ 1 em 7 dias"', r.manutAgora.BANGU === 3 && r.manut7.BANGU === 2 && r.tB === ' · ▲ 1 em 7 dias', r);
  check('manutenção Caxias: 1 agora × 3 há 7 dias → "▼ 2 em 7 dias"', r.manutAgora.CAXIAS === 1 && r.manut7.CAXIAS === 3 && r.tC === ' · ▼ 2 em 7 dias', r);
  check('divergência Pedreira: 3 pendentes agora × 3 há 7 dias (uma nova, uma identificada na semana)', r.div.agora === 3 && r.div.antes === 3, r.div);
  check('caixa sem conferência Bangu: 2 agora (07/11 e 24/11, já fora do prazo de 3 dias) × 3 há 7 dias (2 conferidos na semana) → "▼ 1 em 7 dias"', r.caixa.agora === 2 && r.caixa.antes === 3 && /2 fechamentos de caixa sem conferência · ▼ 1 em 7 dias/.test(r.alertaCaixa), r);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
