// "A loja Nova América disse que fez o cadastro de dois funcionários — Francinaldo e
//  Leonardo — porém sumiu."
//
// Não sumiu. Conferido em duas fontes independentes: os dois estão salvos na semana de
// 05/10 (índice 39), e gn_admissoes registra o cadastro em 05/10 às 18:05 e 18:10. O que
// eles não estão é na semana ANTERIOR (28/09 — 04/10), que é onde a loja foi procurar ao
// abrir um dia daquela semana pra terminar o check-list de lá.
//
// O quadro de funcionários é POR SEMANA e segue o dia aberto no Check-list, mas a tela só
// dizia "51 funcionário(s)" — sem dizer de quando. Quem cadastra hoje e abre um dia da
// semana passada vê a lista de lá e lê isso como "o cadastro sumiu".
//
// O teste roda contra o all_data REAL da loja, baixado do banco.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const FIX = '' + CAMINHOS.fix('na_comissoes.json') + '';
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const ALL = JSON.parse(fs.readFileSync(FIX, 'utf8'))[0].all_data;
const SEM_CADASTRO = 39;   // semana de 05/10 — onde os dois foram cadastrados
const SEM_ANTERIOR = 38;   // semana de 28/09 — onde a loja foi procurar

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => {
        try { return typeof renderComissoesFuncs === 'function' && LOJA !== undefined && COMISSOES_CAL; }
        catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) { console.log('FALHOU: o Check-list não carregou'); await browser.close(); process.exit(1); } }
  }

  const temFix = await page.evaluate(() => typeof _renderAvisoSemanaFuncs === 'function');
  if (!temFix) console.log('· contraprova: arquivo sem o aviso de semana — rodando o comportamento antigo');

  // O aviso compara a semana aberta com a de HOJE, então o teste envelhece junto com o
  // calendário: passada esta semana, a 39 deixa de ser "hoje" e passa a merecer aviso
  // também. Em vez de ficar vermelho à toa toda segunda, o teste lê a data e ajusta o que
  // esperar — e diz em qual dos dois cenários está rodando.
  const hojeIdx = await page.evaluate(() => comissoesSemIdx(hojeLocal()));
  const semanaDoCadastroEhHoje = hojeIdx === SEM_CADASTRO;
  // O rotulo da semana de hoje vem do CALENDARIO (dado de entrada), nao da funcao que monta
  // o aviso — senao o teste checaria a funcao contra ela mesma e passaria com ela errada.
  // Cravar "05/10 — 11/10" aqui foi o que apodreceu: era a semana de hoje quando este teste
  // nasceu, e virou vermelho sozinho quando o calendario andou.
  const cabHoje = await page.evaluate((i) => (COMISSOES_CAL[i] || {}).header || '', hojeIdx);
  const cabAberta = await page.evaluate((i) => (COMISSOES_CAL[i] || {}).header || '', SEM_ANTERIOR);
  console.log('· hoje = semana ' + hojeIdx + (semanaDoCadastroEhHoje
    ? ' (a mesma do cadastro — cenário do relato)'
    : ' (o cadastro já é de uma semana anterior; o aviso passa a valer também pra ela)'));

  const abrir = (idx) => page.evaluate(([all, idx]) => {
    LOJA = 'Nova América';
    comissoesWeekIdx = idx;
    comissoesWD = getComissoesWD(JSON.parse(JSON.stringify(all)), idx);
    comissoesVisibleSlots = {};
    comissoesWD.funcs.forEach((f, i) => { if (f.nome && f.nome.trim()) comissoesVisibleSlots[i] = true; });
    renderComissoesFuncs();
    const aviso = document.getElementById('func-semana-aviso');
    const lista = document.getElementById('func-lista');
    // O nome fica no VALUE de um input — textContent não enxerga campo de formulário, e
    // procurar lá daria "não está na lista" para todo mundo.
    const nomes = [...lista.querySelectorAll('input')].map(i => (i.value || '').toUpperCase()).join(' | ');
    return {
      contagem: (document.getElementById('func-count') || {}).textContent || '',
      avisoVisivel: !!aviso && aviso.style.display !== 'none' && !!aviso.textContent.trim(),
      avisoTxt: aviso ? aviso.textContent.replace(/\s+/g, ' ').trim() : '',
      francinaldo: /FRANCINALDO/.test(nomes),
      leonardo: /LEONARDO DE CARVALHO/.test(nomes),
    };
  }, [ALL, idx]);

  // ── 1. A semana do cadastro: os dois estão lá, e nada de aviso ──────────────────
  const atual = await abrir(SEM_CADASTRO);
  check('na semana de 05/10 os dois aparecem — nunca sumiram',
    atual.francinaldo === true && atual.leonardo === true);
  check('o aviso só aparece quando a semana aberta NÃO é a de hoje',
    atual.avisoVisivel === !semanaDoCadastroEhHoje);
  check('a contagem diz de qual semana é a lista', /semana de 05\/10 — 11\/10/.test(atual.contagem));

  // ── 2. A semana anterior: é aqui que a loja foi procurar ───────────────────────
  const anterior = await abrir(SEM_ANTERIOR);
  check('na semana de 28/09 os dois realmente não estão', anterior.francinaldo === false && anterior.leonardo === false);
  check('mas agora a tela explica por quê, em vez de ficar calada', anterior.avisoVisivel === true);
  check('dizendo que é a lista da semana passada, com as datas',
    /semana passada/.test(anterior.avisoTxt) && /28\/09 — 04\/10/.test(anterior.avisoTxt));
  check('e que quem foi cadastrado depois não entra nessa lista',
    /cadastrado depois/.test(anterior.avisoTxt));
  check('apontando onde está a lista de hoje (a semana que contém hoje, não uma data fixa)',
    !!cabHoje && anterior.avisoTxt.includes(cabHoje));
  // Le o que esta escrito DEPOIS de "Pra ver o de hoje", em vez de procurar o cabecalho em
  // qualquer lugar do texto: o cabecalho da semana aberta ja aparece na primeira frase, entao
  // uma busca solta passa mesmo quando o ponteiro aponta pro lugar errado. Foi o que
  // aconteceu na primeira versao desta verificacao, e so apareceu no teste de mutacao.
  const apontado = (anterior.avisoTxt.match(/Pra ver o de hoje \(([^)]+)\)/) || [])[1] || '';
  check('e o ponteiro aponta exatamente a semana de hoje, não a que já está aberta',
    apontado === cabHoje && cabHoje !== cabAberta);
  check('a contagem também nomeia a semana', /semana de 28\/09 — 04\/10/.test(anterior.contagem));

  // ── 3. Voltar pra semana de hoje tem que limpar o aviso ───────────────────────
  const devolta = await abrir(hojeIdx);
  check('a semana de hoje nunca leva aviso', devolta.avisoVisivel === false);
  check('e a lista de hoje continua trazendo os dois (a herança semanal os carrega)',
    devolta.francinaldo && devolta.leonardo);

  // ── 4. O aviso não pode esconder a lista nem mentir a contagem ────────────────
  check('a lista da semana passada continua inteira (50 pessoas)',
    /\b50 funcionário/.test(anterior.contagem));
  check('e a de hoje tem os 51, com os dois novos',
    /\b51 funcionário/.test(atual.contagem));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
