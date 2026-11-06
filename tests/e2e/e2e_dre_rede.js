// "Essa questão da mini DRE, tem que ver." → "facilitar o preenchimento".
//
// Medido antes de mexer: a linha DRE_CONFIG NÃO EXISTIA no banco. Zero realizado, zero %
// ajustada, em zero lojas, em zero meses — o Mini DRE nunca foi usado uma vez desde que o
// card existe.
//
// E a causa não é ninguém olhar: é que não havia o que olhar. O realizado é CMV, folha,
// aluguel e impostos, que vêm da contabilidade. Quem TEM os números teria que entrar na Home
// de 11 lojas e digitar seis valores em cada; quem está na Home todo dia não tem os números.
//
// O que este teste protege é a tela que junta as 11 numa só — e, principalmente, as duas
// coisas que fariam ela mentir: gravar sem a linha existir (um PATCH sem linha casada devolve
// 204, "ok", e não grava nada — é EXATAMENTE o estado de hoje) e uma gravação apagar o que
// outra pessoa lançou, já que DRE_CONFIG é uma linha só pra rede inteira.
//
// 06/11/2026: os campos passaram a ser os do relatório da empresa — CMV e % DP em %, água,
// gás e luz em R$ — sem ocupação, impostos, outros nem lucro.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try {
    return typeof _buildDreRedePanel === 'function' && typeof DRE_CONTAS !== 'undefined'
        && typeof LOJAS_LISTA !== 'undefined';
  } catch (e) { return false; } }, { timeout: 25000 });

  // Banco de mentira que guarda o estado como o de verdade: `linhaExiste` false reproduz o
  // caso de hoje (DRE_CONFIG nunca criada).
  const preparar = (opts) => page.evaluate((o) => {
    window.__db = { linhaExiste: !!o.linhaExiste, all_data: o.allData || null, metodos: [], corpos: [] };
    _dreAllData = null;
    Object.keys(_dreFatCache).forEach(k => delete _dreFatCache[k]);  // é const: limpa as chaves
    _dreRedeComp = o.comp || '2026-09';
    _dreRedeFat = {}; _dreRedeAberta = null; _dreRedeMsg = {}; _dreRedeCarregando = false;
    session = o.sessao || { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    _dashTab = 'dre';
    // renderDashboard() desiste quando o painel está escondido, e ele nasce display:none.
    document.getElementById('dash-section').style.display = 'block';
    window.gnFetchJson = async (url, h, contexto, fb, init) => {
      if (contexto === 'dreRede:auth') return o.auth !== undefined ? o.auth : [{ nome: 'Tiago', cargo: 'mestre' }];
      if (contexto === 'dre:config') return window.__db.linhaExiste ? [{ all_data: window.__db.all_data || {} }] : [];
      if (contexto === 'dreRede:existe') return window.__db.linhaExiste ? [{ loja: 'DRE_CONFIG' }] : [];
      if (contexto === 'dre:fatMes') {
        // A consulta vai com a chave do CHECK-LIST ('Bangu'), não com a do usuário
        // ('BANGU') que nomeia a loja na tela — é a mesma pegadinha de nome de chave que já
        // me fez errar uma medição antes. Volta pela LOJA_DB_KEY em vez de supor.
        const q = decodeURIComponent((url.match(/loja=eq\.([^&]+)/) || [])[1] || '');
        const alvo = LOJAS_LISTA.find(k => (LOJA_DB_KEY[k] || k) === q) || q;
        const v = (o.fat || {})[alvo];
        return v === undefined ? [{ venda_salao: 100000, venda_delivery: 0 }] : [{ venda_salao: v, venda_delivery: 0 }];
      }
      return fb;
    };
    window.fetch = async (url, init) => {
      window.__db.metodos.push((init && init.method) || 'GET');
      const corpo = JSON.parse((init && init.body) || '{}');
      window.__db.corpos.push(corpo);
      if (o.gravarFalha) return { ok: false, status: 500 };
      window.__db.all_data = corpo.all_data;
      window.__db.linhaExiste = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
  }, opts);

  const render = () => page.evaluate(async () => {
    await _dreRedeCarregar(true);
    await new Promise(r => setTimeout(r, 60));
    const el = document.getElementById('dash-section');
    return { txt: (el.textContent || '').replace(/\s+/g, ' '), html: el.innerHTML };
  });

  const abrirESalvar = (loja, valores, cred) => page.evaluate(async ({ loja, valores, cred }) => {
    // _dreRedeAbrir é TOGGLE: chamar com a loja já aberta fecha o formulário, os campos somem
    // e o salvamento acha tudo vazio — o que, pelo código, LIMPA o mês. Foi o que fez esta
    // checagem falhar acusando o código.
    _dreRedeAberta = loja;
    renderDashboard();
    document.getElementById('dre-rede-user').value = cred === false ? '' : 'Tiago';
    document.getElementById('dre-rede-pass').value = cred === false ? '' : 'x';
    const id = loja.replace(/\W/g, '_');
    // Os campos nascem PREENCHIDOS com o que já está lançado (é o que permite corrigir um
    // mês). Então "salvar vazio" só existe se eu apagar os campos de verdade — passar {}
    // sem apagar mantinha o valor antigo na tela e regravava ele.
    DRE_CAMPOS.forEach(f => { const el = document.getElementById('dre-rede-' + id + '-' + f.k); if (el) el.value = ''; });
    Object.keys(valores).forEach(k => {
      const el = document.getElementById('dre-rede-' + id + '-' + k);
      if (el) el.value = valores[k];
    });
    await _dreRedeSalvarLoja(loja);
    await new Promise(r => setTimeout(r, 60));
    return { db: window.__db, txt: document.getElementById('dash-section').textContent.replace(/\s+/g, ' ') };
  }, { loja, valores, cred });

  // ── 1. A tela ────────────────────────────────────────────────────────────────────────
  await preparar({ linhaExiste: false, fat: { BANGU: 400000, CAXIAS: 300000 } });
  let r = await render();
  check('a aba DRE existe no Painel de Gestão', /💰 DRE/.test(r.txt));
  check('traz as 11 lojas numa tela só', (r.html.match(/_dreRedeAbrir\('/g) || []).length === 11);
  check('e a Maglia fica fora (CLAUDE.md — não foi citada)', !/_dreRedeAbrir\('MAGLIA'\)/.test(r.html));
  check('mostra quantas já foram lançadas', /0 de 11 lançadas/.test(r.txt));
  check('mostra o faturamento de cada loja no mês', /faturou R\$ 400\.000,00/.test(r.txt));
  check('o mês padrão é o anterior, que é o que se lança', /setembro|outubro|agosto/i.test(r.txt));

  // O teto ao lado do campo é o que separa digitar com referência de digitar no escuro.
  const teto = await page.evaluate(() => { _dreRedeAbrir('BANGU'); const el = document.getElementById('dash-section');
    return el.textContent.replace(/\s+/g, ' '); });
  check('abrindo a loja, cada conta mostra o TETO calculado do faturamento dela',
    /teto: R\$ 116\.000,00/.test(teto));   // CMV 29% de 400.000
  check('os campos são os do relatório: CMV (%), % DP (%), Água, Gás e Luz (R$)',
    ['CMV (%)', '% DP (%)', 'Água (R$)', 'Gás (R$)', 'Luz (R$)'].every(l => teto.indexOf(l) >= 0));
  check('e ocupação, impostos e outros não aparecem', !/Ocupação|Impostos|Outros operacionais/.test(teto));

  // ── 2. O caso de hoje: a linha NÃO existe ────────────────────────────────────────────
  let res = await abrirESalvar('BANGU', { cmv_pct: '27.29', folha_pct: '24.64', agua: '5308.16', gas: '6637.20', luz: '17454.70' });
  check('com a linha inexistente, grava com POST e não com PATCH (um PATCH sem linha casada devolve 204 e não grava nada)',
    res.db.metodos[res.db.metodos.length - 1] === 'POST');
  check('e o realizado chega no banco na chave loja|competência',
    !!(res.db.all_data && res.db.all_data.real && res.db.all_data.real['BANGU|2026-09']));
  const rb = res.db.all_data.real['BANGU|2026-09'];
  check('com os valores digitados, cada um na unidade em que chegou (27.29 é %, não vira 2729)',
    rb.cmv_pct === 27.29 && rb.folha_pct === 24.64 && rb.agua === 5308.16 && rb.gas === 6637.2 && rb.luz === 17454.7, JSON.stringify(rb));
  check('e registrando quem lançou e quando',
    res.db.all_data.real['BANGU|2026-09']._por === 'Tiago' && !!res.db.all_data.real['BANGU|2026-09']._em);
  check('a tela confirma', /Lançado/.test(res.txt));

  // ── 3. Uma loja não pode apagar a outra ──────────────────────────────────────────────
  // DRE_CONFIG é UMA linha pra rede inteira. Gravar o all_data que estava em memória é o
  // jeito clássico de apagar o que outra pessoa lançou enquanto esta tela estava aberta.
  await preparar({ linhaExiste: true, allData: { pct: { REDE: { cmv: 31 } }, real: { 'CAXIAS|2026-09': { cmv_pct: 30.5, _por: 'Souza' } } },
                   fat: { BANGU: 400000 } });
  await render();
  res = await abrirESalvar('BANGU', { cmv_pct: '27.5' });
  check('lançar uma loja NÃO apaga o que outra já tinha lançado',
    res.db.all_data.real['CAXIAS|2026-09'] && res.db.all_data.real['CAXIAS|2026-09'].cmv_pct === 30.5);
  check('nem as % da rede que já estavam lá', res.db.all_data.pct.REDE.cmv === 31);
  check('e com a linha existente usa PATCH', res.db.metodos[res.db.metodos.length - 1] === 'PATCH');
  check('a % ajustada da rede manda no teto mostrado (31%, não os 29 do código)',
    /teto: R\$ 124\.000,00/.test((await page.evaluate(() => { _dreRedeAbrir('BANGU'); return document.getElementById('dash-section').textContent.replace(/\s+/g,' '); }))));

  // ── 4. Permissão ─────────────────────────────────────────────────────────────────────
  // Quem não é mestre continua precisando de senha em todo lançamento.
  const SUPERVISORA = { id: 2, nome: 'Rosa', cargo: 'supervisor', loja: 'GERAL', permissoes: {} };
  await preparar({ linhaExiste: false, auth: [], fat: { BANGU: 400000 }, sessao: SUPERVISORA });
  await render();
  res = await abrirESalvar('BANGU', { cmv_pct: '1' });
  check('senha errada não grava nada', res.db.metodos.length === 0 && /incorret/i.test(res.txt));

  await preparar({ linhaExiste: false, auth: [{ nome: 'Taynara', cargo: 'caixa' }], fat: { BANGU: 400000 }, sessao: SUPERVISORA });
  await render();
  res = await abrirESalvar('BANGU', { cmv_pct: '1' });
  check('cargo sem permissão não grava, e a tela diz qual é o cargo',
    res.db.metodos.length === 0 && /caixa/.test(res.txt) && /sem permissão/.test(res.txt));

  // ── 5. Falhas que não podem passar por sucesso ───────────────────────────────────────
  await preparar({ linhaExiste: false, gravarFalha: true, fat: { BANGU: 400000 } });
  await render();
  res = await abrirESalvar('BANGU', { cmv_pct: '27.5' });
  check('se o banco recusar, a tela NÃO diz que lançou', !/Lançado/.test(res.txt) && /não consegui salvar/i.test(res.txt));

  // ── 6. Limpar e validar ──────────────────────────────────────────────────────────────
  await preparar({ linhaExiste: true, allData: { real: { 'BANGU|2026-09': { cmv_pct: 1, _por: 'x' } } }, fat: { BANGU: 400000 } });
  await render();
  res = await abrirESalvar('BANGU', {});   // todos os campos vazios
  check('salvar com tudo vazio limpa o mês daquela loja', !res.db.all_data.real['BANGU|2026-09']);

  await preparar({ linhaExiste: false, fat: { BANGU: 400000 } });
  await render();
  res = await abrirESalvar('BANGU', { luz: '-5' });
  check('valor negativo não grava', res.db.metodos.length === 0 && /não pode ser negativo/.test(res.txt));

  // O R$ do CMV digitado no campo da % daria 110000% — recusa e explica.
  await preparar({ linhaExiste: false, fat: { BANGU: 400000 } });
  await render();
  res = await abrirESalvar('BANGU', { cmv_pct: '110000' });
  check('% acima de 100 não grava e explica que o campo é a % do relatório',
    res.db.metodos.length === 0 && /CMV é em %/.test(res.txt), res.txt.slice(0, 300));

  // Água+gás+luz muito acima do faturamento é quase sempre um zero a mais: pede confirmação.
  await preparar({ linhaExiste: false, fat: { BANGU: 400000 } });
  await render();
  const perguntas = await page.evaluate(() => { window.__conf = []; window.confirm = t => { window.__conf.push(t); return false; }; });
  res = await abrirESalvar('BANGU', { luz: '700000' });
  const conf = await page.evaluate(() => window.__conf);
  check('despesa bem acima do faturamento pergunta antes, e cancelar não grava',
    conf.length === 1 && res.db.metodos.length === 0, JSON.stringify(conf));

  // Lê o lançamento sem estourar quando nada foi gravado (é o que acontece se a regra quebrar).
  const realDe = (res, k) => (((res.db || {}).all_data || {}).real || {})[k] || {};
  // ── 7. Mestre logado: senha só pra ALTERAR (06/11/2026) ─────────────────────────────
  // "Já estou logado como mestre, não acho necessário. Só se for ser feita alguma alteração
  // no que já está preenchido aí sim pedir a senha pra confirmar a alteração."
  await preparar({ linhaExiste: false, fat: { BANGU: 400000, CAXIAS: 300000 } });
  let tela = await render();
  check('o mestre vê que lançar mês novo não pede senha', /lançar um mês novo não pede senha/.test(tela.txt));
  const autenticou = () => page.evaluate(() => window.__autenticou || 0);
  await page.evaluate(() => { window.__autenticou = 0; const f = window.gnFetchJson;
    window.gnFetchJson = async (u, h, c, fb, i) => { if (c === 'dreRede:auth') window.__autenticou++; return f(u, h, c, fb, i); }; });
  res = await abrirESalvar('BANGU', { cmv_pct: '27.29', luz: '17454.70' }, false);
  check('mestre lança mês novo SEM usuário e senha', realDe(res, 'BANGU|2026-09').cmv_pct === 27.29 && /Lançado/.test(res.txt), res.txt.slice(0, 200));
  check('sem nem consultar a senha no banco', (await autenticou()) === 0);
  check('e o lançamento fica no nome de quem está logado', realDe(res, 'BANGU|2026-09')._por === 'Tiago');
  res = await abrirESalvar('CAXIAS', { folha_pct: '24.64' }, false);
  check('e segue lançando a próxima loja sem senha (antes pedia de novo a cada loja)', !!realDe(res, 'CAXIAS|2026-09').folha_pct);

  const nGrav = (await page.evaluate(() => window.__db.metodos.length));
  res = await abrirESalvar('BANGU', { cmv_pct: '30', luz: '17454.70' }, false);
  check('ALTERAR o que já estava lançado pede a senha, e não grava sem ela',
    /já estava lançado/.test(res.txt) && /senha/.test(res.txt) && res.db.metodos.length === nGrav && realDe(res, 'BANGU|2026-09').cmv_pct === 27.29, res.txt.slice(0, 300));
  res = await abrirESalvar('BANGU', {}, false);
  check('limpar um mês lançado também é alteração e pede senha', !!realDe(res, 'BANGU|2026-09').cmv_pct && /senha/.test(res.txt));
  res = await abrirESalvar('BANGU', { cmv_pct: '30', luz: '17454.70' });
  check('com usuário e senha, a alteração grava', realDe(res, 'BANGU|2026-09').cmv_pct === 30 && (await autenticou()) === 1);
  res = await abrirESalvar('BANGU', { cmv_pct: '30', luz: '17454.70' }, false);
  check('salvar de novo sem mudar nada não pede senha nem grava', /Nada mudou/.test(res.txt) && (await autenticou()) === 1);

  // Alguém lançou a loja enquanto a tela estava aberta: sem senha, não passa por cima.
  await preparar({ linhaExiste: false, fat: { NORTE_SHOPPING: 400000 } });
  await render();
  await page.evaluate(() => { window.__db.linhaExiste = true; window.__db.all_data = { real: { 'PEDREIRA|2026-09': { cmv_pct: 31, _por: 'Outra pessoa' } } }; });
  res = await abrirESalvar('PEDREIRA', { cmv_pct: '28' }, false);
  check('se outra pessoa lançou enquanto a tela estava aberta, não sobrescreve sem senha',
    realDe(res, 'PEDREIRA|2026-09').cmv_pct === 31 && /enquanto a tela estava aberta/.test(res.txt), res.txt.slice(0, 300));

  check('nenhum erro de JS', erros.length === 0);
  if (erros.length) erros.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
