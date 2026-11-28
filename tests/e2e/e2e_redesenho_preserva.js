// Redesenho automático sem atropelar quem está usando (28/11/2026). "Parece que é um padrão,
// não em um lugar, mas em vários":
//  1. Gorjetas › Pool (Campo Grande): o "Valor a distribuir" sumia no meio da digitação — a
//     recarga da nuvem (25 s) redesenhava antes de o campo gravar (só grava ao sair).
//  2. Aviso urgente na loja: a checagem de 15 s reescrevia o aviso e a leitura voltava ao topo.
//  3. Painel › Vendidos: redesenho no fundo apagava a gramatura sendo digitada; e prato novo
//     nascia com ordem que caía no meio/topo da lista.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const COM = process.env.ARQ_COM || CAMINHOS.pub('gn-comissoes.html');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const MANUT = process.env.ARQ_MANUT || CAMINHOS.pub('gn-manutencao.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  // ── 1. Gorjetas › Pool ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, timezoneId: 'America/Sao_Paulo' });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-28T10:00:00-03:00');
    let semana = null;
    await ctx.route('**/rest/v1/**', r => r.request().method() !== 'GET' ? r.fulfill({ status: 204, body: '' })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/gn_comissoes/.test(r.request().url()) && semana ? [{ all_data: semana }] : []) }));
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
    const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
    for (let t = 1; ; t++) { await page.goto('file://' + COM); try { await page.waitForFunction(() => { try { return typeof renderPool === 'function' && typeof carregarDaNuvem === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
    const r = await page.evaluate(() => {
      _syncNow = () => {}; _logAuditoriaCom = () => {};
      LOJA = 'LOJA TESTE'; LOJA_NOME = 'Loja Teste'; usuarioAtual = 'Ana'; abasPermitidas = null;
      const i = calcSemIdxAtual(); const f = { id: 0, nome: 'ANA', tipo: 'CLT / MENSALISTA', dias: Array(7).fill('PRESENTE') };
      state.allData = { [String(i)]: { brutos: [100, 100, 100, 100, 100, 100, 100], funcs: [f], dist: 'SIM', vDist: 0, semIdx: i } };
      state.semIdx = i; state.tab = 'pool';
      ['seletor-loja', 'login'].forEach(id => document.getElementById(id).style.display = 'none');
      document.getElementById('app').style.display = 'flex'; render();
      return JSON.parse(JSON.stringify(state.allData));
    });
    semana = r;
    await page.click('.pool-card input.pi'); await page.keyboard.type('1500');
    await page.evaluate(() => carregarDaNuvem(true)); await page.waitForTimeout(400);
    const g = await page.evaluate(() => { const i = document.querySelector('.pool-card input.pi'); return { v: i.value, foco: document.activeElement === i }; });
    check('Gorjetas: a recarga automática não apaga o "Valor a distribuir" sendo digitado', g.v === '1500' && g.foco, g);
    await page.keyboard.type('0'); await page.keyboard.press('Tab'); await page.waitForTimeout(200);
    const gv = await page.evaluate(() => getWD(state.semIdx).vDist);
    check('…e ao sair do campo grava o valor completo (15000)', gv === 15000, gv);
    check('nenhum erro de JavaScript (Gorjetas)', erros.length === 0, erros);
    await ctx.close();
  }
  // ── 2. Aviso urgente: leitura não volta pro topo ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 600 }, timezoneId: 'America/Sao_Paulo' });
    const longo = 'Atenção equipe: ' + 'leia com calma este comunicado importante sobre o fechamento. '.repeat(40);
    let alertas = [{ id: 1, loja: 'BANGU', motivo: longo, criado_por: 'Tiago', cargos: null, resolvido: false }];
    await ctx.route('**/rest/v1/**', r => {
      const u = r.request().url();
      if (/gn_alertas_urgentes/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(alertas) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
    for (let t = 1; ; t++) { await page.goto('file://' + HOME); try { await page.waitForFunction(() => { try { return typeof _checarAlertaUrgente === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
    const a = await page.evaluate(async () => {
      session = { id: 2, nome: 'Gerente Bangu', cargo: 'gerente', loja: 'BANGU', permissoes: {} };
      await _checarAlertaUrgente('BANGU');
      const ban = document.querySelector('.alerta-urgente-banner'); ban.scrollTop = 300; const antes = ban.scrollTop;
      await _checarAlertaUrgente('BANGU');
      const ban2 = document.querySelector('.alerta-urgente-banner');
      return { antes, depois: ban2.scrollTop, mesmoNo: ban === ban2 };
    });
    check('aviso urgente: a checagem de 15 s não volta a leitura pro topo', a.antes > 0 && a.depois === a.antes, a);
    alertas = alertas.concat([{ id: 2, loja: 'BANGU', motivo: 'Novo aviso', criado_por: 'Tiago', cargos: null, resolvido: false }]);
    const a2 = await page.evaluate(async () => { const ban = document.querySelector('.alerta-urgente-banner'); ban.scrollTop = 250; await _checarAlertaUrgente('BANGU');
      const b = document.querySelector('.alerta-urgente-banner'); return { titulo: b.querySelector('.titulo').textContent, top: b.scrollTop }; });
    check('aviso novo chega: atualiza a lista e mantém onde a pessoa estava lendo', /2 avisos/.test(a2.titulo) && a2.top === 250, a2);
    check('nenhum erro de JavaScript (aviso)', erros.length === 0, erros);
    await ctx.close();
  }
  // ── 3. Painel › Vendidos ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, timezoneId: 'America/Sao_Paulo' });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-28T10:00:00-03:00');
    await ctx.addInitScript(() => { localStorage.setItem('gn_session_v1', JSON.stringify({ ts: Date.now(), id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } })); });
    const gravados = [];
    await ctx.route('**/rest/v1/**', r => { if (r.request().method() !== 'GET') { try { gravados.push(...JSON.parse(r.request().postData())); } catch (e) {} return r.fulfill({ status: 201, body: '' }); }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
    const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
    for (let t = 1; ; t++) { await page.goto('file://' + HOME); try { await page.waitForFunction(() => { try { return typeof _vendCadNovo === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
    await page.waitForTimeout(2500);   // deixa o login/abertura do Painel terminar antes de montar a cena
    await page.evaluate(() => {
      session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
      document.getElementById('home-screen').style.display = 'block'; document.getElementById('dash-section').style.display = 'block';
      const cad = []; for (let i = 0; i < 25; i++) cad.push({ id: 'prato_' + i, grupo: 'prato', nome: 'PRATO ' + i, ativo: true, gramas: { picanha: 200 }, ordem: i < 3 ? 0 : i });
      _vendGerLoaded = true; _vendGerData = { porLoja: {}, iniISO: '2026-11-23', fimISO: '2026-11-29', diasISO: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'], cadastro: cad };
      _vendCadAberto = true; _setDashTab('vendidos'); renderDashboard();
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const c = document.querySelector('.vc-item[data-id="prato_10"] .vc-g'); c.scrollIntoView({ block: 'center' }); c.focus(); c.value = ''; });
    await page.keyboard.type('321');
    const v = await page.evaluate(() => { const y = window.scrollY; renderDashboard(); const c = document.querySelector('.vc-item[data-id="prato_10"] .vc-g');
      return { v: c.value, foco: document.activeElement === c, y0: y, y1: window.scrollY }; });
    check('Painel: redesenho no fundo não apaga a gramatura sendo digitada', v.v === '321' && v.foco, v);
    check('…e a tela fica onde estava', Math.abs(v.y1 - v.y0) <= 1, v);
    const n = await page.evaluate(async () => {
      document.getElementById('vc-novo-nome').value = 'PRATO NOVO'; await _vendCadNovo(); await new Promise(r => setTimeout(r, 200));
      const box = [...document.querySelectorAll('.vc-item')].find(x => x.querySelector('.vc-nome').value === 'PRATO NOVO');
      const q = box ? box.getBoundingClientRect() : null;
      return { visivel: !!q && q.top >= 0 && q.bottom <= window.innerHeight, foco: !!box && box.contains(document.activeElement), novoLimpo: document.getElementById('vc-novo-nome').value === '' };
    });
    const novo = gravados.find(x => x.nome === 'PRATO NOVO');
    check('prato novo vai pro FIM da lista (ordem 25, depois do maior 24)', novo && novo.ordem === 25, novo);
    check('depois de criar, a tela mostra o item novo com o cursor nele e o campo "Nome" limpo', n.visivel && n.foco && n.novoLimpo, n);
    check('nenhum erro de JavaScript (Painel)', erros.length === 0, erros);
    await ctx.close();
  }
  // ── 4. Manutenção: recarga de 2 min com alguém digitando na contagem de utensílios ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, timezoneId: 'America/Sao_Paulo' });
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
    for (let t = 1; ; t++) { await page.goto('file://' + MANUT); try { await page.waitForFunction(() => { try { return typeof carregarDados === 'function' && typeof renderLista === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
    await page.waitForTimeout(1500);   // deixa a abertura do app terminar
    await page.evaluate(() => { S.usuario = S.usuario || { nome: 'Tiago', cargo: 'mestre', loja: 'GERAL' }; document.getElementById('login').style.display = 'none'; document.getElementById('app').classList.remove('hidden');
      document.getElementById('lista').insertAdjacentHTML('beforeend', '<input class="ufield-input" type="number" id="uqtd-teste">'); document.getElementById('uqtd-teste').focus(); });
    await page.keyboard.type('7');
    const pre = await page.evaluate(() => ({ existe: !!document.getElementById('uqtd-teste'), foco: document.activeElement && document.activeElement.id }));
    if (!pre.existe) console.log('   (antes da recarga o campo já tinha sumido: ' + JSON.stringify(pre) + ')');
    await page.evaluate(() => carregarDados()); await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const i = document.getElementById('uqtd-teste'); return { existe: !!i, v: i ? i.value : null, foco: document.activeElement === i }; });
    check('Manutenção: a recarga de 2 min não apaga a contagem sendo digitada', m.existe && m.v === '7' && m.foco, m);
    await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(200);
    const m2 = await page.evaluate(() => !document.getElementById('uqtd-teste'));
    check('…e redesenha assim que a pessoa sai do campo', m2, m2);
    check('nenhum erro de JavaScript (Manutenção)', erros.length === 0, erros);
    await ctx.close();
  }
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
