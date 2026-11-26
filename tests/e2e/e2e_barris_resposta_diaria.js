// ETAPA 3 (26/11/2026) — app Lojas › Barris: pergunta diária + visão do Painel (só leitura).
// "Todos os dias, o aplicativo deverá perguntar ao estoquista se algum barril foi
//  finalizado (...) No final de semana, essa confirmação também deverá aparecer para o
//  gerente e o subgerente." Decisões do dono: uma vez por dia, a primeira resposta resolve,
//  sem trava (só registro).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

async function abrir(browser, iso) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, iso);
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  page.__erros = []; page.on('pageerror', e => page.__erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof goTab === 'function' && typeof render === 'function'; } catch (e) { return false; } }, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const erros = [];
  // Quinta 26/11/2026.
  let { ctx, page } = await abrir(browser, '2026-11-26T10:00:00');
  if (!(await page.evaluate(() => typeof _checarBarrisRespostaDiaria === 'function'))) {
    console.log('FALHOU: a pergunta diária não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const perguntar = (cfg) => page.evaluate(async (cfg) => {
    loja = cfg.loja || 'PEDREIRA';
    usuarioAtual = { nome: 'Luiz', cargo: cfg.cargo || 'estoquista', loja: cfg.lojaUser || 'PEDREIRA' };
    abasPermitidas = cfg.abas === undefined ? null : cfg.abas;
    document.getElementById('modalBarrisResposta')?.remove();
    try { sessionStorage.removeItem('gn_barris_resp_adiada'); if (cfg.adiada) sessionStorage.setItem('gn_barris_resp_adiada', 'pedreira|' + _barrisRespDia()); } catch (e) {}
    window.__reqs = [];
    sbRequest = async (rota, opt) => { window.__reqs.push({ rota, m: (opt && opt.method) || 'GET', h: (opt && opt.headers) || {}, b: opt && opt.body ? JSON.parse(opt.body) : null });
      if (/gn_barris_resposta_diaria\?loja_slug/.test(rota)) return cfg.jaRespondeu ? [{ resposta: 'NAO' }] : [];
      return []; };
    _barrisRespHoje = undefined;
    await _checarBarrisRespostaDiaria();
    return !!document.getElementById('modalBarrisResposta');
  }, cfg);

  check('quinta: o estoquista recebe a pergunta "algum barril acabou?"', await perguntar({}));
  check('quinta: gerente e subgerente não (só no fim de semana)', !(await perguntar({ cargo: 'gerente' })) && !(await perguntar({ cargo: 'sub_gerente' })));
  check('mestre/supervisão e quem não tem a aba Barris não recebem', !(await perguntar({ cargo: 'mestre', lojaUser: 'GERAL' })) && !(await perguntar({ abas: ['pedido'] })));
  check('Maglia não recebe (não foi citada)', !(await perguntar({ loja: 'MAGLIA' })));
  check('loja que já respondeu hoje não é perguntada de novo (uma vez por dia)', !(await perguntar({ jaRespondeu: true })));
  check('"Responder depois" vale pra sessão: não pergunta de novo', !(await perguntar({ adiada: true })));

  // Responder NÃO: grava a primeira resposta do dia, sem sobrescrever outra (ignore-duplicates).
  await perguntar({});
  const nao = await page.evaluate(async () => {
    showToast = t => { window.__toast = t; };
    await _barrisResponder('NAO');
    const post = window.__reqs.find(r => r.m === 'POST');
    return { post, modal: !!document.getElementById('modalBarrisResposta'), toast: window.__toast };
  });
  check('"Não, nenhum": grava NAO do dia (loja, data, quem, cargo) e fecha', nao.post && /on_conflict=loja_slug,dia/.test(nao.post.rota) && /ignore-duplicates/.test(nao.post.h.Prefer) && nao.post.b.resposta === 'NAO' && nao.post.b.dia === '2026-11-26' && nao.post.b.loja_slug === 'pedreira' && nao.post.b.respondido_por === 'Luiz' && nao.post.b.cargo === 'estoquista' && !nao.modal, nao);

  // Responder SIM: vai pra aba Barris pra dar baixa; ao finalizar, o dia vira SIM com a quantidade.
  await perguntar({});
  const sim = await page.evaluate(async () => {
    const orig = carregarBarris; carregarBarris = async () => {}; _carregarBarrisVisao = async () => {};
    _barrisRespSim();
    const foi = tab;
    barrisAtivos = [{ id: 'b1', catalogo_id: null, produto: 'Barril Chopp claro 50 litros', validade: '2026-12-20', status: 'ATIVO' }];
    window.__reqs = [];
    sbRequest = async (rota, opt) => { window.__reqs.push({ rota, m: (opt && opt.method) || 'GET', h: (opt && opt.headers) || {}, b: opt && opt.body ? JSON.parse(opt.body) : null });
      if (/gn_barris_validade\?loja_slug.*FINALIZADO/.test(rota)) return [{ id: 'b1' }, { id: 'b0' }];
      return []; };
    _ajustarBarrisVaziosAuto = async () => {};
    await _confirmarFinalizarBarril('b1');
    carregarBarris = orig;
    const post = window.__reqs.find(r => r.m === 'POST' && /gn_barris_resposta_diaria/.test(r.rota));
    return { foi, pendenteAntes: true, post, patch: window.__reqs.find(r => r.m === 'PATCH'), pendenteDepois: _barrisRespSimPendente };
  });
  check('"Sim": abre a aba Barris pra dar baixa', sim.foi === 'barris', sim);
  check('finalizar o barril grava o dia como SIM com quantos acabaram hoje (2), por cima de um NÃO anterior', sim.post && /merge-duplicates/.test(sim.post.h.Prefer) && sim.post.b.resposta === 'SIM' && sim.post.b.finalizados === 2 && sim.patch && /FINALIZADO/.test(JSON.stringify(sim.patch.b)) && !sim.pendenteDepois, sim);
  await ctx.close();

  // Sábado: gerente e subgerente também.
  ({ ctx, page } = await abrir(browser, '2026-11-28T10:00:00'));
  check('sábado: gerente e subgerente recebem a pergunta', (await perguntar({ cargo: 'gerente' })) && (await perguntar({ cargo: 'sub_gerente' })));
  check('…e o estoquista continua recebendo', await perguntar({}));
  check('…caixa/garçom não', !(await perguntar({ cargo: 'caixa' })));

  // A aba Barris mostra a visão do Painel (só leitura) e a resposta de hoje.
  const aba = await page.evaluate(async () => {
    loja = 'PEDREIRA'; usuarioAtual = { nome: 'Luiz', cargo: 'estoquista', loja: 'PEDREIRA' }; abasPermitidas = null;
    const C = (s, t, st, em) => ({ semana_inicio: s, tipo: t, status: st, criado_em: em });
    sbRequest = async (rota) => {
      if (/gn_barris_semanal_contagem/.test(rota)) return [C('2026-11-16', 'CLARO', 'CHEIO', '2026-11-16T13:00:00Z'), C('2026-11-16', 'CLARO', 'CHEIO', '2026-11-16T13:00:00Z'),
        C('2026-11-23', 'CLARO', 'NA_LINHA_METADE', '2026-11-23T13:00:00Z'), C('2026-11-26', 'CLARO', 'NA_LINHA_ABAIXO_METADE', '2026-11-26T13:00:00Z')];
      if (/gn_vendidos_diario/.test(rota)) return [];
      if (/gn_barris_resposta_diaria/.test(rota)) return [{ dia: '2026-11-27', resposta: 'NAO', finalizados: 0, respondido_por: 'Luiz' }, { dia: '2026-11-25', resposta: 'SIM', finalizados: 1, respondido_por: 'Ana' }];
      return [];
    };
    await _carregarBarrisVisao();
    barrisAtivos = []; _barrisRespHoje = null; _barrisRespSimPendente = false;
    tab = 'barris'; render();
    const vis = document.querySelector('.barris-visao'), hoje = document.querySelector('.barris-resp-hoje');
    return { vis: vis ? vis.textContent.replace(/\s+/g, ' ') : '', hoje: hoje ? hoje.textContent.replace(/\s+/g, ' ') : '',
      dias: [...document.querySelectorAll('.barris-resp-dia')].map(x => x.dataset.r), temInput: vis ? !!vis.querySelector('input,select') : null };
  });
  check('aba Barris: mostra o controle do chopp do Painel (só consulta, sem campo editável)', /Controle do chopp/.test(aba.vis) && /só consulta/.test(aba.vis) && aba.temInput === false, aba);
  check('…e as respostas dos últimos 7 dias (✓ / 🍺 / — sem resposta)', aba.dias.length === 7 && aba.dias.includes('NAO') && aba.dias.includes('SIM') && aba.dias.includes(''), aba.dias);
  check('sem resposta hoje: a aba mostra os dois botões pra responder ali mesmo', /Algum barril acabou hoje\?/.test(aba.hoje), aba.hoje);
  erros.push(...page.__erros);
  await ctx.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
