// Mateus (gerente, São Gonçalo), na caixa de sugestões:
//   "quando se faz necessário atualizar a escala de algum funcionário, seja editando a hora
//    ou o dia, em algumas vezes acaba não salvando a alteração, mesmo clicando em salvar.
//    Às vezes salva momentaneamente, mas alguns minutos depois retorna sozinho."
// Taynara (sub-gerente, Bangu), no mesmo sentido:
//   "ao lançar/corrigir folga, férias ou tirar funcionário que não está mais, o app salva e
//    volta tudo novo no dia seguinte."
//
// A escala vive em gn_comissoes.all_data, compartilhada com o app de Gorjetas. Cada edição
// virа um "mutator" numa fila; o flush rebusca o all_data do servidor, aplica os mutators e
// grava. Rebuscar é o que protege de sobrescrever o app de Gorjetas — e está certo.
//
// O que falta é trava de reentrância: nada impede um segundo flush de COMEÇAR enquanto o
// primeiro ainda está no ar. Aí os dois leem o mesmo retrato do servidor, cada um aplica só
// os seus mutators, e quem grava por último apaga o que o outro gravou. Na tela continua
// certo (comissoesWD local tem tudo), e é por isso que "salva momentaneamente" e só depois
// "volta sozinho": o que voltou é o que ficou no banco.
//
// Este teste mede isso com um servidor falso de latência realista, sem olhar o HTML.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const abrir = async (browser) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      // Esperar so pelas FUNCOES nao diz nada: declaracao de funcao e hoisted, entao elas
      // existem no instante em que o script comeca — antes dos `let` de topo (comissoesWeekIdx
      // esta na linha ~2888). montarServidor() reatribui esses `let`, e fazer isso cedo demais
      // estoura "Cannot access before initialization". Ler a variavel e o que prova que o
      // script passou da declaracao dela.
      await page.waitForFunction(() => { try {
        // Ler as variaveis, nao so checar as funcoes: declaracao de funcao e hoisted, entao
        // flushComissoesOps/scheduleComissoesOp existem no instante em que o script comeca —
        // bem antes dos `let` de topo que este teste reatribui. Ler o declarado MAIS TARDE
        // dos que ele toca (comissoesOpsQueue, linha ~3125) cobre todos os anteriores;
        // esperar so por comissoesWeekIdx (~2888) ainda deixava a janela 2888..3125 aberta.
        void comissoesWeekIdx; void comissoesWD; void comissoesOpsQueue;
        return typeof flushComissoesOps === 'function' && typeof scheduleComissoesOp === 'function';
      } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o Check-list não carregou'); }
  }
  return { ctx, page };
};

// Servidor falso com LATÊNCIA — é ela que abre a janela do atropelo, e só quando a ida+volta
// passa dos 900ms do debounce. Medido numa sonda à parte: a 200ms e a 500ms de latência o
// bug NÃO aparece; a partir de 800ms a primeira edição se perde toda vez. Com fetch/patch
// instantâneos este teste passaria medindo nada — a primeira versão dele fez isso.
// Também registra a ordem das idas ao servidor, pra cobrar a serialização em si.
const montarServidor = (page, latenciaMs) => page.evaluate((latencia) => {
  const espera = () => new Promise(r => setTimeout(r, latencia));
  window.__srv = { all: { '37': { funcs: [{ nome: 'Cleber', horario: '', dias: ['', '', '', '', '', '', ''] },
                                   { nome: 'Harison', horario: '', dias: ['', '', '', '', '', '', ''] }],
                                   brutos: [0, 0, 0, 0, 0, 0, 0] } },
                   leituras: 0, gravacoes: 0 };
  window.__srv.ordem = [];
  fetchComissoesAllData = async () => { window.__srv.leituras++; window.__srv.ordem.push('LE'); await espera(); return JSON.parse(JSON.stringify(window.__srv.all)); };
  patchComissoesAllData = async (lojaKey, allData) => { await espera(); window.__srv.gravacoes++; window.__srv.ordem.push('GRAV'); window.__srv.all = JSON.parse(JSON.stringify(allData)); };
  comissoesLojaKey = () => 'SAO_GONCALO';
  getComissoesWD = (allData, idx) => JSON.parse(JSON.stringify((allData && allData[String(idx)]) || { funcs: [], brutos: [] }));
  comissoesWeekIdx = 37;
  comissoesWD = getComissoesWD(window.__srv.all, 37);
  comissoesOpsQueue = [];
  showToast = () => {};
  renderComissoesFuncs = () => {};
  document.getElementById('repique-sync-msg') || (() => {
    const d = document.createElement('div'); d.id = 'repique-sync-msg'; document.body.appendChild(d);
  })();
  return true;
}, latenciaMs);

const estadoServidor = (page) => page.evaluate(() => ({
  funcs: window.__srv.all['37'].funcs.map(f => ({ nome: f.nome, horario: f.horario, dias: f.dias })),
  leituras: window.__srv.leituras, gravacoes: window.__srv.gravacoes,
  ordem: window.__srv.ordem.join(' '),
  filaVazia: comissoesOpsQueue.length === 0,
}));

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const a = await abrir(browser);

  // ── 1. Duas edições em sequência, a segunda caindo no meio do salvamento da primeira ──
  // É o caso do Mateus: corrige a hora de um, e logo em seguida o dia de outro.
  await montarServidor(a.page, 800);
  await a.page.evaluate(async () => {
    // Edição 1: horário do Cleber. Espera o debounce de 900ms disparar o flush.
    updComissoesHorario(0, '15:00-23:00');
    await new Promise(r => setTimeout(r, 1000));     // flush #1 está no ar (fetch de 400ms)
    // Edição 2, com o flush #1 ainda em voo: marca FOLGA pro Harison na terça.
    const mutator = wd => { wd = { ...wd }; wd.funcs = [...wd.funcs];
      wd.funcs[1] = { ...wd.funcs[1], dias: ['', 'FOLGA', '', '', '', '', ''] }; return wd; };
    comissoesWD = mutator(comissoesWD);
    scheduleComissoesOp(mutator);
    // Tempo de sobra pra TUDO assentar: debounce + duas idas ao servidor.
    await new Promise(r => setTimeout(r, 4000));
  });
  const s1 = await estadoServidor(a.page);
  check('a fila esvaziou (nada ficou pendente)', s1.filaVazia === true);
  check('o horário do Cleber ficou gravado no servidor',
    s1.funcs[0].horario === '15:00-23:00');
  check('a folga de terça do Harison ficou gravada no servidor',
    s1.funcs[1].dias[1] === 'FOLGA');
  if (s1.funcs[0].horario !== '15:00-23:00' || s1.funcs[1].dias[1] !== 'FOLGA')
    console.log('      servidor ficou com: ' + JSON.stringify(s1.funcs));
  // A causa, medida direto: duas LEITURAS seguidas significa que dois flushes leram o mesmo
  // retrato do servidor, e aí o último a gravar apaga o do outro. Serializado, a ordem só
  // pode ser LE GRAV LE GRAV — nunca LE LE.
  check('os salvamentos não se atropelam (nenhuma leitura dupla antes de gravar)',
    !/LE LE/.test(s1.ordem));
  console.log('      idas ao servidor: ' + s1.ordem);

  // ── 2. Uma rajada de edições, como quem acerta a escala da semana inteira ────────────
  await montarServidor(a.page, 800);
  await a.page.evaluate(async () => {
    const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    // Sete toques com 700ms entre eles: cada um reagenda o debounce, mas o intervalo de 25s
    // e os flushes em voo se cruzam. É a forma como a escala é realmente preenchida.
    for (let d = 0; d < 7; d++) {
      const mutator = wd => { wd = { ...wd }; wd.funcs = [...wd.funcs];
        const dias = [...wd.funcs[0].dias]; dias[d] = 'PRESENTE';
        wd.funcs[0] = { ...wd.funcs[0], dias }; return wd; };
      comissoesWD = mutator(comissoesWD);
      scheduleComissoesOp(mutator);
      await new Promise(r => setTimeout(r, 700));
    }
    await new Promise(r => setTimeout(r, 5000));
  });
  const s2 = await estadoServidor(a.page);
  check('a fila esvaziou depois da rajada', s2.filaVazia === true);
  check('os 7 dias do Cleber estão todos no servidor', (() => {
    const d = s2.funcs[0].dias;
    return d.length === 7 && d.every(x => x === 'PRESENTE');
  })());
  if (!s2.funcs[0].dias.every(x => x === 'PRESENTE'))
    console.log('      dias no servidor: ' + JSON.stringify(s2.funcs[0].dias));

  // ── 3. A tela e o servidor têm que contar a mesma história ───────────────────────────
  // O sintoma relatado é justamente os dois discordarem: na tela certo, no banco não — e
  // é só no dia seguinte, quando o app recarrega do banco, que a pessoa descobre.
  const coerencia = await a.page.evaluate(() => ({
    naTela: JSON.parse(JSON.stringify(comissoesWD.funcs)),
    noBanco: JSON.parse(JSON.stringify(window.__srv.all['37'].funcs)),
  }));
  check('o que está na tela é igual ao que está no banco',
    JSON.stringify(coerencia.naTela) === JSON.stringify(coerencia.noBanco));
  if (JSON.stringify(coerencia.naTela) !== JSON.stringify(coerencia.noBanco)) {
    console.log('      na tela : ' + JSON.stringify(coerencia.naTela));
    console.log('      no banco: ' + JSON.stringify(coerencia.noBanco));
  }

  // ── 4. O que protege de verdade: a edição do app de Gorjetas não pode ser apagada ────
  // Essa é a razão de o flush rebuscar o servidor. Não pode se perder no caminho.
  await montarServidor(a.page, 800);
  const convive = await a.page.evaluate(async () => {
    const mutator = wd => { wd = { ...wd }; wd.funcs = [...wd.funcs];
      wd.funcs[0] = { ...wd.funcs[0], horario: '08:00-16:00' }; return wd; };
    comissoesWD = mutator(comissoesWD);
    scheduleComissoesOp(mutator);
    // Enquanto o flush está no ar, o app de Gorjetas grava direto no servidor.
    await new Promise(r => setTimeout(r, 950));
    window.__srv.all['37'].funcs[1].horario = 'MEXIDO-NO-GORJETAS';
    await new Promise(r => setTimeout(r, 3000));
    return JSON.parse(JSON.stringify(window.__srv.all['37'].funcs));
  });
  check('a edição feita no app de Gorjetas no meio do caminho sobrevive',
    convive[1].horario === 'MEXIDO-NO-GORJETAS');
  check('e a edição do Check-list também', convive[0].horario === '08:00-16:00');
  if (convive[1].horario !== 'MEXIDO-NO-GORJETAS' || convive[0].horario !== '08:00-16:00')
    console.log('      servidor: ' + JSON.stringify(convive));

  await a.ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
