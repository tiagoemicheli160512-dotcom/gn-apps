// "No app lojas temos a aba avarias, porém tem loja que não tá fazendo 100%. Precisamos
//  colocar ao final de cada semana, ou seja na segunda-feira, a confirmação de lojas que não
//  colocaram nada, a validação da gerência ou sub." (16/11/2026)
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-16T09:00:00');   // segunda: semana fechada 09/11–15/11
  let avarias = [], conf = {}, falharLoja = false;
  const gravou = [];
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), u = decodeURIComponent(req.url());
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/rpc\/verificar_login/.test(u)) {
      const b = JSON.parse(req.postData() || '{}');
      if (b.p_senha !== '1234') return json([]);
      return json([{ nome: b.p_nome, cargo: b.p_nome === 'Julio' ? 'garcom' : 'sub_gerente' }]);
    }
    if (/gn_lojas\?on_conflict=loja/.test(u) && req.method() === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); gravou.push(b); if (b.loja === 'AVARIAS_SEM_SEMANA') conf = b.all_data;
      return r.fulfill({ status: 201, body: '' });
    }
    if (/gn_lojas\?loja=eq\.AVARIAS_SEM_SEMANA/.test(u)) return json([{ all_data: conf }]);
    if (/gn_lojas\?loja=eq\./.test(u)) {
      if (falharLoja) return r.abort('internetdisconnected');
      return json([{ all_data: { avariasAll: { BANGU: avarias } } }]);
    }
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _homeMarcar === 'function' && typeof LOJAS_LISTA !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 25000 });
  if (!(await page.evaluate(() => typeof _renderAvariasSemanaHome === 'function'))) {
    console.log('FALHOU: a validação semanal de avarias não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const render = (loja) => page.evaluate(async (loja) => {
    LOJAS_LISTA = ['BANGU', 'MAGLIA']; masterLoja = null; _avSemEstado = null;
    await _renderAvariasSemanaHome(true, { nome: 'X', loja, cargo: 'caixa', permissoes: {} }, false);
    const el = document.getElementById('avarias-semana-home-card');
    return { txt: el.textContent.replace(/\s+/g, ' ').trim(), estado: el.dataset.homeEstado, info: el.dataset.homeInfo };
  }, loja);

  // Semana sem nada lançado (só uma cancelada e uma fora da semana).
  avarias = [{ ts: '2026-11-12T10:00:00', status: 'cancelado', valorTotal: 50 }, { ts: '2026-11-03T10:00:00', status: 'finalizado', valorTotal: 30 }];
  let r = await render('BANGU');
  check('segunda 16/11, Bangu sem avaria lançada em 09/11–15/11: aparece a cobrança', /Avarias da semana 09\/11 a 15\/11: nenhuma lançada/.test(r.txt), r.txt);
  check('…com as duas saídas: lançar no app Lojas ou a gerência confirmar que não houve', /Lançar avaria/.test(r.txt) && /Não houve avaria/.test(r.txt), r.txt);
  check('…e entra em "Precisa de você hoje" como urgente', r.estado === 'acao' && /"urgente":true/.test(r.info), r);

  // Confirmação: senha errada, cargo errado, gerência certa.
  await page.evaluate(() => { _avSemEstado.form = true; _avSemPintar(); });
  await page.evaluate(([u, p]) => { document.getElementById('avsem-user').value = u; document.getElementById('avsem-senha').value = p; return _avSemConfirmar(); }, ['Carol', 'errada']); await page.waitForTimeout(400);
  let t = await page.evaluate(() => document.getElementById('avarias-semana-home-card').textContent);
  check('senha errada: não registra', /incorretos/.test(t) && gravou.length === 0, t.slice(0, 200));
  await page.evaluate(([u, p]) => { document.getElementById('avsem-user').value = u; document.getElementById('avsem-senha').value = p; return _avSemConfirmar(); }, ['Julio', '1234']); await page.waitForTimeout(400);
  t = await page.evaluate(() => document.getElementById('avarias-semana-home-card').textContent);
  check('garçom não pode confirmar (é da gerência ou sub)', /gerência ou da sub-gerência/.test(t) && gravou.length === 0, t.slice(0, 200));
  await page.evaluate(([u, p]) => { document.getElementById('avsem-user').value = u; document.getElementById('avsem-senha').value = p; return _avSemConfirmar(); }, ['Carol', '1234']); await page.waitForTimeout(500);
  t = await page.evaluate(() => document.getElementById('avarias-semana-home-card').textContent.trim());
  check('sub-gerente confirma: grava a semana 09/11 de Bangu com nome e cargo', gravou.length === 1 && conf['2026-11-09'] && conf['2026-11-09'].BANGU && conf['2026-11-09'].BANGU.nome === 'Carol' && conf['2026-11-09'].BANGU.cargo === 'sub_gerente', conf);
  check('…e o card some', t === '', t);
  r = await render('BANGU');
  check('reabrindo a Home depois de confirmar: não cobra de novo', r.txt === '', r.txt);

  // Loja que lançou avaria na semana não é cobrada.
  conf = {}; avarias = [{ ts: '2026-11-14T20:00:00', status: 'pendente', valorTotal: 80 }];
  r = await render('BANGU');
  check('loja que lançou avaria na semana não vê cobrança', r.txt === '', r.txt);

  // Domingo 15/11 às 22h (01h UTC de segunda): pela semana gravada, é da semana 09/11.
  avarias = [{ ts: '2026-11-16T01:00:00.000Z', semana: '2026-11-09', status: 'pendente', valorTotal: 40 }];
  r = await render('BANGU');
  check('avaria lançada domingo à noite (ts já em segunda no UTC) conta na semana certa', r.txt === '', r.txt);

  // Transferência paga em dinheiro não conta como avaria.
  avarias = [{ ts: '2026-11-14T20:00:00', status: 'finalizado', tipo: 'transferencia_dinheiro', valorTotal: 80 }];
  r = await render('BANGU');
  check('transferência paga em dinheiro não conta como avaria (continua cobrando)', /nenhuma lançada/.test(r.txt), r.txt);

  r = await render('MAGLIA');
  check('Maglia fica fora (não citada)', r.txt === '', r.txt);

  falharLoja = true; avarias = [];
  r = await render('BANGU');
  check('sem internet pra ler as avarias: não cobra (falha aberto)', r.txt === '', r.txt);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
