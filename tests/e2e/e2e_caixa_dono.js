// "O valor das vendas do nova América estão zerados."
//
// A Nova América tinha o caixa de 26/09 FECHADO em R$ 48.865,26 e o check-list gravado com
// venda 0. Salvar de novo não resolvia: o dia foi criado ANTES do caixa fechar, com
// dinheiro_caixa = 0, e o teste de posse era `dinheiro_caixa != null`. Zero não é nulo, então
// o app entendia "o Caixa já é dono dos campos financeiros" e pulava venda_salao,
// venda_delivery, repique e dinheiro_caixa em todo upsert seguinte — pra sempre.
//
// O `sb` é const no escopo do script, então não dá pra trocar por window.sb: a interceptação
// é na rede, o que tem a vantagem de exercitar o caminho real do supabase-js.
//
// Fixa as duas metades da regra:
//   1. servidor com dinheiro_caixa = 0  -> o app GRAVA os campos financeiros (destrava);
//   2. servidor com dinheiro_caixa > 0  -> o app NÃO grava (o Caixa continua dono, que é o
//      que impede este aparelho de reverter o que o Caixa sincronizou).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const LINHA_BASE = {
  checklist: {}, abertura: {}, fechamento: {}, faltas: [], retiradas: [], entradas_manuais: [],
  despesas: [], supervisao: {}, supervisao_cozinha: {}, auditorias_padrao: {},
  faltas_funcionarios: [], concluido_em: {}, dia_fechado_em: null, dia_fechado_por: null
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();

  let dinheiroServidor = 0;   // o que o servidor devolve pro dia
  let semLinha = false;       // dia que ainda não existe
  let upsert = null;          // corpo capturado do POST em checklist_diario

  // A interceptação entra só DEPOIS do boot: responder vazio pra tudo durante o carregamento
  // impede o app de inicializar, e aí nem saveAll existe.
  const instalarRota = () => ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const metodo = req.method();
    if (url.includes('/checklist_diario')) {
      if (metodo === 'GET') {
        const corpo = semLinha ? null : { dinheiro_caixa: dinheiroServidor, ...LINHA_BASE };
        // maybeSingle() pede application/vnd.pgrst.object+json e espera UM objeto
        const pedeObjeto = (req.headers()['accept'] || '').includes('pgrst.object');
        if (pedeObjeto) {
          if (corpo === null) return route.fulfill({ status: 406, contentType: 'application/json', body: '{}' });
          return route.fulfill({ status: 200, contentType: 'application/vnd.pgrst.object+json', body: JSON.stringify(corpo) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo ? [corpo] : []) });
      }
      // Só o POST interessa: é o upsert do dia. Logo depois o saveAll manda um PATCH só com
      // as observações (obs_abertura/obs_checklist/obs_fechamento) — capturar esse também
      // sobrescrevia a captura e fazia o teste inteiro olhar pro corpo errado.
      if (metodo === 'POST') {
        try { upsert = JSON.parse(req.postData() || 'null'); } catch (_) { upsert = null; }
        if (Array.isArray(upsert)) upsert = upsert[0];
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      }
      if (metodo === 'PATCH') return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
    }
    // Todo o resto do saveAll responde vazio, pra ele não abortar antes da hora
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => {
        try { return typeof saveAll === 'function' && state !== undefined; } catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) throw e; }
  }
  await instalarRota();

  const rodar = async (dinheiro, novo) => {
    dinheiroServidor = dinheiro; semLinha = !!novo; upsert = null;
    await page.evaluate(async () => {
      LOJA = 'Nova América';
      state.data = '2026-09-26';
      state.vendaSalao = 44288.20; state.vendaDelivery = 473.98;
      state.repique = 4103.08; state.dinheiroCaixa = 1852.96;
      try { await saveAll(); } catch (e) { /* o resto do saveAll pode tropeçar sem DOM completo */ }
    });
    return upsert;
  };

  // ── 1. Dia zerado: tem que destravar e gravar ────────────────────────────────────────
  const zerado = await rodar(0, false);
  check('dia gravado com dinheiro_caixa 0 volta a aceitar os campos financeiros',
    zerado != null && 'venda_salao' in zerado);
  check('e grava a venda que veio do caixa fechado',
    zerado && Number(zerado.venda_salao) === 44288.20 && Number(zerado.venda_delivery) === 473.98);
  check('junto com repique e dinheiro em caixa',
    zerado && Number(zerado.repique) === 4103.08 && Number(zerado.dinheiro_caixa) === 1852.96);

  // ── 2. Caixa com dinheiro: continua sendo o dono ─────────────────────────────────────
  const comDinheiro = await rodar(1852.96, false);
  check('com dinheiro no caixa o app NÃO mexe nos campos financeiros',
    comDinheiro != null && !('venda_salao' in comDinheiro) && !('repique' in comDinheiro)
      && !('venda_delivery' in comDinheiro) && !('dinheiro_caixa' in comDinheiro));
  check('mas continua salvando o resto do dia (despesas, check-list)',
    comDinheiro != null && 'despesas' in comDinheiro && 'checklist' in comDinheiro);

  // ── 3. Dia novo (sem linha no servidor) segue gravando ───────────────────────────────
  const novo = await rodar(0, true);
  check('dia que ainda não existe no servidor grava normalmente',
    novo != null && Number(novo.venda_salao) === 44288.20);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
