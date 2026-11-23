// Contagem semanal de barris: uma por loja e rodada (23/11/2026).
// Boulevard, 23/11: João (09:51) e Leandro (10:00) lançaram a contagem de segunda, cada um no
// seu aparelho, e o banco SOMOU as duas (CO2 2 cheios/4 vazios em vez de 1/2; chopp também).
// Nova América já tinha tido o mesmo em 02/11 (Júlia 08:43 e 08:44) e 12/10 (Júlia + Ramos).
// Agora a confirmação e as linhas vão juntas numa função do banco que recusa a segunda.
// Cobra: o envio é UMA chamada (rpc) com confirmação + linhas; quando o banco responde
// "já lançada" por OUTRA pessoa, a tela avisa quem/quando, diz que a sua não foi gravada e
// libera a loja; quando é a MESMA pessoa (resposta perdida e reenvio), só confirma.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-23T10:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + LOJAS);
  await page.waitForFunction(() => { try { return typeof _confirmarContagemBarrisSemanal === 'function' && typeof _renderTravaBarrisSemanal === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });

  const lancar = (resposta, quem) => page.evaluate(async ({ resposta, quem }) => {
    usuarioAtual = { nome: quem, cargo: 'estoquista', loja: 'BOULEVARD' }; loja = 'Boulevard';
    _barrisSemPendente = true; _barrisSemRodada = 'SEG'; _barrisSemSemanaIni = '2026-11-23'; _barrisSemComparativo = null;
    _barrisSemItens = { CLARO: [{ status: 'CHEIO', validade: '2026-12-10' }, { status: 'VAZIO', validade: null }], VINHO: [] };
    _barrisSemSemVazios = false; _barrisSemCo2 = { cheio: '1', vazio: '2' };
    const reqs = []; window.sbRequest = (url, opt) => { reqs.push({ url, body: opt && opt.body ? JSON.parse(opt.body) : null }); return Promise.resolve(/gn_barris_semanal_registrar/.test(url) ? resposta : []); };
    let alerta = null; window.alert = m => { alerta = String(m); };
    const toasts = []; window.showToast = m => toasts.push(String(m));
    window.confirm = () => true;
    await _confirmarContagemBarrisSemanal();
    return { reqs, alerta, toasts, pendente: _barrisSemPendente, overlay: !!document.getElementById('barris-semanal-trava-overlay') };
  }, { resposta, quem });

  // 1. Primeiro lançamento (João): uma chamada, com tudo dentro
  const a = await lancar({ ok: true }, 'João');
  const rpc = a.reqs.filter(r => /gn_barris_semanal_registrar/.test(r.url));
  check('o envio é UMA chamada à função do banco (confirmação + linhas juntas)', rpc.length === 1 && !a.reqs.some(r => /^gn_barris_semanal_(contagem|confirmacao)/.test(r.url)), a.reqs.map(r => r.url));
  const b0 = (rpc[0] || {}).body || {};
  check('com loja, semana, rodada, quem e as 5 linhas (2 barris + 3 cilindros de CO2)', b0.p_loja_slug === 'boulevard' && b0.p_semana === '2026-11-23' && b0.p_rodada === 'SEG' && b0.p_por === 'João' && (b0.p_linhas || []).length === 5 && b0.p_linhas.filter(l => l.tipo === 'CO2').length === 3, b0);
  check('e libera a loja', a.pendente === false && !a.overlay, a);

  // 2. Segundo aparelho (Leandro) com a tela aberta: o banco recusa
  const b = await lancar({ ok: false, ja_lancada: true, por: 'João', em: '2026-11-23T12:51:37Z' }, 'Leandro');
  check('Leandro: aviso dizendo que já foi lançada por João, às 09:51', /já foi lançada por João/.test(b.alerta || '') && /09:51/.test(b.alerta), b.alerta);
  check('…que a dele NÃO foi gravada e que correção é com a supervisão', /NÃO foi gravada/.test(b.alerta || '') && /supervisão/.test(b.alerta), b.alerta);
  check('…e a loja é liberada mesmo assim (a contagem existe)', b.pendente === false && !b.overlay, b);
  check('…sem nenhuma outra gravação', b.reqs.length === 1, b.reqs.map(r => r.url));

  // 3. Mesma pessoa reenviando (resposta perdida): só confirma, sem susto
  const c = await lancar({ ok: false, ja_lancada: true, por: 'Júlia', em: '2026-11-03T11:43:00Z' }, 'Júlia');
  check('Júlia reenviando: "sua contagem já estava salva", sem alerta', !c.alerta && c.toasts.some(t => /já estava salva/.test(t)) && c.pendente === false, c);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
