// "No app check-list, aba Dados, e no app Gorjetas e Gorjetas Mestra, os funcionários em
//  ordem alfabética, fica mais fácil pra conferir."
//
// O que MAIS importa aqui não é a ordem — é que editar uma linha continue mexendo na
// pessoa certa. Em gn_comissoes o índice do array É a identidade: os 7 dias, faltas,
// férias, sexo e o `atvIdx` que casa a linha com o cálculo do rateio saem todos dele.
// Ordenar o array (em vez da exibição) trocaria escala e pagamento de dono em silêncio,
// sem erro nenhum na tela. Por isso cada app é checado nome-por-índice, linha a linha.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const DIR = process.env.DIR || CAMINHOS.PUBLICO;
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Fora de ordem de propósito, com acento, caixa alta e minúscula misturadas — é o que o
// cadastro real tem ("ANTÔNIO Braga" ao lado de "Gabriel Alves", "Cícero" sozinho).
const NOMES = ['Zuleica Alves', 'ANTÔNIO Braga', 'Cícero', 'daniele faustino',
               'Gabriel Alves', 'Álvaro Dias', 'JULIANA Braga', 'JULIANA Alves', 'Bruno Borges'];
const ESPERADO = ['Álvaro Dias', 'ANTÔNIO Braga', 'Bruno Borges', 'Cícero', 'daniele faustino',
                  'Gabriel Alves', 'JULIANA Alves', 'JULIANA Braga', 'Zuleica Alves'];

const mkFuncs = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'f' + i, nome: NOMES[i] || '', tipo: 'CLT / MENSALISTA',
  setor: 'Salão', turno: 'NOITE', horario: '', sexo: '',
  dias: Array(7).fill('PRESENTE'), ferias_ini: '', ferias_fim: '',
  inicio_contrato: '2025-01-01', fim_contrato: '',
}));

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => {
    const u = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'BANGU',
                permissoes: { master: true, comissoes: true }, ts: Date.now() };
    try {
      localStorage.setItem('gn_session_v1', JSON.stringify(u));
      localStorage.setItem('gn_mestra_usuario', JSON.stringify('Tiago'));
      localStorage.setItem('gn_BANGU_usuario', JSON.stringify('Tiago'));
      localStorage.setItem('gn_aviso_guia_v1', '1');
    } catch (e) {}
  });
  // Sem servir a lib do Supabase, createClient estoura e TODO `let` de topo do bloco
  // inline fica em TDZ — comissoesWD inclusive, e o teste mede a ausência da lib em vez
  // da ordenação.
  const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200,
    contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const erros = [];

  // ══ 1. O comparador, sozinho ══════════════════════════════════════════════════════
  const pg0 = await ctx.newPage();
  pg0.on('pageerror', e => erros.push('config: ' + e));
  await pg0.goto('file://' + DIR + '/gn-checklist.html');
  await pg0.waitForFunction(() => typeof window.gnCmpNome === 'function', { timeout: 25000 });

  const ordenado = await pg0.evaluate(ns => ns.slice().sort(window.gnCmpNome), NOMES);
  check('ordena ignorando acento e caixa', JSON.stringify(ordenado) === JSON.stringify(ESPERADO),
    ordenado.join(' | '));
  check('"Cícero" cai entre "Bruno" e "daniele", não no fim da lista',
    ordenado.indexOf('Cícero') === 3, ordenado.join(' | '));
  const comVazios = await pg0.evaluate(() =>
    ['', 'Bruno', '   ', 'Ana'].slice().sort(window.gnCmpNome));
  check('vaga sem nome vai pro fim, não pro topo',
    comVazios[0] === 'Ana' && comVazios[1] === 'Bruno' && !comVazios[2].trim(), JSON.stringify(comVazios));

  // ══ 2. Check-list — aba Dados ═════════════════════════════════════════════════════
  const chk = await pg0.evaluate((d) => {
    comissoesLoadErr = false;
    comissoesWeekIdx = 40;
    comissoesWD = { brutos: Array(7).fill(0), funcs: d.funcs, dist: 'SIM' };
    comissoesVisibleSlots = {};
    d.funcs.forEach((f, i) => { if (f.nome.trim()) comissoesVisibleSlots[i] = true; });
    renderComissoesFuncs();
    const linhas = [...document.querySelectorAll('#func-lista .func-card, #func-lista > div')];
    // Nome mostrado + o índice que a própria linha carrega nos seus handlers.
    const out = [];
    linhas.forEach(el => {
      const html = el.innerHTML || '';
      const m = html.match(/updComissoes\w+\((\d+)[,)]/);
      if (!m) return;
      const idx = Number(m[1]);
      const inp = el.querySelector('input');
      out.push({ idx, nomeNaTela: inp ? inp.value : null });
    });
    return { out, arrayAindaOriginal: comissoesWD.funcs.map(f => f.nome) };
  }, { funcs: mkFuncs(12) });

  check('Check-list: a lista aparece em ordem alfabética',
    JSON.stringify(chk.out.map(x => x.nomeNaTela)) === JSON.stringify(ESPERADO),
    chk.out.map(x => x.nomeNaTela).join(' | '));
  check('Check-list: cada linha carrega o índice da SUA pessoa',
    chk.out.every(x => chk.arrayAindaOriginal[x.idx] === x.nomeNaTela),
    JSON.stringify(chk.out));
  check('Check-list: o array de funcionários NÃO foi reordenado',
    JSON.stringify(chk.arrayAindaOriginal.slice(0, 9)) === JSON.stringify(NOMES),
    chk.arrayAindaOriginal.slice(0, 9).join(' | '));

  // Editar pela tela tem que cair na pessoa certa — a prova que importa.
  const edicao = await pg0.evaluate(() => {
    const el = [...document.querySelectorAll('#func-lista > div')]
      .find(x => (x.querySelector('input') || {}).value === 'Zuleica Alves');
    const m = (el.innerHTML || '').match(/updComissoesSetor\((\d+)/)
           || (el.innerHTML || '').match(/updComissoes\w+\((\d+)/);
    const idx = Number(m[1]);
    return { idx, nomeNoArray: comissoesWD.funcs[idx].nome };
  });
  check('Check-list: a última linha da tela aponta pra Zuleica no array, não pro slot 8',
    edicao.nomeNoArray === 'Zuleica Alves', JSON.stringify(edicao));

  // ══ 3. Gorjetas ═══════════════════════════════════════════════════════════════════
  const pg1 = await ctx.newPage();
  pg1.on('pageerror', e => erros.push('gorjetas: ' + e));
  await pg1.goto('file://' + DIR + '/gn-comissoes.html');
  await pg1.waitForFunction(() => typeof renderFuncs === 'function' && typeof getWD === 'function'
    && typeof window.gnCmpNome === 'function', { timeout: 25000 });

  const gor = await pg1.evaluate((d) => {
    state.semIdx = 40;
    state.allData[String(40)] = { brutos: Array(7).fill(1000), funcs: d.funcs,
                                  dist: 'SIM', vDist: 0, saldoSaida: 0, motivo: '' };
    state.visibleSlots = {};
    const ct = document.createElement('div');
    document.body.appendChild(ct);
    renderFuncs(ct, CAL[40]);
    const out = [];
    ct.querySelectorAll('.fc').forEach(el => {
      const m = (el.innerHTML || '').match(/upd\w*\((\d+)[,)]/) || (el.innerHTML || '').match(/\((\d+),\d\)/);
      const nomeEl = el.querySelector('.fc-nome-text, input');
      out.push({ idx: m ? Number(m[1]) : null,
                 nome: nomeEl ? (nomeEl.value !== undefined ? nomeEl.value : nomeEl.textContent.trim()) : null });
    });
    return { out, array: getWD(40).funcs.map(f => f.nome) };
  }, { funcs: mkFuncs(12) });

  const nomesGor = gor.out.map(x => x.nome).filter(n => n);
  check('Gorjetas: a lista aparece em ordem alfabética',
    JSON.stringify(nomesGor) === JSON.stringify(ESPERADO), nomesGor.join(' | '));
  check('Gorjetas: cada linha carrega o índice da SUA pessoa',
    gor.out.filter(x => x.nome && x.idx != null).every(x => gor.array[x.idx] === x.nome),
    JSON.stringify(gor.out));
  check('Gorjetas: o array NÃO foi reordenado',
    JSON.stringify(gor.array.slice(0, 9)) === JSON.stringify(NOMES), gor.array.slice(0, 9).join(' | '));

  // O rateio casa cada linha com funcCalc por `atvIdx`, derivado do índice. Se a ordenação
  // tivesse encostado nisso, cada pessoa apareceria com o valor de outra.
  const pool = await pg1.evaluate(() => {
    const wd = getWD(40); const calc = calcSemana(wd, getSaldoAntes(40));
    return calc.funcCalc.filter(f => f.nome).map(f => f.nome);
  });
  check('Gorjetas: a ordem interna do cálculo do rateio segue o array, não a tela',
    JSON.stringify(pool) === JSON.stringify(NOMES), pool.join(' | '));

  const poolTela = await pg1.evaluate(() => {
    const ct = document.createElement('div'); document.body.appendChild(ct);
    renderPool(ct);
    return [...ct.querySelectorAll('.pool-func-item')].map(e => (e.textContent.match(/^\s*(.+?)\s{2,}/) || [])[1]
      || e.querySelector('span').textContent.trim());
  });
  check('Gorjetas: a aba Pool também sai alfabética',
    JSON.stringify(poolTela) === JSON.stringify(ESPERADO), poolTela.join(' | '));

  // ══ 4. Gorjetas Mestra ════════════════════════════════════════════════════════════
  const pg2 = await ctx.newPage();
  pg2.on('pageerror', e => erros.push('mestra: ' + e));
  await pg2.goto('file://' + DIR + '/gn-comissoes-mestra.html');
  await pg2.waitForFunction(() => typeof window.gnCmpNome === 'function'
    && typeof getWDLoja === 'function', { timeout: 25000 });

  // Chama o render DE VERDADE e lê o DOM: reimplementar a ordenação aqui faria o teste
  // passar mesmo com o app sem a correção.
  const mestra = await pg2.evaluate((d) => {
    state.semIdx = 40;
    state.lojaAtiva = 'BANGU';
    allDataPorLoja['BANGU'] = { '40': { brutos: Array(7).fill(1000), funcs: d.funcs,
                                        dist: 'SIM', vDist: 0, saldoSaida: 0, motivo: '' } };
    const ct = document.createElement('div');
    document.body.appendChild(ct);
    renderLojaDetalhe(ct, CAL[40]);
    return [...ct.querySelectorAll('.fc')].map(el => ({
      nome: (el.querySelector('.fc-nome-text') || {}).textContent,
      numeroNaTela: Number((el.querySelector('.fc-num') || {}).textContent),
      chaveCard: ((el.querySelector('.fc-hdr') || {}).getAttribute('onclick') || '').match(/'([^']+)'/)?.[1],
    }));
  }, { funcs: mkFuncs(12) });

  check('Mestra: a tela desenhou os 9 funcionários', mestra.length === 9, mestra.length);
  check('Mestra: a lista da loja sai alfabética',
    JSON.stringify(mestra.map(x => x.nome)) === JSON.stringify(ESPERADO),
    mestra.map(x => x.nome).join(' | '));
  check('Mestra: a numeração da linha acompanha a ordem mostrada',
    mestra.length === 9 && mestra.every((x, i) => x.numeroNaTela === i + 1),
    mestra.map(x => x.numeroNaTela).join(','));
  // Álvaro é o índice 5 no array e o 1º na tela; Zuleica é o índice 0 e o último.
  check('Mestra: a chave do card aberto é o índice ORIGINAL, não a posição na tela',
    mestra.length === 9 && mestra[0].chaveCard === 'BANGU_5' && mestra[8].chaveCard === 'BANGU_0',
    mestra.map(x => x.nome + '=' + x.chaveCard).join(' | '));

  // ══ 5. AUDITORIA DURA: TODO índice citado dentro de uma linha é da MESMA pessoa ════
  // Uma linha cita o índice em vários lugares (dias da semana, setor, turno, sexo, expandir,
  // excluir). Basta UM apontar pra outra pessoa pra escala ou pagamento trocar de dono.
  const auditar = async (pg, seletor, pegarNome) => pg.evaluate(({ sel, modo }) => {
    const ruins = [];
    document.querySelectorAll(sel).forEach(el => {
      const html = el.innerHTML || '';
      const nome = modo === 'input'
        ? (el.querySelector('input') || {}).value
        : (el.querySelector('.fc-nome, .fc-nome-text, input') || {}).value;
      const idxs = new Set();
      // Todo número que aparece como 1º argumento de uma função de edição desta linha.
      [...html.matchAll(/\b(?:upd\w*|toggle\w*|remover\w*|excluir\w*|del\w*)[A-Za-z]*\((\d+)\s*[,)]/g)]
        .forEach(m => idxs.add(Number(m[1])));
      if (!idxs.size) return;
      if (idxs.size > 1) ruins.push({ nome, idxs: [...idxs], motivo: 'índices diferentes na mesma linha' });
    });
    return ruins;
  }, { sel: seletor, modo: pegarNome });

  const ruinsChk = await auditar(pg0, '#func-lista > div', 'input');
  check('Check-list: todos os índices de uma mesma linha apontam pra uma pessoa só',
    ruinsChk.length === 0, JSON.stringify(ruinsChk));
  const ruinsGor = await auditar(pg1, '.fc', 'fc');
  check('Gorjetas: idem', ruinsGor.length === 0, JSON.stringify(ruinsGor));

  // ══ 6. Adicionar funcionário com a lista ordenada ════════════════════════════════
  // A vaga nova nasce sem nome, então cai no FIM da lista. O foco é por id de índice
  // (#cf-N / #fc-N), não por posição — se dependesse da posição, cairia no campo de outra
  // pessoa e o nome novo seria digitado por cima dela.
  const addChk = await pg0.evaluate(() => {
    const antes = comissoesWD.funcs.map(f => f.nome);
    addComissoesFunc();
    const vagaIdx = comissoesWD.funcs.findIndex((f, i) => comissoesVisibleSlots[i] && !f.nome.trim());
    const alvo = document.querySelector(`#cf-${vagaIdx} input[type="text"]`);
    const linhas = [...document.querySelectorAll('#func-lista > div')]
      .map(el => (el.querySelector('input') || {}).value);
    return { vagaIdx, achouCampo: !!alvo, campoVazio: alvo ? alvo.value === '' : null,
             ultimaLinhaVazia: linhas[linhas.length - 1] === '',
             arrayIntacto: JSON.stringify(antes) === JSON.stringify(comissoesWD.funcs.map(f => f.nome)) };
  });
  check('Check-list: adicionar funcionário acha o campo da vaga nova pelo índice',
    addChk.achouCampo && addChk.campoVazio === true, JSON.stringify(addChk));
  check('Check-list: a vaga nova aparece no fim da lista, não no meio de quem já existe',
    addChk.ultimaLinhaVazia, JSON.stringify(addChk));
  check('Check-list: adicionar não mexeu nos nomes já cadastrados', addChk.arrayIntacto);

  const addGor = await pg1.evaluate(() => {
    const ct = document.getElementById('content') || (() => {
      const d = document.createElement('div'); d.id = 'content'; document.body.appendChild(d); return d; })();
    const wd = getWD(40);
    const antes = wd.funcs.map(f => f.nome);
    renderFuncs(ct, CAL[40]);
    adicionarFuncionario();
    const vagaIdx = wd.funcs.findIndex((f, i) => state.visibleSlots[i] && !f.nome.trim());
    const alvo = document.querySelector(`#fc-${vagaIdx} .fc-nome`);
    const nomes = [...ct.querySelectorAll('.fc .fc-nome')].map(e => e.value);
    return { vagaIdx, achouCampo: !!alvo, campoVazio: alvo ? alvo.value === '' : null,
             ultimaVazia: nomes[nomes.length - 1] === '',
             arrayIntacto: JSON.stringify(antes) === JSON.stringify(wd.funcs.map(f => f.nome)) };
  });
  check('Gorjetas: adicionar funcionário acha o campo da vaga nova pelo índice',
    addGor.achouCampo && addGor.campoVazio === true, JSON.stringify(addGor));
  check('Gorjetas: a vaga nova aparece no fim da lista', addGor.ultimaVazia, JSON.stringify(addGor));
  check('Gorjetas: adicionar não mexeu nos nomes já cadastrados', addGor.arrayIntacto);

  // ══ 7. Renomear: a lista reordena e a pessoa continua sendo ela ═════════════════
  const renomeou = await pg0.evaluate(() => {
    // Zuleica (índice 0, hoje a última da lista) vira "Ana Paula" — tem que saltar pro topo
    // SEM levar os dados de ninguém junto.
    const diasAntes = comissoesWD.funcs[0].dias.join(',');
    comissoesWD.funcs[0].nome = 'Ana Paula';
    renderComissoesFuncs();
    const linhas = [...document.querySelectorAll('#func-lista > div')]
      .map(el => ({ nome: (el.querySelector('input') || {}).value,
                    idx: Number(((el.innerHTML || '').match(/updComissoes\w+\((\d+)[,)]/) || [])[1]) }));
    const primeira = linhas.find(l => l.nome === 'Ana Paula');
    return { posicao: linhas.indexOf(primeira), idx: primeira ? primeira.idx : null,
             total: linhas.length, antesDela: linhas[0] ? linhas[0].nome : null,
             diasIguais: comissoesWD.funcs[0].dias.join(',') === diasAntes,
             nomeNoIndice0: comissoesWD.funcs[0].nome };
  });
  // Era a última da lista como "Zuleica"; vira a 2ª como "Ana Paula" — atrás só de
  // "Álvaro Dias", que com acento ignorado é "Alvaro" e vem antes de "Ana".
  check('Check-list: renomeado salta da última posição pro lugar alfabético certo',
    renomeou.posicao === 1 && renomeou.antesDela === 'Álvaro Dias', JSON.stringify(renomeou));
  check('Check-list: e continua sendo o índice 0, com os mesmos dias',
    renomeou.idx === 0 && renomeou.diasIguais && renomeou.nomeNoIndice0 === 'Ana Paula',
    JSON.stringify(renomeou));

  check('nenhum erro de JS em nenhum dos três apps', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
