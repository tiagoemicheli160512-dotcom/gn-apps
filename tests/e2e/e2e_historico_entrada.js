// "No Check-list, aba Carne, no Histórico (semana), poderia ter a indicação do dia da
//  entrada da carne. Hoje já puxa automaticamente, seria bom só pra saber quanto chegou.
//  Não soma em nada, é só pra ter a visão."
//
// A tabela do Histórico mostra a contagem acumulada por dia. A entrada já existe em
// ent_<dia> (a sub-aba Entrada puxa do app Lojas sozinha) mas não aparecia ali.
//
// O risco desta mudança é justamente o que ele pediu pra NÃO acontecer: a entrada virar
// parte da conta. Metade das checagens é sobre a contagem continuar exatamente a mesma.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => { try { return typeof renderCarnes === 'function' && CARNES_DEF && DIAS_SEMANA; } catch (e) { return false; } }, { timeout: 15000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o Check-list não carregou'); }
  }

  const r = await page.evaluate(() => {
    usuarioLogado = { id: 1, nome: 'T', cargo: 'gerente', loja: 'PEDREIRA' };
    const k1 = CARNES_DEF[0].key, k2 = CARNES_DEF[1].key, k3 = CARNES_DEF[2].key;
    // Os números do print do dono na Carne de Sol, mais entradas em dois dias.
    stateWeek.carnes[k1] = { inicial: '101', ter: '5', qua: '74', qui: '67', sex: '56',
                             ent_ter: '40', autoEnt_ter: 40, ent_qui: '18.4', autoEnt_qui: 18.4 };
    // Entrada num dia SEM contagem: não pode sumir atrás de um traço.
    stateWeek.carnes[k2] = { inicial: '26', ter: '22', qua: '80',
                             ent_sab: '25', autoEnt_sab: 25 };
    // Nenhuma entrada na semana inteira.
    stateWeek.carnes[k3] = { inicial: '28', ter: '28', qua: '28', qui: '21', sex: '20' };
    carneTabAtiva = 'diario_ver';
    renderCarnes();
    const cont = document.getElementById('carnes-container');
    const linhas = Array.from(cont.querySelectorAll('tr')).slice(1).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').replace(/\s+/g, ' ').trim()));
    return {
      txt: (cont.textContent || '').replace(/\s+/g, ' ').trim(),
      html: cont.innerHTML,
      linhas,
      rolaLado: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  const [sol, picanha, seca] = r.linhas;

  // ── A entrada aparece no dia certo ────────────────────────────────────────────
  check('Carne de Sol: a entrada de terça aparece junto da contagem de terça',
    /^5\b/.test(sol[2]) && /\+40/.test(sol[2]));
  check('e a de quinta também', /^67\b/.test(sol[4]) && /\+18/.test(sol[4]));
  check('o dia sem entrada mostra só a contagem',
    sol[1] === '101' && sol[3] === '74' && sol[5] === '56');

  // ── Entrada em dia sem contagem não some ─────────────────────────────────────
  check('Picanha: sábado tem entrada e nenhuma contagem — mostra o +25 mesmo assim',
    /—/.test(picanha[6]) && /\+25/.test(picanha[6]));

  // ── Carne sem entrada nenhuma fica igual a antes ─────────────────────────────
  check('Carne Seca, sem entrada na semana, não ganha nada',
    seca.slice(1).every(c => !/\+/.test(c)) &&
    seca[1] === '28' && seca[2] === '28' && seca[4] === '21');

  // ── NÃO PODE SOMAR ───────────────────────────────────────────────────────────
  // É o que ele pediu explicitamente. A contagem mostrada tem que ser a contagem crua.
  check('a contagem de terça continua 5, não 45 (5 + os 40 que entraram)',
    sol[2].startsWith('5') && !/^45/.test(sol[2]));
  check('a de quinta continua 67, não 85,4', sol[4].startsWith('67') && !/85/.test(sol[4]));
  check('nenhuma célula virou a soma de contagem + entrada', (() => {
    const soCont = c => (c.split('+')[0] || '').trim();
    return soCont(sol[1]) === '101' && soCont(sol[2]) === '5' && soCont(sol[3]) === '74'
        && soCont(sol[4]) === '67' && soCont(sol[5]) === '56';
  })());

  // ── A tela explica o que é o +N ──────────────────────────────────────────────
  check('tem a legenda dizendo que é o que chegou e que não soma',
    /\+N é o que chegou naquele dia/.test(r.txt) && /não soma na contagem/.test(r.txt));
  check('e o número tem a unidade no título, pra quem passar o dedo',
    /Entrou 40,0 kg terça|Entrou 40\.0 kg terça/.test(r.html));

  // ── Não pode estourar a tabela no celular ────────────────────────────────────
  check('a página não ganha rolagem lateral em 390px', r.rolaLado === false);

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  console.log('\n--- linha da Carne de Sol ---\n' + JSON.stringify(sol));
  process.exit(falhou ? 1 : 0);
})();
