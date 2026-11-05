// "Colocar obrigatório o preenchimento do mês anterior sempre no dia primeiro do mês
//  seguinte, se não tiver feito travar. Exemplo fechou setembro dia 25/09, início de 26/09
//  até 25/10, quando for dia 01/11 tem que lançar esse período."
//
// A trava já existia, mas vencia no dia seguinte ao fechamento: período de Out fechava em
// 25/10 e a loja já travava em 27/10. Agora vence em 01/11 — a loja tem de 26 a 31 pra
// lançar.
//
// Metade do teste é a data (_bhVencimentoLancamento e o espelho do Painel, que TÊM que dar a
// mesma resposta); a outra metade exercita _checarBancoHorasPendente de verdade, com as
// respostas do Supabase interceptadas na rede — é lá que o vencimento vira trava ou não.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// [fimPeriodo, vencimento esperado, descrição]
const DATAS = [
  ['2026-10-25', '2026-11-01', 'período de Out fecha 25/10 e vence 01/11 (o exemplo do pedido)'],
  ['2026-09-25', '2026-10-01', 'período de Set fecha 25/09 e vence 01/10'],
  ['2026-12-25', '2027-01-01', 'virada de ano: fecha 25/12 e vence 01/01'],
  ['2026-02-25', '2026-03-01', 'fevereiro fecha 25/02 e vence 01/03'],
  ['2026-10-31', '2026-11-01', 'ciclo que fecha no último dia do mês também vence no 1º'],
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });

  // ── A data, nos dois apps ────────────────────────────────────────────────────────────
  for (const [arquivo, fn, rotulo] of [[CHK, 'chk', 'Check-list'], [HOME, 'home', 'Painel']]) {
    const page = await ctx.newPage();
    for (let t = 1; ; t++) {
      await page.goto('file://' + arquivo);
      try {
        // Espera por função que existe nas DUAS versões — esperar pela nova faria a
        // contraprova só estourar o tempo sem medir nada.
        await page.waitForFunction((q) => {
          try {
            return q === 'chk' ? typeof _checarBancoHorasPendente === 'function'
                               : typeof _gnBhMesEmAberto === 'function';
          } catch (e) { return false; }
        }, fn, { timeout: 25000 });
        break;
      } catch (e) { if (t >= 3) { console.log(`FALHOU: ${rotulo} — o app não carregou`); falhou++; break; } }
    }
    const res = await page.evaluate(({ datas, q }) => datas.map(d => {
      try {
        if (q === 'chk') return typeof _bhVencimentoLancamento === 'function' ? _bhVencimentoLancamento(d[0]) : 'AUSENTE';
        return typeof _gnBhVencimentoLancamento === 'function' ? _gnBhVencimentoLancamento(d[0]) : 'AUSENTE';
      } catch (e) { return 'ERRO'; }
    }), { datas: DATAS, q: fn }).catch(() => null);
    if (!res) { console.log(`FALHOU: ${rotulo} — não deu pra avaliar`); falhou++; await page.close(); continue; }
    DATAS.forEach((d, i) => check(`${rotulo}: ${d[2]}`, res[i] === d[1]));
    await page.close();
  }

  // ── A trava de verdade, pelo caminho real ────────────────────────────────────────────
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => {
        try { return typeof _checarBancoHorasPendente === 'function'; } catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) throw e; }
  }

  // Loja em dia até Set/26 e com o período de Out/26 (26/09 → 25/10) em aberto. Set PRECISA
  // vir lançado: a varredura começa no corte (2026-09), e sem ele a loja seria cobrada por
  // Set já em 01/10 — a cobrança que apareceria em 26/10 seria a de Set, não a de Out, e o
  // teste estaria medindo o prazo errado.
  await ctx.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('gn_banco_horas')) {
      const corpo = [
        { mes: 'CONFIG', registros: { periodo_inicio: '2026-03-26', periodo_fim: '', salariosSetor: {} } },
        { mes: '2026-09', registros: [{ nome: 'Fulano de Tal', horas: 0, obs: '' }] }
      ];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
    }
    if (url.includes('gn_comissoes')) {
      const funcs = [{ nome: 'Fulano de Tal', setor: 'Salão', tipo: 'CLT / MENSALISTA' }];
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ loja: 'BANGU', all_data: { '37': { funcs } } }]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const rodar = (hoje) => page.evaluate(async (hoje) => {
    LOJA = 'Bangu';
    window.hojeLocal = () => hoje;
    try {
      const r = await _checarBancoHorasPendente();
      return r ? { tem: true, hard: !!r.hard, mes: r.mes, msg: r.mensagem } : { tem: false };
    } catch (e) { return { erro: String(e && e.message) }; }
  }, hoje);

  const em26 = await rodar('2026-10-26');
  check('26/10, dia seguinte ao fechamento: não cobra nada', em26.tem === false);

  const em27 = await rodar('2026-10-27');
  check('27/10: continua sem cobrar — antes era AQUI que travava', em27.tem === false);

  const em31 = await rodar('2026-10-31');
  check('31/10, último dia do prazo: ainda não cobra', em31.tem === false);

  const em01 = await rodar('2026-11-01');
  check('01/11: cobra, e já como bloqueio', em01.tem === true && em01.hard === true);
  check('e cobra o período certo (Out/26)', em01.mes === '2026-10');
  check('a mensagem diz quando venceu', /01\/11\/2026/.test(em01.msg || ''));

  const em02 = await rodar('2026-11-02');
  check('02/11: segue cobrando', em02.tem === true && em02.hard === true);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
