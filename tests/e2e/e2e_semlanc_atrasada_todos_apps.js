// Validação da semana (avarias/utensílios), 23/11/2026 — "Pode corrigir" os dois furos:
//  1. a trava só existia na Página Inicial: abrindo outro app direto, a gerência passava;
//  2. só a ÚLTIMA semana fechada era cobrada: na segunda seguinte a semana sem resposta saía
//     da cobrança e ficava pra sempre "—" no Painel.
// Cenário: segunda 30/11. Boulevard não respondeu as avarias de 16/11 (o caso real de hoje);
// a semana 23/11 também está sem avaria. Todas responderam 09/11.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const pub = f => CAMINHOS.pub(f);
const HOME = process.env.ARQ_HOME || pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

function rotas(ctx, cen) {
  return ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = decodeURIComponent(req.url());
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (cen.falhar) return r.abort('internetdisconnected');
    if (/rpc\/verificar_login/.test(u)) { const b = JSON.parse(req.postData() || '{}'); return json(b.p_senha === '1234' ? [{ nome: b.p_nome, cargo: 'gerente' }] : []); }
    if (/gn_lojas\?on_conflict=loja/.test(u) && req.method() === 'POST') { const b = JSON.parse(req.postData() || '{}'); cen.conf[b.loja] = b.all_data; return r.fulfill({ status: 201, body: '' }); }
    if (/gn_lojas\?loja=(in|eq)\.\(?(AVARIAS|UTENSILIOS)_SEM_SEMANA/.test(u)) return json(['AVARIAS_SEM_SEMANA', 'UTENSILIOS_SEM_SEMANA'].filter(l => u.includes(l)).map(l => ({ loja: l, all_data: cen.conf[l] || {} })));
    if (/gn_lojas\?loja=eq\.BOULEVARD/.test(u)) return json([{ all_data: { avariasAll: { BOULEVARD: [] } } }]);
    if (/checklist_diario/.test(u)) return json(cen.chk);   // utensílio lançado em toda semana
    return json([]);
  });
}
const cenario = () => ({
  conf: { AVARIAS_SEM_SEMANA: { '2026-11-09': { BOULEVARD: { nome: 'Ana' } } }, UTENSILIOS_SEM_SEMANA: {} },
  chk: ['2026-11-10', '2026-11-17', '2026-11-24'].map(d => ({ data_operacao: d, manutencao: [{ tipo: 'Utensílio / Louça', situacao: 'Quebrou', qtd: 1 }] })),
});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const erros = [];

  // ── 1. Página Inicial, segunda 30/11 ──
  const cen = cenario();
  let ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-30T10:00:00');
  await rotas(ctx, cen);
  let page = await ctx.newPage(); page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _renderSemLancHome === 'function' && !!window.gnSemLanc; } catch (e) { return false; } }, null, { timeout: 25000 });
  const render = () => page.evaluate(async () => {
    LOJAS_LISTA = ['BOULEVARD']; masterLoja = null; _semLanc = {};
    await _renderSemLancHome(true, { nome: 'Ana', loja: 'BOULEVARD', cargo: 'gerente', permissoes: {} }, false);
    const ov = document.getElementById('sem-lanc-trava');
    return { trava: ov ? ov.textContent.replace(/\s+/g, ' ') : '', card: document.getElementById('avarias-semana-home-card').textContent.replace(/\s+/g, ' ').trim(), sem: _semLanc.avarias && _semLanc.avarias.semIni };
  });
  let r = await render();
  check('segunda 30/11: a semana 16/11 (sem resposta) continua cobrada — não foi trocada pela 23/11', r.sem === '2026-11-16', r);
  check('…e por estar ATRASADA trava já na segunda, dizendo que é atrasada', /Avarias da semana 16\/11 a 22\/11/.test(r.trava) && /Semana atrasada/.test(r.trava), r.trava.slice(0, 300));
  await page.evaluate(() => { _semLanc.avarias.form = true; _semLancPintar(); document.getElementById('semlanc-avarias-user').value = 'Ana'; document.getElementById('semlanc-avarias-senha').value = '1234'; return _semLancConfirmar('avarias'); });
  await page.waitForFunction(() => _semLanc.avarias && _semLanc.avarias.semIni === '2026-11-23', null, { timeout: 8000 }).catch(() => {});
  r = await page.evaluate(() => { const ov = document.getElementById('sem-lanc-trava'); return { trava: ov ? ov.textContent : '', card: document.getElementById('avarias-semana-home-card').textContent.replace(/\s+/g, ' ').trim(), sem: _semLanc.avarias && _semLanc.avarias.semIni }; });
  check('confirmada a 16/11, passa a cobrar a 23/11 (a próxima pendente)', r.sem === '2026-11-23' && cen.conf.AVARIAS_SEM_SEMANA['2026-11-16'].BOULEVARD, r);
  check('…e como a 23/11 é a última fechada e hoje é segunda: só o card, sem trava', r.trava === '' && /Avarias da semana 23\/11 a 29\/11/.test(r.card) && /amanhã o app trava/.test(r.card), r);
  await ctx.close();

  // ── 2. Os outros apps (gn-semlanc-acesso.js), terça 24/11 ──
  const abrir = async (arquivo, cargo, opts) => {
    const c = cenario(); if (opts && opts.falhar) c.falhar = true;
    const x = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(x, (opts && opts.quando) || '2026-11-24T10:00:00');
    await x.addInitScript(([cargo, loja]) => { try { localStorage.setItem('gn_session_v1', JSON.stringify({ id: 9, nome: 'Ana', cargo, loja, permissoes: {}, ts: Date.now() })); } catch (e) {} }, [cargo, (opts && opts.loja) || 'BOULEVARD']);
    await rotas(x, c);
    const p = await x.newPage(); p.on('pageerror', e => erros.push(arquivo + ': ' + String(e)));
    await p.goto('file://' + pub(arquivo));
    await p.waitForTimeout(2500);
    const t = await p.evaluate(() => { const ov = document.getElementById('gn-semlanc-bloqueio'); return ov ? ov.textContent.replace(/\s+/g, ' ') : ''; });
    await x.close();
    return t;
  };
  let t = await abrir('gn-caixa.html', 'gerente');
  check('terça: gerente com as avarias de 16/11 pendentes abre o CAIXA direto e é travado', /Validação da semana pendente/.test(t) && /Avarias da semana 16\/11 a 22\/11/.test(t) && /Página Inicial/.test(t), t.slice(0, 250));
  t = await abrir('gn-checklist.html', 'sub_gerente');
  check('o Check-list também trava (o pendente é avaria, que se lança no app Lojas)', /Validação da semana pendente/.test(t), t.slice(0, 120));
  t = await abrir('gn-lojas.html', 'gerente');
  check('o app Lojas NÃO trava: é onde se lança a avaria', t === '', t.slice(0, 120));
  t = await abrir('gn-caixa.html', 'caixa');
  check('cargo caixa não é travado', t === '', t.slice(0, 120));
  t = await abrir('gn-caixa.html', 'gerente', { loja: 'MAGLIA' });
  check('Maglia fora', t === '', t.slice(0, 120));
  t = await abrir('gn-caixa.html', 'gerente', { falhar: true });
  check('sem rede: não trava (falha aberto)', t === '', t.slice(0, 120));
  t = await abrir('gn-caixa.html', 'gerente', { quando: '2026-11-23T10:00:00' });
  check('segunda 23/11 (a 16/11 é a última fechada): ainda não trava nos outros apps', t === '', t.slice(0, 120));

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
