// Barril de chopp de vinho = 5,2 × 10^31 no Boulevard em agosto. Não é dado digitado: é o
// merge por delta somando o valor INTEIRO em cima do que já está na nuvem.
//
// _mergeEstIniAllPorDelta reaplica, em cima do valor mais fresco da nuvem, o quanto ESTE
// aparelho somou desde a última sincronização (baseline _estIniAllSync). Mas o sbPull só
// aplica — e só dá baseline a — semanas de até uma semana atrás. Toda semana mais velha
// voltava do localStorage sem baseline, e aí "local − 0" valia como delta: o push somava o
// valor inteiro de novo. A cada reload + push, dobrava.
//
// Medido no banco: ~19 mil valores impossíveis em 10 lojas, zero nas duas últimas semanas e
// pior quanto mais velha a semana — a assinatura de um crescimento exponencial.
//
// O teste cobre as duas direções: a dobra tem que parar E o delta legítimo (dois aparelhos
// contando a mesma semana) tem que continuar valendo, que é a razão da função existir.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS_APP = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (extra ? '  → ' + extra : '')); c ? ok++ : falhou++; };

const FECHADA = 'BOULEVARD|2026-08-10';  // o sbPull não aplica mais (mais de 1 semana atrás)
const ABERTA  = 'BOULEVARD|2026-10-19';  // semana atual

async function abrir(browser, nuvem) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const patches = [];
  const estado = { BOULEVARD: JSON.parse(JSON.stringify(nuvem)), 'NOVA AMERICA': {} };
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url(), m = r.request().method();
    if (m !== 'GET') {
      if (m === 'PATCH') {
        let b = null; try { b = JSON.parse(r.request().postData() || 'null'); } catch (e) {}
        patches.push({ u, b });
        // guarda o que foi gravado: o ciclo seguinte tem que ler a nuvem já atualizada,
        // igual ao Supabase de verdade
        const mm = /loja=eq\.([^&?]+)/.exec(u);
        const alvo = mm && decodeURIComponent(mm[1]).replace(/\+/g, ' ');
        if (alvo && b && b.all_data && b.all_data.estIniAll) estado[alvo] = b.all_data.estIniAll;
      }
      return r.fulfill({ status: 204, body: '' });
    }
    if (u.indexOf('gn_lojas') === -1) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const mm = /loja=eq\.([^&]+)/.exec(u);
    const rows = [
      { loja: 'BOULEVARD', all_data: { estIniAll: estado.BOULEVARD } },
      { loja: 'NOVA AMERICA', all_data: { estIniAll: estado['NOVA AMERICA'] } },
    ].filter(x => !mm || x.loja === decodeURIComponent(mm[1]).replace(/\+/g, ' '))
     .map(x => ({ loja: x.loja, all_data: x.all_data, updated_at: '2026-10-22T00:00:00Z' }));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('gn_session_v1',
    JSON.stringify({ ts: Date.now(), id: 1, nome: 'T', cargo: 'mestre', loja: 'NOVA AMERICA', permissoes: {} })); });
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS_APP);
    try {
      await page.waitForFunction(() => { try { return typeof sbPushLoja === 'function' && typeof _mergeEstIniAllPorDelta === 'function'; } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  return { ctx, page, patches };
}

// Reproduz o estado de um aparelho depois de um reload (localStorage trouxe as semanas de
// volta; o sbPull só deu baseline às recentes) e empurra pra linha do Boulevard.
const pushComEstado = (page, { local, baseline, vezes }) => page.evaluate(async (cfg) => {
  const saida = [];
  for (let i = 0; i < (cfg.vezes || 1); i++) {
    Object.keys(cfg.local).forEach(k => { estIniAll[k] = { ...cfg.local[k] }; });
    // o que o reload faz com o baseline: zera tudo e deixa o app repovoar
    Object.keys(_estIniAllSync).forEach(k => { delete _estIniAllSync[k]; });
    Object.keys(cfg.baseline || {}).forEach(k => { _estIniAllSync[k] = { ...cfg.baseline[k] }; });
    if (typeof _semearBaselineSemanasFechadas === 'function') _semearBaselineSemanasFechadas();
    await sbPushLoja('BOULEVARD');
    saida.push(JSON.parse(JSON.stringify(estIniAll)));
    // o valor que acabou de ser gravado é o que o próximo ciclo encontra no localStorage
    cfg.local = Object.keys(cfg.local).reduce((a, k) => (a[k] = estIniAll[k], a), {});
  }
  return saida;
}, { local, baseline, vezes });

const gravado = (patches, chave, item) => {
  const p = patches.filter(x => x.u.indexOf('BOULEVARD') > -1).pop();
  const m = p && p.b && p.b.all_data && p.b.all_data.estIniAll && p.b.all_data.estIniAll[chave];
  return m ? m[item] : undefined;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. Semana fechada: nada pra somar, nada pode mudar ───────────────────────────────
  {
    const a = await abrir(browser, { [FECHADA]: { BARRIL: 10 }, [ABERTA]: { BARRIL: 10 } });
    await pushComEstado(a.page, { local: { [FECHADA]: { BARRIL: 10 } }, baseline: {} });
    const v = gravado(a.patches, FECHADA, 'BARRIL');
    check('semana fechada não dobra no push', v === 10, 'nuvem 10, local 10, gravado ' + v);
    await a.ctx.close();
  }

  // ── 2. Três ciclos de reload + push: tem que ficar parado (era 10→20→40→80) ──────────
  {
    const a = await abrir(browser, { [FECHADA]: { BARRIL: 10 } });
    const ciclos = await pushComEstado(a.page, { local: { [FECHADA]: { BARRIL: 10 } }, baseline: {}, vezes: 3 });
    const vals = ciclos.map(c => c[FECHADA].BARRIL);
    check('e não cresce a cada reload + push', vals.every(v => v === 10), 'ciclos: ' + vals.join(' → '));
    await a.ctx.close();
  }

  // ── 3. O delta legítimo continua valendo — é pra isso que a função existe ────────────
  //      baseline 10 (última sincronização), este aparelho somou 3, outro aparelho somou 5.
  {
    const a = await abrir(browser, { [ABERTA]: { CARNE: 15 } });
    await pushComEstado(a.page, { local: { [ABERTA]: { CARNE: 13 } }, baseline: { [ABERTA]: { CARNE: 10 } } });
    const v = gravado(a.patches, ABERTA, 'CARNE');
    check('o que este aparelho somou é reaplicado em cima do outro', v === 18,
      'baseline 10, local 13 (+3), nuvem 15 (+5) → esperado 18, gravado ' + v);
    await a.ctx.close();
  }

  // ── 4. Baixa legítima (consumo) também sobrevive ─────────────────────────────────────
  {
    const a = await abrir(browser, { [ABERTA]: { CARNE: 15 } });
    await pushComEstado(a.page, { local: { [ABERTA]: { CARNE: 6 } }, baseline: { [ABERTA]: { CARNE: 10 } } });
    const v = gravado(a.patches, ABERTA, 'CARNE');
    check('e a baixa também', v === 11, 'baseline 10, local 6 (−4), nuvem 15 → esperado 11, gravado ' + v);
    await a.ctx.close();
  }

  // ── 5. Item digitado aqui, em chave que nunca sincronizou, não pode ser perdido ──────
  {
    const a = await abrir(browser, { [FECHADA]: { OUTRO: 3 } });
    await pushComEstado(a.page, { local: { 'BOULEVARD|2026-07-06': { NOVO: 5 } }, baseline: {} });
    const p = a.patches.filter(x => x.u.indexOf('BOULEVARD') > -1).pop();
    const m = p.b.all_data.estIniAll['BOULEVARD|2026-07-06'];
    check('item novo de chave sem baseline é preservado', m && m.NOVO === 5, JSON.stringify(m));
    check('e o que já estava na nuvem em outra chave fica intacto',
      p.b.all_data.estIniAll[FECHADA] && p.b.all_data.estIniAll[FECHADA].OUTRO === 3);
    await a.ctx.close();
  }

  // ── 6. Semana atual segue sendo aplicada e ganhando baseline no pull ─────────────────
  {
    const a = await abrir(browser, { [FECHADA]: { BARRIL: 10 }, [ABERTA]: { BARRIL: 7 } });
    const e = await a.page.evaluate((ks) => ({
      atualAplicada: !!(estIniAll[ks[1]] && estIniAll[ks[1]].BARRIL === 7),
      baselineAtual: !!_estIniAllSync[ks[1]],
    }), [FECHADA, ABERTA]);
    check('o pull continua aplicando a semana atual', e.atualAplicada);
    check('e dando baseline a ela', e.baselineAtual);
    await a.ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + falhou + ' falhou  [' + LOJAS_APP + ']');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
