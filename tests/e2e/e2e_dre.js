// "Hoje temos no app lojas no home um card que mostra o resultado do mês anterior, com
//  comparativo. Quero colocar nele, como se fosse uma mini DRE, com essas porcentagens, com os
//  campos editáveis, somente com senha mestre ou gerente ou supervisor. É possível?"
//
// Escolhas confirmadas com o dono: meta × realizado (o realizado é digitado, porque CMV, folha
// e concessionárias não existem em nenhuma outra tabela do app), e % com padrão da rede
// ajustável por loja.
//
// 06/11/2026: "as informações que eu recebo das despesas são só essas" — CMV e % DP em %,
// água, gás e luz em R$. A DRE passou a pedir exatamente isso, sem ocupação, impostos,
// outros e sem lucro: "só mostrar o comparativo do ideal para o real".
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const FAT = 316337.84;   // faturamento real de setembro da Boulevard
let dreRow = null;       // all_data da linha DRE_CONFIG
const escritas = [];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  let login = { nome: 'Tiago', cargo: 'mestre' };   // o que verificar_login devolve
  let loginOk = true;
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request(), url = req.url(), m = req.method();
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/rpc\/verificar_login/.test(url)) return json(loginOk ? [login] : []);
    if (/gn_lojas\?loja=eq\.DRE_CONFIG/.test(url)) {
      if (m === 'GET') return json(dreRow === null ? [] : [{ loja: 'DRE_CONFIG', all_data: dreRow }]);
      if (m === 'PATCH') { escritas.push({ m, body: JSON.parse(req.postData()) }); dreRow = JSON.parse(req.postData()).all_data; return json([]); }
    }
    if (/gn_lojas$/.test(url) && m === 'POST') { escritas.push({ m, body: JSON.parse(req.postData()) }); dreRow = JSON.parse(req.postData()).all_data; return json([]); }
    return json([]);
  });

  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _renderMesAnteriorHome === 'function' && typeof VENDA_MES_MESES !== 'undefined'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: o Home não carregou'); falhou++; await browser.close(); process.exit(1); } }
  }

  const existe = await page.evaluate(() => {
    try { return typeof _dreBlocoHtml === 'function' && typeof _dreSalvar === 'function' && typeof DRE_CONTAS !== 'undefined'; }
    catch (e) { return false; }
  });
  if (!existe) {
    console.log('FALHOU: o mini DRE não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou');
    await browser.close(); process.exit(1);
  }

  const prep = (loja, cargo) => page.evaluate(({ loja, cargo }) => {
    session = { id: 1, nome: 'Tiago', loja, cargo, permissoes: cargo === 'mestre' ? { master: true } : {} };
    _dreAllData = null;
    _dreCtx = { loja, comp: '2026-09', faturamento: 316337.84, mesNome: 'setembro' };
    return _dreCarregar(true);
  }, { loja, cargo });

  const bloco = (loja) => page.evaluate((loja) => _dreBlocoHtml(loja, '2026-09', 316337.84, 'setembro'), loja);

  // ── 1. As contas, no formato do relatório da empresa ──────────────────────────────
  const DRE_CONTAS_NOTAS = await page.evaluate(() => DRE_CONTAS.map(c => c.nota));
  const contas = await page.evaluate(() => ({
    lista: DRE_CONTAS.map(c => c.k + ':' + c.pct + ':' + c.entra),
    campos: DRE_CAMPOS.map(f => f.k + ':' + f.unidade),
    semLucro: typeof _dreLucroPct === 'undefined',
  }));
  check('só as contas que o relatório traz, com a % ideal que já existia (CMV 29, DP 24, utilidades 4)',
    contas.lista.join(',') === 'cmv:29:pct,folha:24:pct,utilidades:4:rs', contas.lista.join(','));
  check('os campos são os do relatório: CMV e DP em %, água, gás e luz em R$',
    contas.campos.join(',') === 'cmv_pct:%,folha_pct:%,agua:R$,gas:R$,luz:R$');
  check('não existe mais conta de lucro', contas.semLucro);

  // ── 1b. O que entra em cada conta aparece NA TELA ──────────────────────────────────
  // O tooltip (title) não existe no celular, que é onde a loja usa o app.
  dreRow = null;
  await prep('BANGU', 'gerente');
  const comNota = await bloco('BANGU');
  const form = await page.evaluate(() => _dreFormHtml('BANGU', '2026-09'));
  check('toda conta tem a sua explicação visível, no card e no formulário',
    DRE_CONTAS_NOTAS.every(n => comNota.includes(n) && form.includes(n)));
  check('o formulário tem um campo pra cada coisa do relatório, cada um com a unidade',
    ['CMV real (%)', '% DP real (%)', 'Água real (R$)', 'Gás real (R$)', 'Luz real (R$)'].every(t => form.includes(t)));
  check('ocupação, impostos e outros saíram', !/Ocupação|Impostos|Outros operacionais/.test(comNota + form));

  // ── 2. Sem realizado: o card mostra o ideal (teto) de cada conta ───────────────────
  dreRow = null;
  await prep('BANGU', 'gerente');
  const semReal = await bloco('BANGU');
  check('colunas Ideal, Real e Desvio', /Ideal<\/span>/.test(semReal) && /Real<\/span>/.test(semReal) && /Desvio<\/span>/.test(semReal));
  check('CMV ideal 29% de R$ 316.337,84 = R$ 91.737,97', /29,00%/.test(semReal) && /91\.737,97/.test(semReal));
  check('nenhuma linha de lucro', !/[Ll]ucro/.test(semReal));
  check('e o card explica que são tetos, não realizado', /teto<\/b> de cada conta/.test(semReal));

  // ── 3. Com realizado: ideal × real e desvio ────────────────────────────────────────
  // CMV e DP digitados em % (como chegam); água, gás e luz em R$ (valores de janeiro da foto).
  dreRow = { pct: {}, real: { 'BANGU|2026-09': { cmv_pct: 31.11, folha_pct: 22.54, agua: 5308.16, gas: 6637.20, luz: 17454.70 } } };
  await prep('BANGU', 'gerente');
  const comReal = await bloco('BANGU');
  check('CMV real 31,11% vira R$ 98.412,70 sobre o faturamento',
    /31,11%/.test(comReal) && /98\.412,70/.test(comReal));
  check('CMV acima do ideal: +2,11 pp e +R$ 6.674,73, em vermelho',
    /\+2,11 pp/.test(comReal) && /\+R\$ 6\.674,73/.test(comReal) && /#dc2626/.test(comReal));
  check('DP abaixo do ideal: −1,46 pp e −R$ 4.618,53, em verde',
    /−1,46 pp/.test(comReal) && /−R\$ 4\.618,53/.test(comReal) && /#16a34a/.test(comReal));
  check('água + gás + luz = R$ 29.400,06 = 9,29% contra o ideal de 4% (+5,29 pp)',
    /29\.400,06/.test(comReal) && /9,29%/.test(comReal) && /\+5,29 pp/.test(comReal));
  check('e o card mostra quanto foi cada uma das três',
    /Água R\$ 5\.308,16/.test(comReal) && /Gás R\$ 6\.637,20/.test(comReal) && /Luz R\$ 17\.454,70/.test(comReal));
  check('continua sem lucro', !/[Ll]ucro/.test(comReal));

  // Conta parcial: só a luz lançada ainda conta (é o mês em que a conta de gás não chegou).
  dreRow = { pct: {}, real: { 'BANGU|2026-09': { luz: 13989.92 } } };
  await prep('BANGU', 'gerente');
  const soLuz = await bloco('BANGU');
  check('só a luz lançada: a conta sai com ela e o CMV fica "não lançado"',
    /Luz R\$ 13\.989,92/.test(soLuz) && /não lançado/.test(soLuz));

  // ── 4. % por loja sobrescrevendo o padrão da rede ─────────────────────────────────
  dreRow = { pct: { REDE: { cmv: 29, folha: 24, utilidades: 4 },
                    'NORTE SHOPPING': { utilidades: 5 } }, real: {} };
  await prep('NORTE SHOPPING', 'gerente');
  const shopping = await page.evaluate(() => ({
    util: _drePct('NORTE SHOPPING', 'utilidades'),
    cmv: _drePct('NORTE SHOPPING', 'cmv'),
    marcado: _dreTemAjusteLoja('NORTE SHOPPING'),
    bangu: _dreTemAjusteLoja('BANGU'),
  }));
  check('a loja de shopping usa a % dela (5%), não a da rede', shopping.util === 5);
  check('e segue o padrão da rede no resto (CMV 29%)', shopping.cmv === 29);
  check('o card avisa que a loja tem % ajustada, e a loja sem ajuste não avisa',
    shopping.marcado === true && shopping.bangu === false);

  // ── 4b. WhatsApp: mesmos números, sem lucro ───────────────────────────────────────
  dreRow = { pct: {}, real: { 'BANGU|2026-09': { cmv_pct: 31.11, folha_pct: 22.54, agua: 5308.16, gas: 6637.20, luz: 17454.70 } } };
  await prep('BANGU', 'gerente');
  const whats = await page.evaluate(() => _dreTextoWhats({ faturamento: 316337.84 }));
  check('o texto do WhatsApp traz ideal × real de cada conta e nenhum lucro',
    /CMV: ideal 29,00%/.test(whats) && /real 31,11%/.test(whats) && /\+2,11 pp/.test(whats) && !/[Ll]ucro/.test(whats));

  // ── 5. Edição: senha obrigatória e cargo ──────────────────────────────────────────
  const preencher = (pcts, reais) => page.evaluate(({ pcts, reais }) => {
    // Formulário antigo esquecido no DOM faz getElementById pegar o input errado — limpa tudo
    // (inclusive os ids soltos de testes anteriores) antes de montar o novo.
    document.querySelectorAll('#_t').forEach(x => x.remove());
    ['dre-aplicar-rede','dre-user','dre-pass','dre-err','dre-edit-box']
      .forEach(id => document.querySelectorAll('#' + id).forEach(x => x.remove()));
    document.body.insertAdjacentHTML('beforeend', '<div id="_t">' + _dreFormHtml(_dreCtx.loja, _dreCtx.comp) + '</div>');
    DRE_CONTAS.forEach(c => {
      if (pcts && pcts[c.k] != null) document.getElementById('dre-pct-' + c.k).value = pcts[c.k];
    });
    DRE_CAMPOS.forEach(f => {
      if (reais && reais[f.k] != null) document.getElementById('dre-real-' + f.k).value = reais[f.k];
    });
  }, { pcts, reais });
  const limpar = () => page.evaluate(() => { const t = document.getElementById('_t'); if (t) t.remove(); });
  const salvar = (user, pass, rede) => page.evaluate(async ({ user, pass, rede }) => {
    document.getElementById('dre-user').value = user;
    document.getElementById('dre-pass').value = pass;
    const cb = document.getElementById('dre-aplicar-rede');
    if (cb) cb.checked = !!rede;
    await _dreSalvar();
    return document.getElementById('dre-err').textContent;
  }, { user, pass, rede }).then(async r => { await page.waitForTimeout(120); return r; });

  dreRow = { pct: {}, real: {} };
  await prep('BANGU', 'gerente');
  await preencher(null, { cmv_pct: 27.29, luz: 17454.7 });
  const semSenha = await salvar('', '');
  check('não salva sem usuário e senha', /Preencha usuário e senha/.test(semSenha) && !escritas.length);

  loginOk = false;
  const senhaErrada = await salvar('alguem', 'errada');
  check('senha inválida não grava nada', /inválidos ou cargo sem permissão/.test(senhaErrada) && !escritas.length);

  loginOk = true;
  login = { nome: 'Patrícia', cargo: 'caixa' };
  const cargoErrado = await salvar('Patrícia', 'x');
  check('cargo fora de mestre/gerente/supervisor é recusado',
    /inválidos ou cargo sem permissão/.test(cargoErrado) && !escritas.length);

  login = { nome: 'Carol', cargo: 'gerente' };
  const okGerente = await salvar('Carol', 'x');
  check('gerente com senha certa salva', okGerente === '' && escritas.length === 1);
  check('e o realizado foi gravado na competência da loja',
    (dreRow.real['BANGU|2026-09'] || {}).cmv_pct === 27.29 && dreRow.real['BANGU|2026-09'].luz === 17454.7 &&
    dreRow.real['BANGU|2026-09']._por === 'Carol');
  await limpar();

  // ── 6. % igual ao padrão da rede não vira exceção congelada ───────────────────────
  escritas.length = 0;
  dreRow = { pct: { REDE: { cmv: 29, folha: 24, utilidades: 4 } }, real: {} };
  await prep('CAXIAS', 'gerente');
  await preencher(null, null);                       // mantém as % como vieram (= rede)
  await salvar('Carol', 'x');
  check('salvar sem mudar % NÃO cria ajuste próprio da loja (senão mudar a rede não alcançaria mais ela)',
    !dreRow.pct.CAXIAS);
  await limpar();

  await prep('CAXIAS', 'gerente');
  await preencher({ utilidades: 5 }, null);
  await salvar('Carol', 'x');
  check('mudar uma % guarda só a conta que diferiu',
    dreRow.pct.CAXIAS && dreRow.pct.CAXIAS.utilidades === 5 && dreRow.pct.CAXIAS.cmv === undefined);
  await limpar();

  // ── 7. Padrão da rede: só mestre/supervisor ───────────────────────────────────────
  await prep('BANGU', 'gerente');
  await preencher({ cmv: 27 }, null);
  login = { nome: 'Carol', cargo: 'gerente' };
  const redePorGerente = await page.evaluate(async () => {
    // o checkbox nem é desenhado pro gerente; forçar o campo é o caminho de quem tenta burlar
    document.getElementById('dre-user').value = 'Carol';
    document.getElementById('dre-pass').value = 'x';
    document.body.insertAdjacentHTML('beforeend', '<input type="checkbox" id="dre-aplicar-rede" checked>');
    await _dreSalvar();
    return document.getElementById('dre-err').textContent;
  });
  check('gerente não muda o padrão da rede nem forçando o campo',
    /Só mestre ou supervisor/.test(redePorGerente));
  await page.evaluate(() => { const c = document.querySelectorAll('#dre-aplicar-rede'); c.forEach(x => { if (!x.closest('#_t')) x.remove(); }); });
  await limpar();

  await prep('BANGU', 'mestre');
  await preencher({ cmv: 27, folha: 25 }, null);
  login = { nome: 'Tiago', cargo: 'mestre' };
  await salvar('Tiago', 'x', true);
  check('mestre aplica as % como padrão da rede', dreRow.pct.REDE.cmv === 27 && dreRow.pct.REDE.folha === 25);
  await limpar();

  // ── 8. R$ digitado no campo da % ────────────────────────────────────────────────
  // O CMV chega em % (27,29). Digitar o R$ no campo dele daria 98.420% — recusa e explica.
  escritas.length = 0;
  await prep('BANGU', 'mestre');
  await preencher(null, { cmv_pct: 98420 });
  const pctRuim = await salvar('Tiago', 'x');
  check('% acima de 100 é recusada, dizendo que o campo é a % do relatório',
    /CMV é em %/.test(pctRuim) && /não o R\$/.test(pctRuim) && !escritas.length);
  await limpar();

  // A conferência embaixo do campo mostra a outra unidade.
  await prep('BANGU', 'mestre');
  await preencher(null, { cmv_pct: 31.11, agua: 5308.16 });
  const dicas = await page.evaluate(() => { _dreAtualizarPcts(316337.84);
    return [document.getElementById('dre-hint-cmv_pct').textContent, document.getElementById('dre-hint-agua').textContent]; });
  check('embaixo da % aparece o R$, e embaixo do R$ aparece a %',
    dicas[0] === '= R$ 98.412,70' && dicas[1] === '= 1,68%', JSON.stringify(dicas));
  await limpar();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
