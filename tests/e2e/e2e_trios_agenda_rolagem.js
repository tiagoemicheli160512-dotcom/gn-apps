// "Ao confirmar a presença por loja, ao clicar volta lá pra cima, aí tenho que descer
//  novamente. No painel de gestão." (22/11/2026, Painel › Trios › Agenda)
//
// Medido: com o card de Pedreira (sáb 21/11) na tela, a página estava em 1659 px e, depois do
// toque em Confirmar, foi pra 414 px — o renderDashboard troca o painel inteiro e a página
// encolhe por um instante. Cobra que Confirmar, desfazer e Editar deixam o card tocado no
// MESMO ponto da tela, e que a confirmação continua gravando na linha certa.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); c ? ok++ : falhou++; };

const LOJAS = ['bangu', 'boulevard', 'caxias', 'guarulhos', 'itaquera', 'norte_shopping', 'nova_america', 'nova_iguacu', 'pedreira', 'sao_goncalo'];
const banco = [];
['2026-11-21', '2026-11-22'].forEach(d => LOJAS.forEach(l => banco.push({ id: d + '-' + l, data: d, loja: l, artista: 'Trio ' + l, cache: 800,
  horario_inicio: '13:00:00', horario_fim: '17:00:00', confirmado: false, presenca_confirmada: true, couver_valor: 500, banda_nao_veio: false })));

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-22T09:47:00');
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_session_v1', JSON.stringify({ id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true }, ts: Date.now() })); } catch (e) {} });
  const patches = [];
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), u = req.url();
    if (/gn_trios_agenda/.test(u) && req.method() === 'PATCH') {
      const id = decodeURIComponent((u.match(/id=eq\.([^&]+)/) || [])[1] || ''); const c = JSON.parse(req.postData() || '{}');
      patches.push({ id, c });
      const i = banco.findIndex(x => x.id === id); if (i < 0) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      banco[i] = { ...banco[i], ...c };
      await new Promise(res => setTimeout(res, 300));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([banco[i]]) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: /gn_trios_agenda/.test(u) ? JSON.stringify(banco) : '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return document.getElementById('dash-section').style.display !== 'none' && typeof _triosAgConfirmar === 'function'; } catch (e) { return false; } }, null, { timeout: 40000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: o Painel não abriu'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  await page.waitForTimeout(1500);
  await page.evaluate(async () => { _dashTab = 'trios'; _triosVista = 'agenda'; renderDashboard(); await _loadTriosAgenda(); });
  await page.waitForTimeout(800);

  const card = id => `.trio-ag-item[data-id="${id}"]`;
  const pos = id => page.evaluate(s => ({ y: Math.round(window.scrollY), top: Math.round(document.querySelector(s).getBoundingClientRect().top) }), card(id));
  const ir = async id => { await page.locator(card(id)).scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 150)); await page.waitForTimeout(200); };
  const botao = (id, txt) => page.locator(card(id) + ' button', { hasText: txt }).first();

  const ID = '2026-11-21-pedreira';
  await ir(ID);
  const a0 = await pos(ID);
  check('o card de Pedreira está bem abaixo do topo (cenário do print)', a0.y > 1000, a0);
  await botao(ID, 'Confirmar').click();
  await page.waitForFunction(s => /Confirmado/.test(document.querySelector(s + ' button').textContent), card(ID), { timeout: 10000 });
  await page.waitForTimeout(400);
  const a1 = await pos(ID);
  check('Confirmar: a tela fica onde estava (o card não sai do lugar)', Math.abs(a1.top - a0.top) <= 2 && Math.abs(a1.y - a0.y) <= 2, { antes: a0, depois: a1 });
  check('e grava a confirmação na linha certa', patches.length === 1 && patches[0].id === ID && patches[0].c.confirmado === true && patches[0].c.confirmado_por === 'Tiago', patches);

  const ID2 = '2026-11-22-nova_iguacu';
  await ir(ID2);
  const b0 = await pos(ID2);
  await botao(ID2, 'Confirmar').click();
  await page.waitForFunction(s => /Confirmado/.test(document.querySelector(s + ' button').textContent), card(ID2), { timeout: 10000 });
  await page.waitForTimeout(400);
  const b1 = await pos(ID2);
  check('segunda confirmação em seguida, noutro ponto da lista: também não pula', Math.abs(b1.top - b0.top) <= 2, { antes: b0, depois: b1 });

  await botao(ID2, 'Confirmado').click();
  await page.waitForFunction(s => /^Confirmar$/.test(document.querySelector(s + ' button').textContent.trim()), card(ID2), { timeout: 10000 });
  await page.waitForTimeout(400);
  const b2 = await pos(ID2);
  check('desfazer a confirmação: não pula', Math.abs(b2.top - b0.top) <= 2, { antes: b0, depois: b2 });

  await botao(ID, 'Editar').click();
  await page.waitForTimeout(400);
  const a2 = await pos(ID);
  check('Editar abre no lugar, sem levar pro topo', Math.abs(a2.top - a0.top) <= 2 || (a2.top >= 0 && a2.top < 844 && a2.y > 1000), { antes: a0, depois: a2 });

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
