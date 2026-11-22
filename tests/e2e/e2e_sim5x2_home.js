// "No app Check-list temos a aba 5x2 simulação da escala, tem como ver as lojas que fizeram
//  e criar uma msg num card no Home das lojas, lembrando a importância de se planejar, e as
//  lojas que não fizeram nada ainda, pedir mais atenção ainda. Pois começa dia 16/12."
//  (22/11/2026)
//
// Dados reais de gn_escala_simulacao em 22/11: Bangu (16/11), Boulevard (20/10, 4 cenários),
// Norte Shopping (23/10), Nova América (17/11) e Pedreira (19/11) salvaram; Caxias, São
// Gonçalo, Nova Iguaçu, Campo Grande, Itaquera e Guarulhos não.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

const SIM = {
  'Bangu': [{ nome: 'Dezembro 5x2 bangu', criado_por: 'Taynara', atualizado_em: '2026-11-16T22:24:49Z' }],
  'Boulevard': [4, 3, 2, 1].map(n => ({ nome: 'semana ' + n, criado_por: 'Bárbara', atualizado_em: '2026-10-20T21:0' + n + ':00Z' })),
  'Norte Shopping': [{ nome: 'Escala 2', criado_por: 'Felix', atualizado_em: '2026-10-23T17:11:26Z' }],
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const abrir = async (relogio, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, relogio);
    const pedidos = [];
    await ctx.route('**/rest/v1/**', r => {
      const u = decodeURIComponent(r.request().url());
      if (/gn_escala_simulacao/.test(u)) {
        pedidos.push(u);
        if (opts.semRede) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        const loja = (u.match(/loja=eq\.([^&]+)/) || [])[1];
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SIM[loja] || []) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + HOME);
      try { await page.waitForFunction(() => { try { return typeof _irComLoja === 'function' && LOJAS_TODAS; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
      catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
    }
    return { ctx, page, erros, pedidos };
  };
  const ver = (p, loja, cargo, mostrar) => p.page.evaluate(async ({ loja, cargo, mostrar }) => {
    if (typeof _renderSim5x2Home !== 'function') return { semFuncao: true };
    session = { id: 9, nome: 'Fulano', cargo, loja, permissoes: {} };
    masterLoja = null; LOJAS_LISTA = LOJAS_TODAS;
    await _renderSim5x2Home(mostrar !== false, session, false);
    const el = document.getElementById('sim5x2-home-card');
    const c = el && el.querySelector('.sim5x2-home');
    const a = el && el.querySelector('a');
    return { txt: (el ? el.textContent : '').replace(/\s+/g, ' ').trim(), fez: c ? c.dataset.fez : null, href: a ? a.getAttribute('href') : null,
             antigo: !!(el && el.querySelector('.sim5x2-antigo')), largura: document.documentElement.scrollWidth };
  }, { loja, cargo, mostrar });

  const p = await abrir('2026-11-22T10:00:00');
  const semF = await ver(p, 'BANGU', 'gerente');
  if (semF.semFuncao) { console.log('FALHOU: o card da simulação 5x2 não existe neste arquivo'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }

  const bangu = semF;
  check('Bangu (fez): card azul "já simulou", com nome, quem fez e data', bangu.fez === '1' && /A loja já simulou: Dezembro 5x2 bangu · Taynara em 16\/11/.test(bangu.txt), bangu);
  check('Bangu: lembra a importância e pede revisão com a equipe', /revise com a equipe/.test(bangu.txt) && /Faltam 24 dias/.test(bangu.txt), bangu.txt);
  check('Bangu: simulação recente, sem alerta de "antiga"', !bangu.antigo);
  check('o botão leva direto pra aba Simular 5x2 do Check-list', bangu.href === 'gn-checklist.html?tab=sim5x2', bangu.href);
  check('busca pela chave do Check-list (Bangu), uma loja só', p.pedidos.some(u => /gn_escala_simulacao\?loja=eq\.Bangu&/.test(u)), p.pedidos);

  const caxias = await ver(p, 'CAXIAS', 'gerente');
  check('Caxias (não fez): card vermelho pedindo atenção', caxias.fez === '0' && /ainda não fez nenhuma simulação/.test(caxias.txt) && /Precisa de atenção já/.test(caxias.txt) && /a loja ainda não se planejou/.test(caxias.txt), caxias.txt);
  check('Caxias: botão "Fazer a simulação agora"', /Fazer a simulação agora/.test(caxias.txt));

  const boul = await ver(p, 'BOULEVARD', 'sub_gerente');
  check('Boulevard (4 cenários de 20/10): mostra o último e a contagem', /semana 4 · Bárbara em 20\/10 \(4 cenários\)/.test(boul.txt), boul.txt);
  check('Boulevard: simulação de 32 dias → alerta pra revisar (a equipe mudou?)', boul.antigo && /tem 32 dias/.test(boul.txt), boul.txt);

  const na = await ver(p, 'NOVA AMERICA', 'gerente');
  check('Nova América usa a chave "Nova América" do Check-list (acento) na busca', p.pedidos.some(u => /loja=eq\.Nova América&/.test(u)), p.pedidos.slice(-1));

  check('garçom não vê o card (é recado da gerência)', (await ver(p, 'BANGU', 'garcom')).txt === '');
  check('Maglia não vê o card', (await ver(p, 'MAGLIA', 'gerente')).txt === '');
  check('em 390 px, sem rolagem de lado', bangu.largura <= 390, bangu.largura);
  await p.ctx.close();

  const sem = await abrir('2026-11-22T10:00:00', { semRede: true });
  check('sem rede: o card some (não acusa a loja de não ter feito)', (await ver(sem, 'CAXIAS', 'gerente')).txt === '');
  await sem.ctx.close();

  const vespera = await abrir('2026-12-15T10:00:00');
  check('15/12: "Falta 1 dia"', /Falta 1 dia/.test((await ver(vespera, 'CAXIAS', 'gerente')).txt));
  await vespera.ctx.close();
  const dia = await abrir('2026-12-16T10:00:00');
  check('16/12 em diante: o card some', (await ver(dia, 'CAXIAS', 'gerente')).txt === '');
  await dia.ctx.close();

  check('nenhum erro de JavaScript', p.erros.length === 0 && sem.erros.length === 0, p.erros.concat(sem.erros));
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
