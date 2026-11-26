// Chaves da loja batendo entre quem GRAVA e quem LÊ (26/11/2026). Nova Iguaçu mudou de nome,
// mas a chave interna continua "RANCHO" (decisão do dono: não migrar a chave, só vigiar).
// Os vendidos (gn_vendidos_diario.loja) são gravados pela userKey; as contagens de barril pelo
// lojaSlug. Se um dia alguém trocar uma das chaves em gn-lojas-config.js (ou num app), o chopp
// daquela loja fica "sem vendas" calado — esta suíte pega isso, loja por loja, nas 3 telas:
// Painel › Barris, Acompanhamento (Painel e Home da loja) e aba Barris do app Lojas.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };
// As chaves que o BANCO já tem gravadas (conferido em 26/11/2026 direto nas tabelas:
// gn_vendidos_diario.loja e gn_usuarios.loja = userKey · checklist_diario.loja = chkKey ·
// gn_barris_semanal_contagem.loja_slug = slug). Os dados de teste saem daqui, não do
// cadastro — assim, trocar uma chave só no código (sem migrar o histórico) faz a suíte falhar.
const BANCO = [
  ['Bangu', 'BANGU', 'Bangu', 'bangu'], ['Caxias', 'CAXIAS', 'Caxias', 'caxias'], ['São Gonçalo', 'SÃO GONÇALO', 'São Gonçalo', 'sao_goncalo'],
  ['Norte Shopping', 'NORTE SHOPPING', 'Norte Shopping', 'norte_shopping'], ['Boulevard', 'BOULEVARD', 'Boulevard', 'boulevard'],
  ['Nova Iguaçu', 'RANCHO', 'Rancho', 'nova_iguacu'], ['Pedreira', 'PEDREIRA', 'Pedreira', 'pedreira'], ['Nova América', 'NOVA AMERICA', 'Nova América', 'nova_america'],
  ['Campo Grande', 'CAMPO GRANDE', 'Campo Grande', 'campo_grande'], ['Itaquera', 'ITAQUERA', 'Itaquera', 'itaquera'], ['Guarulhos', 'GUARULHOS', 'Guarulhos', 'guarulhos'],
].map(([display, userKey, chkKey, slug]) => ({ display, userKey, chkKey, slug }));
const W1 = '2026-11-16', W = '2026-11-23', QUI = '2026-11-26';
const contDe = slug => [{ loja_slug: slug, semana_inicio: W1, tipo: 'CLARO', status: 'CHEIO', criado_em: W1 + 'T11:00:00+00:00' },
  { loja_slug: slug, semana_inicio: W, tipo: 'CLARO', status: 'CHEIO', criado_em: W + 'T11:00:00+00:00' },
  { loja_slug: slug, semana_inicio: QUI, tipo: 'CLARO', status: 'NA_LINHA_METADE', criado_em: QUI + 'T11:00:00+00:00' }];
const vendDe = loja => ['2026-11-23', '2026-11-24', '2026-11-25'].map(data => ({ loja, data, totais: { chopp_l_claro: 7, chopp_l_vinho: 0 } }));

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const erros = [];
  const abrir = async (arq, pronto) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-26T15:00:00-03:00');
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
    const page = await ctx.newPage(); page.on('pageerror', e => erros.push(String(e.message)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + arq);
      try { await page.waitForFunction(pronto, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw new Error('não carregou ' + arq); }
    }
    return { ctx, page };
  };

  // ── Painel: quem grava (Check-list → gnLojaPorChave(chkKey).userKey) × quem lê ──
  let { ctx, page } = await abrir(HOME, () => { try { return typeof _loadChoppControle === 'function' && !!window.gnAcomp && !!window.GN_LOJAS; } catch (e) { return false; } });
  const h = await page.evaluate(async ({ W1, W, QUI, contSrc, vendSrc, BANCO }) => {
    const contDe = new Function('slug', 'W1', 'W', 'QUI', contSrc), vendDe = new Function('loja', vendSrc);
    const lojas = BANCO;
    // O Check-list (LOJA = chkKey gravado no banco) grava os vendidos com gnLojaPorChave(LOJA).userKey
    // (ver _renderVendidosAba em gn-checklist.html) — tem que dar a chave que já está no banco.
    const grava = l => (window.gnLojaPorChave(l.chkKey) || {}).userKey;
    const cont = [].concat(...lojas.map(l => contDe(l.slug, W1, W, QUI)));
    const vend = [].concat(...lojas.map(l => vendDe(l.userKey)));
    const banco = { 'chopp:contagens': cont, 'chopp:entradas': [], 'chopp:vendidos': vend, 'chopp:respostas': [],
      'acomp:choppCont': cont, 'acomp:choppEnt': [], 'acomp:vendidos': vend };
    window.gnFetchJson = async (url, hd, nome, fb) => nome in banco ? JSON.parse(JSON.stringify(banco[nome])) : (fb === undefined ? [] : fb);
    _choppData = null; await _loadChoppControle();
    const res = await window.gnAcomp.carregar({});
    const naRede = new Set(window.GN_LOJAS.map(x => x.userKey));
    return lojas.map(l => ({ nome: l.display, userKey: l.userKey, cadastrada: naRede.has(l.userKey), grava: grava(l), slugPainel: LOJA_SLUG_HOME[l.userKey], slug: l.slug,
      painel: (((_choppData.porLoja || {})[l.userKey] || {}).acomp || {}).CLARO,
      acomp: ((((res.porLoja || {})[l.userKey] || {}).chopp || {}).acomp || {}).CLARO }))
      .map(x => ({ ...x, painel: x.painel ? x.painel.litros : 'loja fora do Painel', acomp: x.acomp ? x.acomp.litros : 'loja fora do Acompanhamento' }));
  }, { W1, W, QUI, contSrc: 'return (' + contDe.toString() + ')(slug);', vendSrc: 'return (' + vendDe.toString() + ')(loja);', BANCO });
  check('são as 11 lojas (Maglia fora)', h.length === 11, h.map(x => x.nome));
  h.forEach(x => {
    check(`${x.nome}: a chave do banco (${x.userKey}) continua no cadastro`, x.cadastrada, x);
    check(`${x.nome}: o Check-list grava os vendidos com a chave do banco (${x.userKey})`, x.grava === x.userKey, x);
    check(`${x.nome}: o Painel lê as contagens pelo slug do banco (${x.slug})`, x.slugPainel === x.slug, x);
    check(`${x.nome}: chopp vendido chega no Painel › Barris e no Acompanhamento (21 L)`, x.painel === 21 && x.acomp === 21, x);
  });
  await ctx.close();

  // ── App Lojas › Barris: a loja logada lê os próprios vendidos e contagens ──
  ({ ctx, page } = await abrir(LOJAS, () => { try { return typeof _carregarBarrisVisao === 'function' && !!window.gnChoppControle && !!window.GN_LOJAS; } catch (e) { return false; } }));
  const l = await page.evaluate(async ({ W1, W, QUI, contSrc, vendSrc, BANCO }) => {
    const contDe = new Function('slug', 'W1', 'W', 'QUI', contSrc), vendDe = new Function('loja', vendSrc);
    const out = [];
    for (const info of BANCO) {
      const gravaVend = info.userKey;
      // O "banco": só devolve o que bate com o filtro da URL, como o PostgREST.
      sbRequest = async (rota) => {
        const q = decodeURIComponent(rota);
        if (/^gn_barris_semanal_contagem/.test(q)) return contDe(info.slug, W1, W, QUI).filter(r => q.includes('loja_slug=eq.' + r.loja_slug));
        if (/^gn_vendidos_diario/.test(q)) return vendDe(gravaVend).filter(r => q.includes('loja=eq.' + r.loja));
        return [];
      };
      loja = info.userKey; usuarioAtual = { nome: 'Ana', cargo: 'gerente', loja };
      _barrisVisao = null; await _carregarBarrisVisao();
      const r = _barrisVisao && _barrisVisao.j && _barrisVisao.j.acomp && _barrisVisao.j.acomp.CLARO;
      out.push({ nome: info.display, userKey: info.userKey, litros: r ? r.litros : (_barrisVisao && _barrisVisao.j && _barrisVisao.j.acomp) || _barrisVisao });
    }
    return out;
  }, { W1, W, QUI, contSrc: 'return (' + contDe.toString() + ')(slug);', vendSrc: 'return (' + vendDe.toString() + ')(loja);', BANCO });
  l.forEach(x => check(`${x.nome}: no app Lojas, o chopp vendido chega na aba Barris (21 L)`, x.litros === 21, x));
  await ctx.close();
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
