// "Perdemos muito da tela por causa do cabeçalho, que ao rolar mantém a aba atual e todo o
//  cabeçalho" (print da Pedreira, 12/11/2026). O dono escolheu: enxugar + esconder ao rolar.
//
// Medido no celular (390 px): o cabeçalho fixo tinha 144 px enquanto se rolava e 400 px no
// topo — o nome quebrava em duas linhas ("GN / Pedreira"), o v111 numa terceira, "Salvo às
// 13:15" aparecia duas vezes e os quatro botões tinham texto.
//
// Cobra:
//   1. nome e versão numa linha; botões só com ícone (e com nome pra leitor de tela);
//   2. "Salvo" uma vez só — mas nunca some sozinho, e "Sem conexão"/"Salvando" sempre aparecem;
//   3. some ao rolar pra baixo, volta ao rolar pra cima, e fica no topo da página;
//   4. NUNCA some com falha de conexão ou de salvamento — e uma falha traz ele de volta;
//   5. no computador (≥ 768 px) não some; 320 px sem rolagem de lado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };
const espera = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-11T15:00:00');
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); localStorage.setItem('gn_aviso_guia_v1', '1'); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try { return typeof setSyncStatus === 'function' && typeof _chkHdrRolagem === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  await page.evaluate(() => { hideLogin(); LOJA = 'Pedreira'; state.data = '2026-11-11';
    document.getElementById('header-loja-nome').textContent = 'GN Pedreira';
    document.querySelectorAll('body > div').forEach(d => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && parseInt(cs.zIndex) >= 900) d.style.display = 'none'; });
    initAllStates(); restoreUI();
    document.querySelectorAll('details.dados-grupo').forEach(d => d.open = true);   // página com rolagem de verdade
  });
  const hdr = () => page.evaluate(() => { const h = document.getElementById('chk-header'); const r = h.getBoundingClientRect();
    return { bottom: Math.round(r.bottom), oculto: document.body.classList.contains('chk-hdr-oculto'), transform: getComputedStyle(h).transform }; });
  const rolar = async (y) => { await page.evaluate(y => window.scrollTo(0, y), y); await espera(120); };

  // ══ 1. Uma linha ═══════════════════════════════════════════════════════════════════
  const lin = await page.evaluate(() => {
    const n = document.getElementById('header-loja-nome').getBoundingClientRect(), v = document.querySelector('.chk-hdr-ver').getBoundingClientRect();
    const lbls = [...document.querySelectorAll('.chk-hdr-lbl')];
    const btns = [...document.querySelectorAll('.chk-hdr-botoes > button')];
    return { mesmaLinha: Math.abs(n.top - v.top) < 6 && n.height < 24, lblsOcultos: lbls.length >= 2 && lbls.every(l => getComputedStyle(l).display === 'none'),
      nomes: btns.every(b => b.getAttribute('aria-label') || b.title), alvo: btns.every(b => b.getBoundingClientRect().height >= 34) };
  });
  check('nome da loja e versão numa linha só', lin.mesmaLinha, JSON.stringify(lin));
  check('no celular os botões ficam só com ícone', lin.lblsOcultos);
  check('…mas cada um tem nome (leitor de tela / dica) e alvo de toque decente', lin.nomes && lin.alvo, JSON.stringify(lin));

  // ══ 2. "Salvo" uma vez só ══════════════════════════════════════════════════════════
  const dup = await page.evaluate(() => {
    const lb = document.getElementById('sync-label'), ind = document.getElementById('last-save-indicator');
    const vis = el => getComputedStyle(el).display !== 'none';
    ind.style.display = 'none'; ind.textContent = '';
    setSyncStatus('online', 'Salvo ✓ 13:15'); const semInd = vis(lb);
    ind.textContent = '✓ Salvo às 13:15'; ind.style.display = 'block'; _chkSyncDupAtualizar(); const comInd = vis(lb);
    setSyncStatus('syncing', 'Salvando...'); const salvando = vis(lb);
    setSyncStatus('offline', '⚠️ Sem conexão — tentando de novo'); const offline = vis(lb);
    setSyncStatus('online', 'Conectado ✓'); const conectado = vis(lb);
    return { semInd, comInd, salvando, offline, conectado };
  });
  check('sem o "✓ Salvo às" ao lado, o "Salvo" do status continua aparecendo', dup.semInd, JSON.stringify(dup));
  check('com os dois, o repetido some (fica um só)', !dup.comInd, JSON.stringify(dup));
  check('"Salvando…", "Sem conexão" e "Conectado" sempre aparecem', dup.salvando && dup.offline && dup.conectado, JSON.stringify(dup));

  // ══ 3. Some ao descer, volta ao subir ══════════════════════════════════════════════
  await page.evaluate(() => setSyncStatus('online', 'Salvo ✓ 13:15'));
  await rolar(0); let h = await hdr();
  check('no topo da página o cabeçalho aparece', !h.oculto && h.bottom > 0, JSON.stringify(h));
  await rolar(300); await rolar(700); await espera(300); h = await hdr();
  check('rolando pra baixo, o cabeçalho sai da tela', h.oculto && h.bottom <= 1, JSON.stringify(h));
  await rolar(670); await rolar(630); await espera(300); h = await hdr();
  check('rolando um pouco pra cima, ele volta', !h.oculto && h.bottom > 30, JSON.stringify(h));
  await rolar(640); await rolar(645); h = await hdr();
  check('tremida pequena do dedo (poucos px) não esconde de novo', !h.oculto, JSON.stringify(h));
  check('esconder não muda a altura da página (só transform)', await page.evaluate(() => { const a = document.documentElement.scrollHeight; document.body.classList.add('chk-hdr-oculto'); const b = document.documentElement.scrollHeight; document.body.classList.remove('chk-hdr-oculto'); return a === b; }));

  // ══ 4. Falha nunca fica escondida ══════════════════════════════════════════════════
  await rolar(900); await rolar(1300); await espera(300);
  check('(controle) escondido depois de rolar', (await hdr()).oculto);
  await page.evaluate(() => setSyncStatus('offline', '⚠️ Sem conexão — tentando de novo')); await espera(300); h = await hdr();
  check('caiu a conexão: o cabeçalho volta na hora, sem precisar rolar', !h.oculto && h.bottom > 30, JSON.stringify(h));
  await rolar(1600); await rolar(2000); h = await hdr();
  check('sem conexão, rolar pra baixo não esconde', !h.oculto, JSON.stringify(h));
  await page.evaluate(() => { setSyncStatus('online', 'Conectado ✓'); try { localStorage.setItem('gn_cl_last_err_' + LOJA, 'HTTP 500'); } catch (e) {} _updateLastSaveIndicator(); });
  await rolar(2300); await rolar(2700); h = await hdr();
  check('com "Não salvou" na tela, rolar pra baixo não esconde', !h.oculto, JSON.stringify(h));
  await page.evaluate(() => { localStorage.removeItem('gn_cl_last_err_' + LOJA); _updateLastSaveIndicator(); });

  // ══ 5. Computador e 320 px ═════════════════════════════════════════════════════════
  await page.setViewportSize({ width: 1024, height: 800 });
  await rolar(0); await rolar(500); await rolar(1200); await espera(300);
  const desk = await page.evaluate(() => ({ t: getComputedStyle(document.getElementById('chk-header')).transform, lbl: getComputedStyle(document.querySelector('.chk-hdr-lbl')).display }));
  check('no computador o cabeçalho não some e os botões mantêm o texto', (desk.t === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(desk.t)) && desk.lbl !== 'none', JSON.stringify(desk));
  await page.setViewportSize({ width: 320, height: 700 }); await rolar(0);
  check('320 px sem rolagem de lado', await page.evaluate(() => document.documentElement.scrollWidth <= 320), await page.evaluate(() => document.documentElement.scrollWidth));

  check('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
