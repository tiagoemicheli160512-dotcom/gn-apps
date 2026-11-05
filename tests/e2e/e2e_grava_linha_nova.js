// "Já tinha colocado em todas as lojas a foto. Fui ver agora não tá aparecendo mais."
//
// A foto subia pro Storage, a tela mostrava tudo certo, e NENHUMA linha chegava ao banco.
// Conferido: zero linhas RELMES_ em gn_lojas, e a linha DESEMPENHO_CIENTE também nunca
// existiu — a ciência da gerência tinha o mesmo defeito desde que foi ao ar.
//
// A causa: um PATCH do PostgREST que não casa com NENHUMA linha devolve 204, ou seja, `ok`.
// O padrão "PATCH, e se falhar cria" nunca disparava a criação. O código concluía que tinha
// gravado, guardava o estado em memória, e a tela mostrava a imagem até o recarregamento.
//
// Por isso este teste NÃO usa um mock que responde 200 pra tudo: ele imita o PostgREST no
// ponto exato que me enganou. Um mock complacente deixaria o defeito passar de novo.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } });

  // ── gn_lojas de mentira, com o comportamento REAL do PostgREST ────────────────────
  let TABELA = {};            // loja -> all_data
  let patchSemAlvo = 0;       // quantos PATCH não casaram com linha nenhuma
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request(), url = req.url(), m = req.method();
    const json = (b, s) => route.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/rpc\/verificar_login/.test(url)) return json([{ nome: 'Tiago', cargo: 'gerente' }]);
    if (/gn_lojas/.test(url)) {
      const alvo = (/loja=eq\.([^&]+)/.exec(url) || [])[1];
      const nome = alvo ? decodeURIComponent(alvo) : null;
      if (m === 'GET') return json(nome && TABELA[nome] !== undefined ? [{ loja: nome, all_data: TABELA[nome] }] : []);
      const corpo = JSON.parse(req.postData() || '{}');
      if (m === 'PATCH') {
        // ESTE é o ponto: sem linha casada o PostgREST devolve 204 e não cria nada.
        if (nome && TABELA[nome] !== undefined) { TABELA[nome] = corpo.all_data; return route.fulfill({ status: 204, body: '' }); }
        patchSemAlvo++;
        return route.fulfill({ status: 204, body: '' });
      }
      if (m === 'POST') {
        const upsert = /merge-duplicates/.test(req.headers()['prefer'] || '');
        if (TABELA[corpo.loja] !== undefined && !upsert) return json({ message: 'duplicate key' }, 409);
        TABELA[corpo.loja] = corpo.all_data;
        return route.fulfill({ status: 201, body: '' });
      }
    }
    return json([]);
  });
  // Storage: a foto sobe de verdade na produção; aqui só devolve OK.
  await ctx.route('**/storage/v1/object/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => { try { return typeof _relEmpEnviar === 'function' && LOJAS_TODAS; } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); await browser.close(); process.exit(1); } }
  }

  // ── 1. Primeiro envio de uma loja: a linha ainda NÃO existe ──────────────────────
  const envio = await page.evaluate(async () => {
    session = { nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    masterLoja = 'BANGU';
    _relEmpData = {};
    // Arquivo pequeno, pra subir sem recompressão.
    const f = new File([new Uint8Array([255, 216, 255, 219, 0, 1])], 'print.jpg', { type: 'image/jpeg' });
    await _relEmpEnviar(f, 'BANGU', '2026-09', 'setembro');
    return { erro: _relEmpErro, memoria: !!(_relEmpData.BANGU && _relEmpData.BANGU['2026-09']) };
  });
  check('o envio não acusa erro', envio.erro === '');
  check('a tela passa a mostrar o relatório', envio.memoria === true);
  // A checagem que importa. Antes, só a memória tinha — e por isso a foto sumia no reload.
  check('RELMES_BANGU existe no banco depois do envio', TABELA['RELMES_BANGU'] !== undefined);
  check('com o mês gravado', !!(TABELA['RELMES_BANGU'] || {})['2026-09']);
  check('e com a URL da foto', !!((TABELA['RELMES_BANGU'] || {})['2026-09'] || {}).url);

  // ── 2. Segundo envio, agora com a linha existindo: tem que atualizar, não duplicar ─
  const segundo = await page.evaluate(async () => {
    const f = new File([new Uint8Array([255, 216, 255, 219, 0, 2])], 'print2.jpg', { type: 'image/jpeg' });
    await _relEmpEnviar(f, 'BANGU', '2026-08', 'agosto');
    return _relEmpErro;
  });
  check('o segundo mês não dá erro', segundo === '');
  check('os dois meses convivem na mesma linha',
    Object.keys(TABELA['RELMES_BANGU'] || {}).sort().join(',') === '2026-08,2026-09');

  // ── 3. Outra loja não encosta na primeira ───────────────────────────────────────
  await page.evaluate(async () => {
    const f = new File([new Uint8Array([255, 216, 255, 219, 0, 3])], 'p3.jpg', { type: 'image/jpeg' });
    await _relEmpEnviar(f, 'ITAQUERA', '2026-09', 'setembro');
  });
  check('cada loja ganha a sua linha', TABELA['RELMES_ITAQUERA'] !== undefined && TABELA['RELMES_BANGU'] !== undefined);

  // ── 4. A ciência da gerência tinha o mesmo defeito ──────────────────────────────
  const ciente = await page.evaluate(async () => {
    _cienteAllData = {};
    document.body.insertAdjacentHTML('beforeend',
      '<input id="ciente-user" value="Tiago"><input id="ciente-senha" value="x">');
    _cienteSalvando = false;
    await _cienteConfirmar('BANGU', '2026-09', 'setembro');
    return _cienteErro;
  });
  check('a ciência não acusa erro', ciente === '');
  check('e a linha DESEMPENHO_CIENTE é criada de verdade',
    TABELA['DESEMPENHO_CIENTE'] !== undefined && !!((TABELA['DESEMPENHO_CIENTE'] || {})['2026-09'] || {}).BANGU);

  // ── 5. Nenhuma gravação pode depender de um PATCH que não casa ─────────────────
  check('nenhum PATCH ficou sem linha casada (era o buraco por onde tudo sumia)', patchSemAlvo === 0);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();

