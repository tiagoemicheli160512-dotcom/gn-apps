// Etapa 6 (26/11/2026) — Painel › ⚠ Atenção: loja que recebe mercadoria e não lança NF.
// A cobrança de nota está desligada desde 09/09 (casava fornecedor por nome e virava
// pendência falsa). Esta compara, por loja, o valor CONFIRMADO na Entrega com o das NF
// LANÇADAS nas Entradas, na semana fechada (rpc gn_nf_semana). Corte: NF < 50% do recebido.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T14:00:00');   // quinta → semana fechada = 16/11
  let pedido = null;
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (/rpc\/gn_nf_semana/.test(u)) {
      pedido = { metodo: r.request().method(), corpo: r.request().postData() };
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { tipo: 'rec', chave: 'bangu', n: 102, valor: 28943.76 },        // NF 65 mil: ok
        { tipo: 'rec', chave: 'norte_shopping', n: 119, valor: 37557.48 }, // NF 0: alerta
        { tipo: 'rec', chave: 'pedreira', n: 79, valor: 24564.09 },      // NF 20,7 mil (84%): ok
        { tipo: 'rec', chave: 'caxias', n: 62, valor: 20000 },           // NF 8 mil (40%): alerta "só"
        { tipo: 'nf', chave: 'BANGU', n: 114, valor: 65162.36 },
        { tipo: 'nf', chave: 'PEDREIRA', n: 68, valor: 20669.16 },
        { tipo: 'nf', chave: 'CAXIAS', n: 10, valor: 8000 },
        { tipo: 'nf', chave: 'CAMPO GRANDE', n: 16, valor: 6444.43 },    // NF sem entrega confirmada
        { tipo: 'nf', chave: 'MAGLIA', n: 0, valor: 0 },
      ]) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _computeAlertas === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  if (!(await page.evaluate(() => typeof _loadNfSemana === 'function'))) {
    console.log('FALHOU: o alerta de NF não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const r = await page.evaluate(async () => {
    _dashNfSemana = await _loadNfSemana();
    _dashFat = {}; _dashFatPrev = {};
    const nf = _computeAlertas().filter(a => a.tipo === 'nf');
    const por = k => nf.filter(a => a.loja === k).map(a => ({ sev: a.sev, ico: a.ico, msg: a.msg, sub: a.sub }));
    const el = document.createElement('div'); el.innerHTML = _buildAlertsFeed(); document.body.appendChild(el);
    return { sem: _dashNfSemana.sem, bangu: por('BANGU'), norte: por('NORTE SHOPPING'), pedreira: por('PEDREIRA'), caxias: por('CAXIAS'),
      cg: por('CAMPO GRANDE'), guarulhos: por('GUARULHOS'), maglia: por('MAGLIA'), feed: el.innerText.replace(/\s+/g, ' ') };
  });
  check('consulta a semana FECHADA (quinta 26/11 → segunda 16/11), pela função do banco', r.sem === '2026-11-16' && pedido && pedido.metodo === 'POST' && /"p_semana":"2026-11-16"/.test(pedido.corpo), { sem: r.sem, pedido });
  check('recebeu R$ 37,6 mil e não lançou NF → alerta vermelho com o valor', r.norte.length === 1 && r.norte[0].sev === 1 && /Norte Shopping sem NF lançada na semana de 16\/11 — recebeu R\$ 37,6k/.test(r.norte[0].msg) && /119 item/.test(r.norte[0].sub), r.norte);
  check('NF abaixo da metade do recebido (40%) → "lançou só"', r.caxias.length === 1 && /lançou só R\$ 8,0k de NF pra R\$ 20,0k recebidos/.test(r.caxias[0].msg), r.caxias);
  check('NF bate ou passa do recebido (Bangu) ou fica acima da metade (Pedreira, 84%) → sem alerta', r.bangu.length === 0 && r.pedreira.length === 0, [r.bangu, r.pedreira]);
  check('lança NF mas não confirma entrega (Campo Grande) → alerta de confirmação', r.cg.length === 1 && r.cg[0].ico === '📦' && /não confirmou nenhuma entrega/.test(r.cg[0].msg), r.cg);
  check('nem entrega confirmada nem NF (Guarulhos) → alerta âmbar com onde resolver', r.guarulhos.length === 1 && r.guarulhos[0].sev === 2 && /aba Entrega/.test(r.guarulhos[0].sub) && /aba Entradas/.test(r.guarulhos[0].sub), r.guarulhos);
  check('Maglia fora (não foi citada)', r.maglia.length === 0, r.maglia);
  check('aparece no feed ⚠ Atenção do Painel', /Norte Shopping sem NF lançada/.test(r.feed) && /Campo Grande lançou/.test(r.feed), r.feed.slice(0, 300));
  // Falha da consulta: o feed segue sem o alerta, sem erro.
  const semDado = await page.evaluate(async () => { window.gnFetchJson = async (u, h, c, fb) => fb; _dashNfSemana = await _loadNfSemana(); return { d: _dashNfSemana, n: _computeAlertas().filter(a => a.tipo === 'nf').length }; });
  check('consulta falhou → nenhum alerta de NF (nunca acusa sem dado)', semDado.d === null && semDado.n === 0, semDado);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
