// "Hoje temos no app lojas no home um card que mostra o resultado do mês anterior, com
//  comparativo. Quero colocar nele, como se fosse uma mini DRE, com essas porcentagens, com os
//  campos editáveis, somente com senha mestre ou gerente ou supervisor. É possível?"
//
// Escolhas confirmadas com o dono: meta × realizado (o realizado é digitado, porque CMV, folha,
// aluguel e impostos não existem em nenhuma outra tabela do app), e % com padrão da rede
// ajustável por loja.
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
    console.log('\n0 OK, 22 falhou');
    await browser.close(); process.exit(1);
  }

  const prep = (loja, cargo) => page.evaluate(({ loja, cargo }) => {
    session = { id: 1, nome: 'Tiago', loja, cargo, permissoes: cargo === 'mestre' ? { master: true } : {} };
    _dreAllData = null;
    _dreCtx = { loja, comp: '2026-09', faturamento: 316337.84, mesNome: 'setembro' };
    return _dreCarregar(true);
  }, { loja, cargo });

  const bloco = (loja) => page.evaluate((loja) => _dreBlocoHtml(loja, '2026-09', 316337.84, 'setembro'), loja);

  // ── 1. As contas e as % do balizador ───────────────────────────────────────────────
  const DRE_CONTAS_NOTAS = await page.evaluate(() => DRE_CONTAS.map(c => c.nota));
  const contas = await page.evaluate(() => ({
    lista: DRE_CONTAS.map(c => c.k + ':' + c.pct),
    soma: DRE_CONTAS.reduce((s, c) => s + c.pct, 0),
    lucro: _dreLucroPct('BANGU'),
  }));
  check('as seis contas de despesa estão cadastradas com a % do balizador',
    contas.lista.join(',') === 'cmv:29,folha:24,ocupacao:13,utilidades:4,impostos:13,outros:2');
  check('o lucro não é cadastrado: é o que sobra de 100 (85% de despesa → 15% de lucro)',
    contas.soma === 85 && contas.lucro === 15);

  // ── 1b. O que entra em cada conta aparece NA TELA ──────────────────────────────────
  // Sem isso, "Utilidades" não diz a ninguém que é onde vão água, luz e gás — e o tooltip
  // (title) não existe no celular, que é onde a loja usa o app.
  dreRow = null;
  await prep('BANGU', 'gerente');
  const comNota = await bloco('BANGU');
  const form = await page.evaluate(() => _dreFormHtml('BANGU', '2026-09'));
  check('o card diz que água, luz e gás entram em Utilidades',
    /Concessionárias: água, luz e gás/.test(comNota));
  check('e o formulário de edição diz o mesmo, pra quem vai digitar',
    /Concessionárias: água, luz e gás/.test(form));
  check('toda conta tem a sua explicação visível, não só em tooltip',
    DRE_CONTAS_NOTAS.every(n => comNota.includes(n) && form.includes(n)));
  check('aluguel e condomínio aparecem em Ocupação', /Aluguel, condomínio/.test(comNota));

  // ── 2. Sem realizado: o card mostra o TETO de cada conta ───────────────────────────
  dreRow = null;
  await prep('BANGU', 'gerente');
  const semReal = await bloco('BANGU');
  check('sem nada lançado, a coluna é a Meta', /Meta<\/span>/.test(semReal));
  check('CMV 29% de R$ 316.337,84 = R$ 91.737,97', /91\.737,97/.test(semReal));
  check('lucro alvo 15% = R$ 47.450,68', /47\.450,68/.test(semReal));
  check('e o card explica que são tetos, não realizado', /teto<\/b> de cada conta/.test(semReal));

  // ── 3. Com realizado: meta × realizado e desvio ────────────────────────────────────
  dreRow = { pct: {}, real: { 'BANGU|2026-09': { cmv: 98420, folha: 71300, ocupacao: 41124, utilidades: 14900, impostos: 40980, outros: 7100 } } };
  await prep('BANGU', 'gerente');
  const comReal = await bloco('BANGU');
  check('com realizado lançado, a coluna vira Realizado', /Realizado<\/span>/.test(comReal));
  check('CMV estourou a meta e aparece em vermelho (+R$ 6.682,03)',
    /98\.420,00/.test(comReal) && /\+R\$ 6\.682,03/.test(comReal) && /#dc2626/.test(comReal));
  check('folha ficou abaixo da meta e aparece em verde (−R$ 4.621,08)',
    /−R\$ 4\.621,08/.test(comReal) && /#16a34a/.test(comReal));
  // Lucro real = 316.337,84 − 273.824 = 42.513,84 · meta 47.450,68 → −4.936,84
  check('o lucro real sai do faturamento menos os gastos (R$ 42.513,84)', /42\.513,84/.test(comReal));
  check('e o desvio do lucro contra os 15% alvo (−R$ 4.936,84)', /−R\$ 4\.936,84/.test(comReal));

  // ── 4. % por loja sobrescrevendo o padrão da rede ─────────────────────────────────
  dreRow = { pct: { REDE: { cmv: 29, folha: 24, ocupacao: 13, utilidades: 4, impostos: 13, outros: 2 },
                    'NORTE SHOPPING': { ocupacao: 16, utilidades: 5 } }, real: {} };
  await prep('NORTE SHOPPING', 'gerente');
  const shopping = await page.evaluate(() => ({
    ocupacao: _drePct('NORTE SHOPPING', 'ocupacao'),
    cmv: _drePct('NORTE SHOPPING', 'cmv'),
    lucro: _dreLucroPct('NORTE SHOPPING'),
    lucroBangu: _dreLucroPct('BANGU'),
    marcado: _dreTemAjusteLoja('NORTE SHOPPING'),
    bangu: _dreTemAjusteLoja('BANGU'),
  }));
  check('a loja de shopping usa a ocupação dela (16%), não a da rede', shopping.ocupacao === 16);
  check('e segue o padrão da rede no resto (CMV 29%)', shopping.cmv === 29);
  check('o lucro alvo dela cai pra 11%, porque ocupação e utilidades comem mais',
    shopping.lucro === 11 && shopping.lucroBangu === 15);
  check('o card avisa que a loja tem % ajustada, e a loja sem ajuste não avisa',
    shopping.marcado === true && shopping.bangu === false);

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
      if (reais && reais[c.k] != null) document.getElementById('dre-real-' + c.k).value = reais[c.k];
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
  await preencher(null, { cmv: 90000 });
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
    (dreRow.real['BANGU|2026-09'] || {}).cmv === 90000 && dreRow.real['BANGU|2026-09']._por === 'Carol');
  await limpar();

  // ── 6. % igual ao padrão da rede não vira exceção congelada ───────────────────────
  escritas.length = 0;
  dreRow = { pct: { REDE: { cmv: 29, folha: 24, ocupacao: 13, utilidades: 4, impostos: 13, outros: 2 } }, real: {} };
  await prep('CAXIAS', 'gerente');
  await preencher(null, null);                       // mantém as % como vieram (= rede)
  await salvar('Carol', 'x');
  check('salvar sem mudar % NÃO cria ajuste próprio da loja (senão mudar a rede não alcançaria mais ela)',
    !dreRow.pct.CAXIAS);
  await limpar();

  await prep('CAXIAS', 'gerente');
  await preencher({ ocupacao: 16 }, null);
  await salvar('Carol', 'x');
  check('mudar uma % guarda só a conta que diferiu',
    dreRow.pct.CAXIAS && dreRow.pct.CAXIAS.ocupacao === 16 && dreRow.pct.CAXIAS.cmv === undefined);
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
  await preencher({ cmv: 27, outros: 4 }, null);
  login = { nome: 'Tiago', cargo: 'mestre' };
  await salvar('Tiago', 'x', true);
  check('mestre aplica as % como padrão da rede', dreRow.pct.REDE.cmv === 27 && dreRow.pct.REDE.outros === 4);
  await limpar();

  // ── 8. Soma das despesas não pode comer o lucro inteiro ──────────────────────────
  escritas.length = 0;
  await prep('BANGU', 'mestre');
  await preencher({ cmv: 60, folha: 45 }, null);
  const somaRuim = await salvar('Tiago', 'x');
  check('% que somam 100 ou mais são recusadas (não sobra lucro)',
    /não sobra lucro/.test(somaRuim) && !escritas.length);
  await limpar();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
