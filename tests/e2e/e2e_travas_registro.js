// Registro dos bloqueios (26/11/2026) — base do ranking do Painel › 🔒 Bloqueios.
// Cada trava avisa o banco (rpc gn_travas_sync) do que está ativo; o que não está = resolvido.
// Cobra: o helper (Maglia/GERAL fora, só manda quando muda, filtra tipos), e o app Lojas (NF):
// gerente grava; mestre e quem não tem a aba Entradas NÃO gravam (não podem dar baixa no caso).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-30T10:00:00');
  const sync = [];
  await ctx.route('**/rest/v1/**', r => {
    if (/rpc\/gn_travas_sync/.test(r.request().url())) sync.push(JSON.parse(r.request().postData()));
    return r.fulfill({ status: 200, contentType: 'application/json', body: /gn_travas_sync/.test(r.request().url()) ? '0' : '[]' });
  });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof _atualizarTravaNotaFiscal === 'function' && typeof goTab === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  if (!(await page.evaluate(() => typeof window.gnTravasRegistro === 'function'))) {
    console.log('FALHOU: o registro dos bloqueios não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const espera = () => new Promise(r => setTimeout(r, 250));
  // ── Helper ──
  const h = await page.evaluate(async () => {
    const out = {};
    out.maglia = await gnTravasRegistro('t', 'MAGLIA', ['vendidos'], [{ tipo: 'vendidos' }]);
    out.geral = await gnTravasRegistro('t', 'GERAL', ['vendidos'], [{ tipo: 'vendidos' }]);
    out.primeiro = await gnTravasRegistro('t', 'pedreira', ['vendidos', 'carnes'], [{ tipo: 'vendidos', hard: 1, detalhe: 'x' }, { tipo: 'alheio' }]);
    out.repetido = await gnTravasRegistro('t', 'PEDREIRA', ['carnes', 'vendidos'], [{ tipo: 'vendidos', hard: true, detalhe: 'outro texto' }]);
    out.mudou = await gnTravasRegistro('t', 'PEDREIRA', ['vendidos', 'carnes'], []);
    return out;
  });
  await espera();
  check('Maglia e GERAL não gravam', h.maglia === false && h.geral === false && !sync.some(s => /MAGLIA|GERAL/.test(s.p_loja)), sync);
  check('1ª chamada grava, com loja normalizada e só os tipos do app (tipo alheio fica fora)', h.primeiro === true && sync[0] && sync[0].p_loja === 'PEDREIRA' && sync[0].p_ativas.length === 1 && sync[0].p_ativas[0].hard === true, sync[0]);
  check('mesmo conjunto de novo (só o texto mudou): não reenvia', h.repetido === false && sync.length === 2, sync.length);
  check('a trava saiu: envia com ativas vazias (o banco dá baixa)', h.mudou === true && sync[1] && sync[1].p_ativas.length === 0, sync[1]);
  sync.length = 0;

  // ── App Lojas: trava de NF ──
  const nf = (cfg) => page.evaluate(async (cfg) => {
    _entregasVencidasAtivas = []; _barrisSemPendente = false;
    loja = 'NORTE SHOPPING'; usuarioAtual = { nome: 'Ana', cargo: cfg.cargo, loja }; abasPermitidas = cfg.abas || null;
    Object.keys(entradasAll).forEach(k => delete entradasAll[k]);
    sbRequest = async (rota) => /rpc\/gn_nf_semana/.test(rota) ? [{ tipo: 'rec', chave: 'norte_shopping', n: 10, valor: cfg.rec }] : [];
    tab = 'home'; try { render(); } catch (e) {}
    await _atualizarTravaNotaFiscal();
    return _notaFiscalPendenciasAtivas.length;
  }, cfg);
  const trav = await nf({ cargo: 'gerente', rec: 30000 }); await espera();
  const g = sync.filter(s => s.p_app === 'lojas_nf');
  check('gerente com NF faltando: grava nota_fiscal ativa em NORTE SHOPPING', trav === 1 && g.length === 1 && g[0].p_loja === 'NORTE SHOPPING' && g[0].p_tipos.join() === 'nota_fiscal' && g[0].p_ativas[0].tipo === 'nota_fiscal', g);
  sync.length = 0;
  await nf({ cargo: 'mestre', rec: 0 }); await espera();
  check('mestre abrindo a loja NÃO dá baixa no caso', !sync.some(s => s.p_app === 'lojas_nf'), sync);
  await nf({ cargo: 'cozinheiro', rec: 0, abas: ['pedido'] }); await espera();
  check('quem não tem a aba Entradas NÃO dá baixa no caso', !sync.some(s => s.p_app === 'lojas_nf'), sync);
  await nf({ cargo: 'gerente', rec: 0 }); await espera();
  const baixa = sync.filter(s => s.p_app === 'lojas_nf');
  check('gerente depois de resolver: envia ativas vazias (resolvido)', baixa.length === 1 && baixa[0].p_ativas.length === 0, baixa);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
