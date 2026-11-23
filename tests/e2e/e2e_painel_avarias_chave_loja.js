// 23/11/2026: "Após a correção das avarias, continua no painel de gestão as lojas como se
// tivesse sem resposta" (print: Painel › Operação › ✅ Validações).
//
// O app Lojas grava as avarias em gn_lojas na linha da chave de USUÁRIO ("SÃO GONÇALO",
// "NORTE SHOPPING", "NOVA AMERICA"); o Painel buscava na do comKey ("SAO_GONCALO", "NORTE",
// "NOVA_AMERICA"), que existe mas não tem avarias. Resultado: essas três apareciam com "—"
// (sem resposta) ou zero — na Validações e em mais cinco leituras (mês anterior, fechamento
// semanal, raio-x da loja, gráficos do BI, aba Avarias). Todas passam por _avariasDaLoja.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

const av = (id, semana, ts, valor) => ({ id, semana, ts, qtd: 1, insumo: 'X', status: 'pendente', valorTotal: valor || 10 });
// Espelho do banco em 23/11 (contagens por semana conferidas via SQL).
const BANCO = [
  { loja: 'BANGU', all_data: { avariasAll: { BANGU: [av('b1', '2026-11-16', '2026-11-17T15:00:00Z')] } } },
  { loja: 'SÃO GONÇALO', all_data: { avariasAll: { 'SÃO GONÇALO': [
    av('s1', '2026-11-09', '2026-11-10T15:00:00Z'), av('s2', '2026-11-09', '2026-11-10T15:00:00Z'), av('s3', '2026-11-09', '2026-11-11T15:00:00Z'), av('s4', '2026-11-09', '2026-11-12T15:00:00Z'),
    av('s5', '2026-11-16', '2026-11-18T15:00:00Z', 30), av('s6', '2026-11-16', '2026-11-18T16:00:00Z', 20),
    av('s7', '2026-10-05', '2026-10-06T15:00:00Z', 50) ] } } },
  { loja: 'SAO_GONCALO', all_data: { utensilios_saldo: { a: { nome: 'Copo', qtd: 3 } } } },
  { loja: 'NORTE SHOPPING', all_data: { avariasAll: { 'NORTE SHOPPING': [av('n1', '2026-11-02', '2026-11-03T15:00:00Z'), av('n2', '2026-11-16', '2026-11-17T15:00:00Z'), av('n3', '2026-11-16', '2026-11-19T15:00:00Z')] } } },
  { loja: 'NORTE', all_data: {} },
];
function filtrar(u) {
  const m = u.match(/gn_lojas\?loja=(eq|in)\.([^&]*)/); if (!m) return null;
  const ks = m[1] === 'eq' ? [m[2]] : m[2].replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''));
  const sel = (u.match(/select=([^&]*)/) || [])[1] || 'all_data';
  return BANCO.filter(r => ks.includes(r.loja)).map(r => {
    const o = { loja: r.loja };
    if (/av:all_data->avariasAll/.test(sel)) o.av = (r.all_data || {}).avariasAll ?? null;
    else if (/all_data/.test(sel)) o.all_data = r.all_data;
    return o;
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-23T10:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url());
    if (/_SEM_SEMANA/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const rows = /gn_lojas\?loja=/.test(u) ? filtrar(u) : [];
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows || []) });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _loadSemLancPainel === 'function' && typeof LOJAS_LISTA !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 25000 });

  // ── 1. Painel › Operação › ✅ Validações (o print) ──
  const pn = await page.evaluate(async () => {
    LOJAS_LISTA = ['BANGU', 'SÃO GONÇALO', 'NORTE SHOPPING']; _semLancPainel = null;
    await _loadSemLancPainel();
    const d = _semLancPainel; if (!d || d.erro) return { erro: true };
    const q = nome => Object.fromEntries(d.linhas.find(l => l.k === nome).por.avarias.map(w => [w.semIni, w.qtd]));
    const h = document.createElement('div'); h.innerHTML = _buildSemLancPanel();
    return { sg: q('SÃO GONÇALO'), norte: q('NORTE SHOPPING'), bangu: q('BANGU'),
             txt: ((h.querySelector('[data-tipo="avarias"]') || {}).textContent || '').replace(/\s+/g, ' ') };
  });
  check('Validações carregou', !pn.erro, pn);
  if (!pn.erro) {
    check('São Gonçalo: 2 avarias na semana 16/11 e 4 na 09/11', pn.sg['2026-11-16'] === 2 && pn.sg['2026-11-09'] === 4, pn.sg);
    check('Norte Shopping: 2 na semana 16/11 e 1 na 02/11', pn.norte['2026-11-16'] === 2 && pn.norte['2026-11-02'] === 1, pn.norte);
    check('Bangu (chaves iguais) continua contando: 1 na 16/11', pn.bangu['2026-11-16'] === 1, pn.bangu);
    check('ninguém das três em "Sem resposta da semana 16/11"', !/Sem resposta da semana/.test(pn.txt) && /Todas responderam a semana 16\/11/.test(pn.txt), pn.txt.slice(0, 300));
  }

  // ── 2. Fechamento semanal da loja (relatório da segunda) ──
  const fe = await page.evaluate(async () => { try { const r = await _fechaMontarRelatorio('SÃO GONÇALO'); return { q: r.avariaQtd, rs: r.avariaRS }; } catch (e) { return { erro: String(e) }; } });
  check('Fechamento semanal de São Gonçalo: 2 avarias, R$ 50', fe.q === 2 && fe.rs === 50, fe);

  // ── 3. Mês anterior (outubro) ──
  const ma = await page.evaluate(async () => { try { const r = await _mesDadosDaLoja('SÃO GONÇALO', new Date(2026, 9, 1)); return { n: r.avariasLoja.length, rs: r.avariasValor }; } catch (e) { return { erro: String(e) }; } });
  check('Mês anterior de São Gonçalo lê as 7 avarias e soma R$ 50 em outubro', ma.n === 7 && ma.rs === 50, ma);

  // ── 4. Leitura central, pelas duas chaves, sem duplicar ──
  const h = await page.evaluate(() => {
    if (typeof _avariasDaLoja !== 'function') return { ausente: true };
    const rows = [{ loja: 'SÃO GONÇALO', all_data: { avariasAll: { 'SÃO GONÇALO': [{ id: 'x' }, { id: 'y' }] } } },
                  { loja: 'SAO_GONCALO', all_data: { avariasAll: { SAO_GONCALO: [{ id: 'y' }, { id: 'z' }] } } },
                  { loja: 'BANGU', av: { BANGU: [{ id: 'b' }] } }];
    return { porUser: _avariasDaLoja(rows, 'SÃO GONÇALO').map(a => a.id).join(), porCom: _avariasDaLoja(rows, 'SAO_GONCALO').map(a => a.id).join(),
             bangu: _avariasDaLoja(rows, 'BANGU').length, na: _avLinhas('NOVA AMERICA').join('|') };
  });
  check('_avariasDaLoja junta as duas linhas sem repetir id (pela chave de usuário)', h.porUser === 'x,y,z', h);
  check('… e dá o mesmo pedindo pelo comKey', h.porCom === 'x,y,z', h);
  check('linha no formato {av} também é lida', h.bangu === 1, h);
  check('Nova América busca nas duas linhas', h.na === 'NOVA AMERICA|NOVA_AMERICA', h);

  // ── 5. Aba Avarias do Painel (lê do _dashLojasAll) ──
  const ab = await page.evaluate(() => {
    _dashLojasAll = [{ loja: 'SAO_GONCALO', all_data: {} }, { loja: 'SÃO GONÇALO', all_data: { avariasAll: { 'SÃO GONÇALO': [{ id: 'q', ts: new Date().toISOString(), status: 'pendente', valorTotal: 7 }] } } }];
    const d = _avMacroDados(); const sg = (d.lojas || d).find ? (d.lojas || d).find(l => l.k === 'SÃO GONÇALO') : null;
    return sg ? { n: sg.itens.length } : { semLoja: true, regra: _avLojasDaRegra() };
  });
  check('Aba Avarias: São Gonçalo mostra a avaria de hoje', ab.n === 1, ab);

  // ── 6. Raio-x da loja e gráficos do BI ──
  const rx = await page.evaluate(() => {
    const out = {};
    _dashLojasAll = [{ loja: 'NORTE', all_data: {} }, { loja: 'NORTE SHOPPING', all_data: { avariasAll: { 'NORTE SHOPPING': [
      { id: 'r1', ts: '2026-11-17T15:00:00Z', status: 'pendente', valorTotal: 12 }, { id: 'r2', ts: '2026-11-18T15:00:00Z', status: 'pendente', valorTotal: 8 }] } } }];
    try { const r = _raioxDaLoja('NORTE SHOPPING', ['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21','2026-11-22']); out.rx = { q: r.avarias.qtd, v: r.avarias.valor }; }
    catch (e) { out.rx = { erro: String(e) }; }
    try {
      const D = { vendas: [], caixa: [], coms: [], banco: [], trios: [], avs: [{ loja: 'NORTE', av: null }, { loja: 'NORTE SHOPPING', av: _dashLojasAll[1].all_data.avariasAll }] };
      const c = _biGCalc(D, { de: '2026-11-16', ate: '2026-11-22' }, ['NORTE SHOPPING'], ['NORTE SHOPPING']);
      const op = c.op || c.oper || null;
      out.bi = op && op['NORTE SHOPPING'] ? { q: op['NORTE SHOPPING'].avQtd, v: op['NORTE SHOPPING'].avValor } : { chaves: Object.keys(c || {}) };
    } catch (e) { out.bi = { erro: String(e) }; }
    return out;
  });
  check('Raio-x do Norte Shopping: 2 avarias, R$ 20', rx.rx && rx.rx.q === 2 && rx.rx.v === 20, rx.rx);
  check('Gráficos do BI: Norte Shopping com 2 avarias, R$ 20', rx.bi && rx.bi.q === 2 && rx.bi.v === 20, rx.bi);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
