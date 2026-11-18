// "Colocamos a trava pra quem está de folga da gerência e subs, porém tem uns que, pra
//  driblar a obrigatoriedade, não estão marcando nenhuma folga. Tem que ter ao menos um dia
//  de folga marcado. Quem tiver sem, bloquear desde já." (18/11/2026)
//
// Cobra:
//  · gerente / sub-gerente com a semana sem nenhuma FOLGA → bloqueado ('sem_folga');
//  · "banco de horas" não conta como folga (seria o mesmo drible com outro nome);
//  · NÃO bloqueia: quem tem folga, estoquista/caixa (fora do pedido), semana com férias /
//    afastamento / atestado, escala incompleta, Maglia (regra do projeto), sem vínculo;
//  · a tela explica e tem "Marcar a folga agora": nos outros apps leva pro Check-list; no
//    Check-list abre SÓ a aba Escala — saiu dela sem marcar, a tela volta; marcou, não volta.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

// Quarta 18/11/2026 = semana 45, dia 2.
const HOJE = '2026-11-18', SEM = 45;
const P = 'PRESENTE';
const f = (nome, dias, extra) => Object.assign({ nome, setor: 'Gerência', ferias_ini: '', ferias_fim: '', dias }, extra || {});
const SEMANA = { funcs: [
  f('Junior LIMA', [P, P, P, P, P, P, P]),
  f('Gilda COARITA', [P, P, P, P, P, P, P]),
  f('Jonas CARRILHO', [P, P, P, P, P, P, P]),
  f('Edna JESUS', [P, 'FOLGA', P, P, P, P, P]),
  f('Banco HORAS', [P, P, P, P, P, 'BANCO DE HORAS', P]),
  f('Ferias PARCIAL', [P, P, P, P, 'FÉRIAS', 'FÉRIAS', 'FÉRIAS']),
  f('Atestado SEG', ['ATESTADO', P, P, P, P, P, P]),
  f('Incompleta', [P, P, P]),
] };
const S = (nome, cargo, loja) => ({ id: 500 + nome.length, nome: 'x', loja: loja || 'ITAQUERA', cargo, permissoes: { escala_nome: nome }, ts: Date.now() });

async function abrir(browser, arq, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await CAMINHOS.fixarRelogio(ctx, HOJE + 'T10:00:00');
  const estado = { semana: JSON.parse(JSON.stringify(SEMANA)) };
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (/gn_comissoes/.test(u) && /all_data->/.test(decodeURIComponent(u))) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ [String(SEM)]: estado.semana }]) });
    if (/pgrst\.object/.test(String(r.request().headers()['accept'] || ''))) return r.fulfill({ status: 200, contentType: 'application/vnd.pgrst.object+json', body: 'null' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  if (opts.sessao) await page.addInitScript(s => { localStorage.clear(); localStorage.setItem('gn_session_v1', JSON.stringify(Object.assign({}, s, { ts: Date.now() }))); }, opts.sessao);
  await page.goto('file://' + arq + (opts.hash || ''));
  await page.waitForFunction(() => !!window.gnEscalaAcesso, null, { timeout: 30000 });
  return { ctx, page, erros, estado };
}
const ver = (page, s) => page.evaluate(([s, h]) => gnEscalaAcesso.verificar(s, { hoje: h, semCache: true }), [s, HOJE]);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todos = [];
  const a = await abrir(browser, HOME);
  if (!(await a.page.evaluate(() => typeof gnEscalaAcesso._semFolga === 'function'))) {
    console.log('FALHOU: a trava de escala sem folga não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const r = {};
  for (const [k, s] of Object.entries({
    gerente: S('Junior LIMA', 'gerente'), sub: S('Gilda COARITA', 'sub_gerente'), estoq: S('Jonas CARRILHO', 'estoquista'),
    comFolga: S('Edna JESUS', 'gerente'), banco: S('Banco HORAS', 'gerente'), ferias: S('Ferias PARCIAL', 'gerente'),
    atestado: S('Atestado SEG', 'sub_gerente'), incompleta: S('Incompleta', 'gerente'), maglia: S('Junior LIMA', 'gerente', 'MAGLIA'),
    semVinculo: Object.assign(S('Junior LIMA', 'gerente'), { permissoes: {} }),
  })) r[k] = await ver(a.page, s);
  check('gerente com a semana inteira sem folga: bloqueado', r.gerente.bloqueado && r.gerente.motivo === 'sem_folga', r.gerente);
  check('sub-gerente sem folga: bloqueado', r.sub.bloqueado && r.sub.motivo === 'sem_folga', r.sub);
  check('"banco de horas" não conta como folga: bloqueado', r.banco.bloqueado && r.banco.motivo === 'sem_folga', r.banco);
  check('quem tem folga marcada (outro dia) entra', !r.comFolga.bloqueado, r.comFolga);
  check('estoquista sem folga NÃO é pego (o pedido foi gerência e subs)', !r.estoq.bloqueado, r.estoq);
  check('semana com férias / atestado não exige folga', !r.ferias.bloqueado && !r.atestado.bloqueado, [r.ferias, r.atestado]);
  check('escala incompleta: na dúvida, libera', !r.incompleta.bloqueado, r.incompleta);
  check('Maglia fica fora (não citada)', !r.maglia.bloqueado, r.maglia);
  check('sem vínculo com a escala: não bloqueia (como antes)', !r.semVinculo.bloqueado, r.semVinculo);
  await a.ctx.close();

  // Tela na Home: explica e leva pro Check-list.
  const h = await abrir(browser, HOME, { sessao: S('Junior LIMA', 'gerente') });
  await h.page.waitForSelector('#gn-escala-bloqueio', { timeout: 10000 }).catch(() => {});
  const tela = await h.page.evaluate(() => { const e = document.getElementById('gn-escala-bloqueio'); return e ? { txt: e.innerText.replace(/\s+/g, ' '), marcar: !!e.querySelector('#gn-eb-marcar'), liberar: !!e.querySelector('#gn-eb-abrir') } : null; });
  check('Home: a tela cobre o app e explica "sem folga… pelo menos 1 folga na semana"', tela && /sem folga nesta semana/.test(tela.txt) && /pelo menos 1 folga/.test(tela.txt) && tela.liberar, tela);
  check('…com o botão "Marcar a folga agora"', tela && tela.marcar, tela);
  const [nav] = await Promise.all([
    h.page.waitForRequest(req => /gn-checklist\.html#marcar-folga/.test(req.url()) || /gn-checklist\.html/.test(req.url()), { timeout: 8000 }).catch(() => null),
    h.page.click('#gn-eb-marcar'),
  ]);
  await h.page.waitForTimeout(500);
  check('…que leva pro Check-list pedindo a aba Escala', /gn-checklist\.html#marcar-folga$/.test(h.page.url()) || (nav && /gn-checklist\.html/.test(nav.url())), h.page.url());
  todos.push(...h.erros); await h.ctx.close();

  // No Check-list: abre só a Escala; sair sem marcar traz a tela de volta; marcar resolve.
  const c = await abrir(browser, CHK, { sessao: S('Junior LIMA', 'gerente') });
  await c.page.waitForFunction(() => { try { return typeof switchTab === 'function' && !!document.getElementById('gn-escala-bloqueio'); } catch (e) { return false; } }, null, { timeout: 30000 }).catch(() => {});
  await c.page.click('#gn-eb-marcar').catch(() => {});
  await c.page.waitForTimeout(400);
  const naEscala = await c.page.evaluate(() => ({ aba: typeof _activeTab !== 'undefined' ? _activeTab : null, tela: !!document.getElementById('gn-escala-bloqueio') }));
  check('Check-list: "Marcar a folga agora" fecha a tela e abre a aba Escala', naEscala.aba === 'escala' && !naEscala.tela, naEscala);
  await c.page.evaluate(() => switchTab('dados', document.querySelector('[onclick*="switchTab(\'dados\'"]')));
  await c.page.waitForTimeout(5000);
  const voltou = await c.page.evaluate(() => !!document.getElementById('gn-escala-bloqueio'));
  check('…saiu da Escala sem marcar a folga: a tela volta', voltou);
  await c.page.click('#gn-eb-marcar').catch(() => {});
  await c.page.waitForTimeout(300);
  c.estado.semana.funcs[0].dias = [P, P, P, P, P, P, 'FOLGA'];   // marcou a folga no domingo
  await c.page.evaluate(() => switchTab('dados', document.querySelector('[onclick*="switchTab(\'dados\'"]')));
  await c.page.waitForTimeout(5000);
  const liberou = await c.page.evaluate(() => !!document.getElementById('gn-escala-bloqueio'));
  check('…marcou a folga: sai da Escala e usa o app normalmente', !liberou);
  todos.push(...c.erros.filter(e => !/supabase|fetch|Failed to fetch|NetworkError/i.test(e))); await c.ctx.close();

  check('nenhum erro de JavaScript', todos.length === 0, todos);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
