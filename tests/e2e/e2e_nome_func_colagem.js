// "Achei algo estranho conferindo as folgas da gerência. No Nova América, o Walter tem dois,
//  um bem estranho." (22/11/2026) — o nome dele na escala virou o informativo do turno
// inteiro colado ("WALTER CAMPOS SOARES📢✅ _INFORMATIVO DO DIA…", ~500 caracteres) numa
// semana e "Wh5tn...g5ecf4r4ŕr5nnk66ALTER CAMPOS SOARES JUNIOR" na outra, e a vaga vazia ao
// lado ganhou uma cópia dele. Pedido: limitar o nome.
//
// Cobra: texto com cara de colagem (emoji, quebra de linha, longo demais) é RECUSADO e o nome
// anterior fica; número e símbolo saem do nome; máximo de 60; nome de verdade (acento,
// apóstrofo, hífen) passa inteiro; vaga vazia não vira "admissão" com texto colado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); c ? ok++ : falhou++; };

const INFORMATIVO = 'WALTER CAMPOS SOARES📢✅ _INFORMATIVO DO DIA - 18/11/26 (quarta) - TURNO NOITE\n\n📌 JANTAR Movimento com um fluxo relativamente fraco de clientes, serviço transcorreu dentro da normalidade.\n_Att: AUGUSTO SILVA JUNIOR';
const mk = (nome, i) => ({ id: i, nome, setor: nome ? 'Gerente' : '', tipo: 'CLT / MENSALISTA', turno: 'TARDE', horario: '16:00 as 00:00',
  inicio_contrato: '2025-08-19', dias: Array(7).fill('PRESENTE'), turnos: Array(7).fill(null) });

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-22T09:00:00');
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); localStorage.setItem('gn_chk_dados_grupos', JSON.stringify({ equipe: true })); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try { return typeof renderComissoesFuncs === 'function' && typeof updComissoesNome === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  const temRegra = await page.evaluate(() => typeof _nomeFuncLimpo === 'function');
  await page.evaluate(({ funcs }) => {
    hideLogin(); LOJA = 'Nova América'; state.data = '2026-11-22';
    usuarioLogado = { id: 1, nome: 'Augusto', cargo: 'gerente', loja: 'NOVA AMERICA' };
    document.querySelectorAll('body > div').forEach(d => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && parseInt(cs.zIndex) >= 900) d.style.display = 'none'; });
    initAllStates(); restoreUI();
    comissoesLoadErr = false; comissoesWeekIdx = 45;
    comissoesWD = { brutos: Array(7).fill(0), funcs, dist: 'SIM' };
    comissoesVisibleSlots = { 0: true, 1: true, 2: true }; comissoesExpanded = {};
    scheduleComissoesOp = () => {};
    window.__admissoes = []; _registrarAdmissao = (n) => { window.__admissoes.push(n); };
    window.__toasts = []; const t = window.showToast; window.showToast = (m, k) => { window.__toasts.push(m); };
    renderComissoesFuncs();
  }, { funcs: [mk('WALTER CAMPOS SOARES JUNIOR', 0), mk('Augusto Silva Junior', 1), mk('', 2)] });

  const nomeDe = i => page.evaluate(i => comissoesWD.funcs[i].nome, i);
  const campo = i => `#cf-${i} .cf-nome`;

  // 1. O informativo colado no nome do Walter
  await page.fill(campo(0), INFORMATIVO);
  const v1 = await page.inputValue(campo(0));
  await page.locator(campo(0)).blur();
  check('colar o informativo no nome: o campo volta pro nome anterior', v1 === 'WALTER CAMPOS SOARES JUNIOR', v1);
  check('e o cadastro continua com o nome certo', (await nomeDe(0)) === 'WALTER CAMPOS SOARES JUNIOR', await nomeDe(0));
  check('quem colou é avisado', await page.evaluate(() => window.__toasts.some(t => /não parece um nome/.test(t))), await page.evaluate(() => window.__toasts));

  // 2. A digitação acidental: número e símbolo saem
  await page.fill(campo(0), 'Wh5tn...g5ecf4r4ŕr5nnk66ALTER CAMPOS SOARES JUNIOR');
  const v2 = await page.inputValue(campo(0));
  check('número, ponto e símbolo não entram no nome', !/[0-9.]/.test(v2), v2);

  // 3. Limite de 60
  check('o campo do nome tem limite de 60', (await page.getAttribute(campo(1), 'maxlength')) === '60');
  check('o que chega pela função também é cortado em 60 (sem emoji e sem quebra de linha)',
    await page.evaluate(() => { updComissoesNome(1, 'Augusto Silva Junior de Albuquerque Cavalcanti Pereira dos Santos Neto', true); const n = comissoesWD.funcs[1].nome; return n.length <= 60 && n.startsWith('Augusto Silva Junior'); }));
  check('chamada direta com o informativo é ignorada (nome não muda)',
    await page.evaluate(n => { const a = comissoesWD.funcs[1].nome; updComissoesNome(1, n, true); return comissoesWD.funcs[1].nome === a; }, INFORMATIVO));

  // 4. Nome de verdade passa inteiro
  await page.evaluate(() => renderComissoesFuncs());
  await page.fill(campo(1), "José D'Ávila-Souza Júnior");
  await page.locator(campo(1)).blur();
  check("acento, apóstrofo e hífen passam inteiros (\"José D'Ávila-Souza Júnior\")", (await nomeDe(1)) === "José D'Ávila-Souza Júnior", await nomeDe(1));

  // 5. Vaga vazia: texto colado não vira cadastro nem admissão no RH
  await page.evaluate(() => renderComissoesFuncs());
  await page.fill(campo(2), INFORMATIVO);
  await page.locator(campo(2)).blur();
  check('vaga vazia com o informativo colado continua vazia', (await nomeDe(2)) === '', await nomeDe(2));
  check('e não manda admissão pro RH', await page.evaluate(() => window.__admissoes.length === 0), await page.evaluate(() => window.__admissoes));

  check('a regra existe neste arquivo', temRegra);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
