// "Pode fazer as duas" (06/11/2026): na Home do Bangu, "Pra fazer hoje" dizia 7
// manutenções paradas e "Pendências da loja" dizia 9. Medido no banco: o "Pra fazer hoje"
// contava errado de dois jeitos —
//  1. contava item JÁ RESOLVIDO: o "Secador de mão" resolvido em 23/10 era pulado e a
//     ocorrência pendente de 22/10 entrava no lugar;
//  2. não via o que está parado DE VERDADE: o Check-list repete o item pendente todo dia,
//     e ele media pela ocorrência mais recente (hoje) — a "Copa água/refri", aberta em
//     27/10, nunca passava de 5 dias.
// Agora os dois cards usam a mesma função (_manutParadasDaLoja), a régua do Painel e do
// app Manutenção: status da ocorrência mais recente, data da mais antiga, mais os itens
// oficiais do RH. Esta suíte cobra que os dois deem o MESMO número, e o número certo.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Hoje 06/11. "Parada" = aberta antes de 01/11.
const dias = (de, ate) => { const r = []; for (let d = new Date(ate + 'T12:00:00'); d >= new Date(de + 'T12:00:00'); d.setDate(d.getDate() - 1)) r.push(d.toISOString().slice(0, 10)); return r; };
const M = (descricao, setor, status) => ({ descricao, setor, tipo: 'Manutenção', status });
const linhas = {};
const por = (d, m) => { (linhas[d] = linhas[d] || []).push(m); };
// Parada de verdade: aberta 27/10 e repetida todo dia até hoje.
dias('2026-10-27', '2026-11-06').forEach(d => por(d, M('Copa água /refri', 'Salão', 'Pendente')));
// Resolvida: pendente de 07/10 a 22/10, resolvida em 23/10 (e some depois).
dias('2026-10-07', '2026-10-22').forEach(d => por(d, M('Secador de mão com defeito', 'Salão', 'Pendente')));
por('2026-10-23', M('Secador de mão com defeito', 'Salão', 'Resolvido'));
// Nova: aberta 04/11 — pendente, mas ainda não está parada.
dias('2026-11-04', '2026-11-06').forEach(d => por(d, M('Lâmpada do salão', 'Salão', 'Pendente')));
// Mesmo item com a descrição em maiúscula e espaço no fim: é UM item só.
dias('2026-10-20', '2026-11-06').forEach((d, i) => por(d, M(i % 2 ? 'FREEZER PINGANDO ' : 'Freezer pingando', 'Cozinha', 'Em andamento')));
const CHK = Object.keys(linhas).sort().reverse().map(d => ({ data_operacao: d, manutencao: linhas[d] }));
// Oficial do RH, aberta 15/10: entra.
const LOJA_ALL = { manut_oficial_items: [{ descricao: 'Telhado', setor: 'Estrutura', status: 'Pendente', created_at: '2026-10-15T10:00:00Z' }] };
// Esperado: Copa (27/10), Freezer (20/10), Telhado (15/10) = 3. Fora: Secador (resolvido), Lâmpada (nova).

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA', 'masterLoja'], ['_renderPraHojeHome', '_renderPendenciasLojaHome', '_manutParadasDaLoja']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  const r = await page.evaluate(async ({ CHK, LOJA_ALL }) => {
    const sess = { id: 1, nome: 'Teste', cargo: 'gerente', loja: 'BANGU', permissoes: {} };
    session = sess; masterLoja = null;
    window.gnFetchJson = async (u, h, c, fb) => {
      if (c === 'praHoje:manut' || c === 'pendLoja:chk') return CHK;
      if (c === 'praHoje:lojas' || c === 'pendLoja:lojas') return [{ all_data: LOJA_ALL }];
      return fb;
    };
    await _renderPraHojeHome(true, sess, false);
    await _renderPendenciasLojaHome(true, sess, false);
    await new Promise(r => setTimeout(r, 80));
    const t = id => document.getElementById(id).textContent.replace(/\s+/g, ' ');
    const n = txt => { const m = txt.match(/(\d+) manuten\S+ parada/); return m ? +m[1] : 0; };
    const paradas = _manutParadasDaLoja(CHK, LOJA_ALL, '2026-11-06', (() => { const d = new Date(); d.setDate(d.getDate() - 5); return d; })());
    return { praHoje: n(t('pra-hoje-card')), pend: n(t('pendencias-loja-home-card')), praTxt: t('pra-hoje-card'),
      itens: paradas.map(m => m.descricao.trim() + '@' + m._data) };
  }, { CHK, LOJA_ALL });

  check('"Pra fazer hoje" e "Pendências da loja" dão o MESMO número', r.praHoje === r.pend && r.praHoje > 0, `pra hoje ${r.praHoje} · pendências ${r.pend}`);
  check('e o número certo: 3 (Copa, Freezer, Telhado do RH)', r.praHoje === 3, JSON.stringify(r.itens));
  check('o Secador, resolvido em 23/10, não conta (era o erro do "Pra fazer hoje")', !r.itens.some(x => /Secador/.test(x)) && !/Secador/.test(r.praTxt), r.praTxt);
  check('a Copa conta pela data em que foi ABERTA (27/10), não pela de hoje', r.itens.includes('Copa água /refri@2026-10-27'), JSON.stringify(r.itens));
  check('a Lâmpada, aberta em 04/11, ainda não está parada', !r.itens.some(x => /Lâmpada/.test(x)));
  check('maiúscula/espaço na descrição não viram dois itens (Freezer conta uma vez)', r.itens.filter(x => /freezer/i.test(x)).length === 1, JSON.stringify(r.itens));
  check('o item oficial do RH entra também no "Pra fazer hoje"', r.itens.some(x => /Telhado/.test(x)));
  check('o detalhe do "Pra fazer hoje" começa pela mais antiga (Telhado · Freezer)', /Telhado · FREEZER PINGANDO|Telhado · Freezer pingando/.test(r.praTxt), r.praTxt);

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
