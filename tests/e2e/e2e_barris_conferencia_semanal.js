// "Podemos gerar um alerta pra isso não ficar acontecendo, talvez a cada virada de semana
//  pedir a confirmação." (18/11/2026) — Nova América tinha 6 barris de vinho ATIVOS na aba
// Barris e a contagem de segunda só 2 com chopp: barril que acaba e ninguém finaliza fica
// pra sempre em acompanhamento.
//
// Cenário = os dados reais da Nova América (contagem 16/11 08:51).
// Cobra: depois da contagem semanal, abre a conferência só pro tipo com barris a mais
// (vinho: 4 recebidos até a contagem × 2 contados), já sugerindo os que não batem com a
// validade contada; os que chegaram DEPOIS da contagem não entram na conta; "Finalizar
// marcados" finaliza só os marcados (+1 vazio cada); "Conferir depois" deixa aviso na aba
// Barris, lido do banco (qualquer aparelho); sem diferença, nada aparece.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

const CLARO = 'd8d457b1-0fb9-4c58-952b-27c175700f1f', VINHO = '60bbc4c5-a781-485b-9454-091d376d124a';
const v = (id, cat, validade, criado) => ({ id, catalogo_id: cat, produto: cat === VINHO ? 'Chopp Vinho Barril c/ 50 litros' : 'Barril Chopp claro 50 litros', validade, status: 'ATIVO', criado_em: criado });
const ATIVOS = [
  v('vin-2711a', VINHO, '2026-11-27', '2026-10-28T13:00:00Z'), v('vin-2711b', VINHO, '2026-11-27', '2026-10-28T13:00:00Z'),
  v('vin-0312', VINHO, '2026-12-03', '2026-11-04T15:48:14Z'), v('vin-1112', VINHO, '2026-12-11', '2026-11-11T15:00:00Z'),
  v('vin-1712a', VINHO, '2026-12-17', '2026-11-18T13:48:08Z'), v('vin-1712b', VINHO, '2026-12-17', '2026-11-18T13:48:08Z'),   // depois da contagem
  ...Array.from({ length: 7 }, (_, i) => v('cla-' + i, CLARO, '2026-11-25', '2026-11-17T15:09:13Z')),                         // depois da contagem
];
const CONTAGEM = [
  { tipo: 'VINHO', status: 'NA_LINHA_METADE', validade: '2026-11-28', criado_em: '2026-11-16T11:51:45Z' },
  { tipo: 'VINHO', status: 'CHEIO', validade: '2026-12-03', criado_em: '2026-11-16T11:51:45Z' },
  { tipo: 'VINHO', status: 'VAZIO', validade: null, criado_em: '2026-11-16T11:51:45Z' },
  { tipo: 'CLARO', status: 'CHEIO', validade: '2026-11-18', criado_em: '2026-11-16T11:51:45Z' },
  { tipo: 'CLARO', status: 'NA_LINHA_METADE', validade: '2026-11-18', criado_em: '2026-11-16T11:51:45Z' },
  { tipo: 'CLARO', status: 'NA_LINHA_METADE', validade: '2026-11-18', criado_em: '2026-11-16T11:51:45Z' },
  { tipo: 'CLARO', status: 'VAZIO', validade: null, criado_em: '2026-11-16T11:51:45Z' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-18T14:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  page.on('dialog', d => d.accept());
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof carregarBarris === 'function' && typeof _confirmarContagemBarrisSemanal === 'function'; } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: o app Lojas não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _barrisConferirComContagem === 'function'))) {
    console.log('FALHOU: a conferência semanal dos barris não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const prep = (ativos, contagem) => page.evaluate(({ ativos, contagem }) => {
    loja = 'NOVA AMERICA'; usuarioAtual = { nome: 'Júlia', cargo: 'estoquista' };
    try { localStorage.clear(); } catch (e) {}
    window.__db = { ativos: JSON.parse(JSON.stringify(ativos)), contagem: contagem, patch: [], vazios: 10 };
    sbRequest = async (rota, opt) => {
      const m = (opt && opt.method) || 'GET'; const b = opt && opt.body ? JSON.parse(opt.body) : null;
      if (/^gn_barris_validade\?loja_slug/.test(rota) && m === 'GET') return window.__db.ativos.filter(x => x.status === 'ATIVO');
      if (/^gn_barris_semanal_contagem\?/.test(rota) && m === 'GET') return window.__db.contagem;
      if (/^gn_barris_validade\?id=eq\./.test(rota) && m === 'PATCH') { const id = rota.match(/id=eq\.([^&]+)/)[1]; window.__db.patch.push({ id, rota, b }); const x = window.__db.ativos.find(a => a.id === id); if (x) x.status = b.status; return null; }
      if (/^gn_barris_vazios\?loja_slug/.test(rota)) return [{ qtd_vazios: window.__db.vazios }];
      if (/^gn_barris_vazios\?on_conflict/.test(rota)) { window.__db.vazios = b.qtd_vazios; return null; }
      return [];
    };
    tab = 'barris';
  }, { ativos, contagem });

  const ler = () => page.evaluate(() => {
    const m = document.getElementById('modalConfBarris');
    return m ? { tipos: [...m.querySelectorAll('.conf-barris-tipo')].map(t => t.dataset.tipo),
      txt: m.innerText.replace(/\s+/g, ' '),
      ids: [...m.querySelectorAll('.conf-barril-chk')].map(i => i.value),
      marcados: [...m.querySelectorAll('.conf-barril-chk:checked')].map(i => i.value) } : null;
  });

  // 1. Logo depois da contagem.
  await prep(ATIVOS, CONTAGEM);
  await page.evaluate(() => _barrisConferirComContagem(false));
  const a = await ler();
  check('abre a conferência só pro vinho (o claro bate: os 7 chegaram depois da contagem)', a && a.tipos.join() === 'VINHO', a);
  check('…mostrando "contados 2 · no app 4 → 2 a mais" (os 2 de hoje, depois da contagem, ficam fora)', a && /Contados com chopp: 2 · no app: 4 → 2 a mais/.test(a.txt) && !a.ids.includes('vin-1712a'), a);
  check('…já marcando os 2 que não batem com a validade contada (27/11), não o de 03/12 que foi contado', a && a.marcados.length === 2 && a.marcados.every(id => /^vin-2711/.test(id)), a);

  // Ajusta: desmarca um 27/11 e marca o de 11/12 — finaliza só o que estiver marcado.
  const f = await page.evaluate(async () => {
    const m = document.getElementById('modalConfBarris');
    m.querySelector('.conf-barril-chk[value="vin-2711b"]').checked = false;
    m.querySelector('.conf-barril-chk[value="vin-1112"]').checked = true;
    await _barrisConfFinalizarMarcados();
    return { patch: window.__db.patch.map(p => ({ id: p.id, st: p.b.status, por: p.b.finalizado_por, so: /status=eq\.ATIVO/.test(p.rota) })), vazios: window.__db.vazios, aberto: !!document.getElementById('modalConfBarris') };
  });
  check('"Finalizar marcados" finaliza só os marcados (27/11 e 11/12), registrando que veio da conferência', f.patch.length === 2 && f.patch.map(p => p.id).sort().join() === 'vin-1112,vin-2711a' && f.patch.every(p => p.st === 'FINALIZADO' && /Júlia \(conferência semanal\)/.test(p.por) && p.so) && !f.aberto, f);
  check('…e soma 1 casco vazio por barril finalizado (10 → 12), igual ao Finalizar normal', f.vazios === 12, f);
  const depois = await page.evaluate(() => _barrisConfAvisoHtml());
  check('depois de finalizar, a diferença some e a aba Barris fica sem aviso', depois === '', depois);

  // 2. "Conferir depois": aviso na aba Barris, lido do banco (aparelho que não fez a contagem).
  await prep(ATIVOS, CONTAGEM);
  await page.evaluate(async () => { await carregarBarris(true); render(); });
  const av = await page.evaluate(() => { const e = document.querySelector('.conf-barris-aviso'); return e ? e.innerText.replace(/\s+/g, ' ') : null; });
  check('outro aparelho (sem localStorage): a aba Barris mostra "Conferência pendente… 2 de vinho a menos"', av && /Conferência pendente/.test(av) && /2 de vinho a menos/.test(av), av);
  await page.evaluate(() => [...document.querySelectorAll('.conf-barris-aviso button')][0].click());
  await page.waitForTimeout(150);
  check('"Conferir agora" reabre a lista', !!(await ler()));
  await page.evaluate(() => document.getElementById('modalConfBarris').remove());

  // 3. Sem diferença: nada.
  await prep(ATIVOS.filter(b => !/^vin-(2711|1112)/.test(b.id)), CONTAGEM);
  await page.evaluate(() => _barrisConferirComContagem(false));
  check('quando bate (2 ativos × 2 contados), não abre nada nem mostra aviso', !(await ler()) && (await page.evaluate(() => _barrisConfAvisoHtml())) === '');

  // 4. Sem contagem da semana (ex.: Maglia, que não conta): nada.
  await prep(ATIVOS, []);
  await page.evaluate(async () => { await carregarBarris(true); });
  check('sem contagem nesta semana: sem aviso', (await page.evaluate(() => _barrisConfAvisoHtml())) === '');

  // 5. A contagem semanal chama a conferência ao confirmar.
  const fonte = require('fs').readFileSync(LOJAS, 'utf8');
  check('confirmar a contagem semanal dispara a conferência', /showToast\('✅ Contagem de barris confirmada!'\);[\s\S]{0,400}_barrisConferirComContagem\(false\)/.test(fonte));

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
