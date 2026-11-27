// Banner de divergência do Financeiro no Caixa (27/11/2026): além de QUEM conferiu, mostra
// QUANDO (data/hora de Brasília) e há quantos dias — a gerência sabe se a pendência é de hoje
// ou está parada. Aparelho em UTC de propósito: a hora tem que sair em Brasília mesmo assim.
// Conferência antiga sem conferido_em continua mostrando só o nome, sem "em undefined".
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };
const ITENS = { bandeiras: { 'Visa Crédito': { label: 'Visa Crédito', sistema: 250, conferido: 230, dif: -20 } } };
// "Agora" = 27/11/2026 20:00 em Brasília (23:00 UTC).
const AGORA = new Date('2026-11-27T23:00:00Z');
const CASOS = [
  { rot: 'conferida há 2 dias', conf: { tem_divergencia: true, conferido_por: 'Financeiro', conferido_em: '2026-11-25T17:05:00Z', itens: ITENS },
    espera: /por Financeiro em 25\/11 às 14:05 \(há 2 dias\)/ },
  // 01:30 UTC do dia 27 = 22:30 do dia 26 em Brasília → "ontem", não "hoje".
  { rot: 'virada do dia em Brasília', conf: { tem_divergencia: true, conferido_por: 'Financeiro', conferido_em: '2026-11-27T01:30:00Z', itens: ITENS },
    espera: /em 26\/11 às 22:30 \(ontem\)/ },
  { rot: 'conferida hoje', conf: { tem_divergencia: true, conferido_por: 'Financeiro', conferido_em: '2026-11-27T12:00:00Z', itens: ITENS },
    espera: /em 27\/11 às 09:00 \(hoje\)/ },
  { rot: 'já identificada mantém a data da conferência', conf: { tem_divergencia: true, conferido_por: 'Financeiro', conferido_em: '2026-11-20T15:00:00Z', itens: ITENS,
      divergencia_resolvida: { resolvido_por: 'Ana', resolvido_em: '2026-11-21T15:00:00Z', obs: 'ok' } },
    espera: /por Financeiro em 20\/11 às 12:00 \(há 7 dias\) — já identificada por Ana em 21\/11 às 12:00 \(há 6 dias\)/ },
  { rot: 'conferência antiga sem data', conf: { tem_divergencia: true, conferido_por: 'Financeiro', itens: ITENS },
    espera: /neste caixa · por Financeiro$/m, nao: /undefined|Invalid| em \d/ },
];
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const erros = [];
  for (const caso of CASOS) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, timezoneId: 'UTC' });
    await ctx.route('**/rest/v1/**', r => /gn_lojas\?loja=eq\./.test(r.request().url())
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ all_data: { caixa_conferencias: { 'f1': caso.conf } } }]) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage(); page.on('pageerror', e => erros.push(String(e.message)));
    await page.clock.setFixedTime(AGORA);
    await page.goto('file://' + ARQ);
    await page.waitForFunction(() => typeof carregarBannerConferencia === 'function', null, { timeout: 25000 });
    const txt = await page.evaluate(async () => {
      S.user = { nome: 'Ana', cargo: 'gerente' }; S.loja = 'BANGU'; S.modoConsulta = true;
      S.fech = { id: 'f1', loja: 'BANGU', data: '2026-11-27', turno: 'NOITE', status: 'FECHADO', suprimento_inicial: 0 };
      S.comprovantes = []; S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = [];
      ['telaLogin', 'telaTurno'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
      document.getElementById('app').classList.remove('hidden'); irPara('fechar');
      await carregarBannerConferencia();
      const sub = [...document.querySelectorAll('#divBannerConf div')].find(d => /Conferência de RH encontrou/.test(d.textContent) && !d.querySelector('div'));
      return sub ? sub.innerText : '';
    });
    check(`${caso.rot}: "${(txt.match(/neste caixa.*/) || [''])[0]}"`, caso.espera.test(txt) && !(caso.nao && caso.nao.test(txt)), txt);
    await ctx.close();
  }
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
