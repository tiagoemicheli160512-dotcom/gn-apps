// "Ficou bom, mas tenho que imprimir vários dias em várias folhas; queria que pudesse ter
//  como imprimir de uma semana dentro da mesma página. Acha que dá pra fazer?"
//
// Dá, mas não encolhendo o dia a dia: lá cada dia repete os cabeçalhos de turno e de setor,
// e cada pessoa aparece sete vezes. O que cabe numa folha é a grade clássica — PESSOA na
// linha, DIA na coluna, a célula com o horário daquele dia — deitada, porque são sete
// colunas de horário.
//
// Esta suíte cobra as duas coisas: que a grade diga a verdade (o horário é o do dia, a folga
// é folga, a base vem dita como base, cada nome uma vez só) e que ela CAIBA — medido num
// navegador do tamanho de uma folha A4 deitada, não prometido no CSS.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 320)); };

const h7 = (e, s) => Array.from({ length: 7 }, () => ({ entrada: e, saida: s }));
// Os casos que importam: nome comprido, horário só no dia, horário só na base, nenhum dos
// dois, nome com HTML dentro, setor fora do cadastro e alguém com UMA folga só.
const FUNCS = [
  { nome: 'FELIPE ALVES SANTOS JUNIOR', setor: 'Cozinha', turno: 'NOITE',
    horario: '15:00-22:00', horario_dias: h7('15:00', '22:00') },
  { nome: 'Beatriz Alexandre', setor: 'Cozinha', turno: 'MANHÃ',
    horario: '08:00/16:00', horario_dias: h7('08:00', '16:00') },
  // Sem grid do dia: cai na base do cadastro — e tem que sair DITA como base.
  { nome: 'Agnaldo Campos', setor: 'Salão', turno: 'MANHÃ',
    horario: '8:00-16:00', horario_dias: h7('', '') },
  // Nem grid nem base: célula vazia marcada, sem inventar horário.
  { nome: 'Cristóvão Costa', setor: 'Salão', turno: 'TARDE', horario: '', horario_dias: null },
  { nome: 'Ernane <b>Batista</b>', setor: 'Copa / Bar', turno: 'NOITE',
    horario: '', horario_dias: h7('16:00', '23:00') },
  { nome: 'Gabriel Fontes', setor: 'Setor Novo', turno: '', horario: '', horario_dias: null },
];
// 0=Seg .. 6=Dom. O Gabriel fica com UMA folga: é o caso que a conferência tem que marcar.
const FOLGAS = [[1, 2], [2, 3], [0, 4], [3, 5], [1, 6], [4]];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof imprimirSemanaSim5x2 === 'function' && typeof window.gnSim5x2Horas === 'function';
  } catch (e) { return false; } }, { timeout: 30000 });

  const html = await page.evaluate(({ funcs, folgas }) => {
    LOJA = 'Bangu';
    _sim5x2 = { funcs, folgas, perfil: [], horasDia: 8.4, nome: '', lista: null, origem: 'teste' };
    let capturado = null;
    const origOpen = window.open;
    window.open = () => ({ document: { write(h) { capturado = h; }, close() {} }, focus() {}, print() {} });
    try { imprimirSemanaSim5x2(); } finally { window.open = origOpen; }
    return capturado;
  }, { funcs: FUNCS, folgas: FOLGAS });

  check('a impressão da semana gera uma página', !!html && html.length > 500, String(html).slice(0, 120));
  check('o botão novo existe na aba', (await page.locator('button[onclick="imprimirSemanaSim5x2()"]').count()) === 1);
  check('e o dia a dia continua lá, pra quem precisa do detalhe',
    (await page.locator('button[onclick="imprimirEscalaSim5x2()"]').count()) === 1);

  // ── A grade: pessoa na linha, dia na coluna ────────────────────────────────────────
  const grade = await page.evaluate(h => {
    const d = document.createElement('div'); d.innerHTML = h;
    const t = d.querySelector('table.grade');
    if (!t) return null;
    const cab = [...t.querySelectorAll('thead th')].map(x => x.textContent.trim());
    const linhas = [...t.querySelectorAll('tbody tr')].map(tr => ({
      setor: tr.classList.contains('setor-linha'),
      pessoa: (tr.querySelector('th.pessoa') || {}).textContent || (tr.querySelector('th') || {}).textContent || '',
      cels: [...tr.querySelectorAll('td')].map(td => ({
        txt: td.textContent.trim(), cls: td.className, html: td.innerHTML,
      })),
    }));
    const pe = [...t.querySelectorAll('tfoot th, tfoot td')].map(x => x.textContent.trim());
    return { cab, linhas, pe, colsCabecalho: cab.length };
  }, html);

  check('existe a grade da semana', !!grade, 'nenhuma table.grade');
  check('o cabeçalho é Pessoa + os 7 dias + Semana',
    grade && grade.cab.join('|') === 'Pessoa|Seg|Ter|Qua|Qui|Sex|Sáb|Dom|Semana',
    grade && grade.cab.join('|'));

  const pessoas = grade.linhas.filter(l => !l.setor);
  check('cada pessoa aparece UMA vez (é isso que faz caber na folha)',
    pessoas.length === FUNCS.length &&
    FUNCS.every(f => pessoas.filter(p => p.pessoa.includes(f.nome.replace(/<[^>]+>/g, ''))).length <= 1),
    pessoas.length + ' linhas de pessoa pra ' + FUNCS.length + ' pessoas');
  check('e cada linha tem os 7 dias mais a coluna da semana',
    pessoas.every(p => p.cels.length === 8), JSON.stringify(pessoas.map(p => p.cels.length)));

  // ── O que cada célula diz ──────────────────────────────────────────────────────────
  const felipe = pessoas.find(p => p.pessoa.includes('FELIPE'));
  check('o nome comprido sai inteiro, sem corte',
    !!felipe && felipe.pessoa.includes('FELIPE ALVES SANTOS JUNIOR'),
    felipe && felipe.pessoa);
  check('o turno vem junto do nome, não numa coluna sua',
    !!felipe && /NOITE/.test(felipe.pessoa) && !grade.cab.includes('Turno'), felipe && felipe.pessoa);
  // Felipe folga ter(1) e qua(2).
  check('o dia de folga sai como folga',
    felipe.cels[1].txt === 'folga' && felipe.cels[2].txt === 'folga' &&
    /folga/.test(felipe.cels[1].cls), JSON.stringify(felipe.cels.map(c => c.txt)));
  check('o dia de trabalho traz o horário DAQUELE dia',
    felipe.cels[0].txt === '15:00–22:00' && felipe.cels[3].txt === '15:00–22:00',
    JSON.stringify(felipe.cels.map(c => c.txt)));
  check('e o horário do dia não é chamado de base',
    !/base/.test(felipe.cels[0].html), felipe.cels[0].html);

  // Banco de horas: a base e o dia divergem de propósito. Quando o dia não foi preenchido,
  // o papel mostra a base — e tem que dizer que é base, senão a gerência lê como o do dia.
  const agnaldo = pessoas.find(p => p.pessoa.includes('Agnaldo'));
  check('sem o dia preenchido, cai no horário base do cadastro',
    /8:00-16:00/.test(agnaldo.cels[1].txt), JSON.stringify(agnaldo.cels.map(c => c.txt)));
  check('e a base sai DITA como base',
    /class="base"/.test(agnaldo.cels[1].html) && /base/.test(agnaldo.cels[1].txt),
    agnaldo.cels[1].html);
  check('a folha explica a diferença quando usou alguma base',
    /horário <b>base<\/b> do cadastro/.test(html),
    html.slice(html.indexOf('class="aviso"'), html.indexOf('class="aviso"') + 420));

  const cris = pessoas.find(p => p.pessoa.includes('Cristóvão'));
  check('sem dia e sem base, a célula fica marcada vazia (não inventa horário)',
    cris.cels[0].txt === '·' && !/\d/.test(cris.cels[0].txt),
    JSON.stringify(cris.cels.map(c => c.txt)));

  // ── Setor agrupa as linhas ─────────────────────────────────────────────────────────
  const setores = grade.linhas.filter(l => l.setor).map(l => l.pessoa.replace(/\s+\d+\s*$/, '').trim());
  check('as linhas vêm agrupadas por setor', setores.length >= 4, JSON.stringify(setores));
  check('na ordem do cadastro: salão, cozinha, copa…',
    setores.indexOf('Salão') < setores.indexOf('Cozinha') &&
    setores.indexOf('Cozinha') < setores.indexOf('Copa / Bar'), JSON.stringify(setores));
  check('setor fora do cadastro não some — vai pro fim',
    setores.indexOf('Setor Novo') === setores.length - 1, JSON.stringify(setores));
  check('cada setor diz quantos são', /class="setor-linha"><th colspan="9">[^<]+<span class="n">\d+/.test(html),
    (html.match(/class="setor-linha"><th colspan="9">[^<]*<span class="n">\d+/g) || []).slice(0, 3).join(' | '));

  // ── A conta da semana, por pessoa ──────────────────────────────────────────────────
  check('a coluna Semana traz as horas de cada um',
    pessoas.every(p => /^\d+(,\d+)?h/.test(p.cels[7].txt) || p.cels[7].txt === '—'),
    JSON.stringify(pessoas.map(p => p.cels[7].txt)));
  const gabriel = pessoas.find(p => p.pessoa.includes('Gabriel'));
  check('quem está com folga faltando sai marcado, com a conta (1/2)',
    /1\/2/.test(gabriel.cels[7].txt) && /alerta/.test(gabriel.cels[7].cls),
    JSON.stringify(gabriel.cels[7]));
  check('e quem tem as duas folgas não leva marca nenhuma',
    !/\/2/.test(felipe.cels[7].txt) && !/alerta/.test(felipe.cels[7].cls),
    JSON.stringify(felipe.cels[7]));

  // ── O rodapé: quantos trabalham em cada dia ────────────────────────────────────────
  // Seg: só o Agnaldo folga → 5. Ter: Felipe e Ernane → 4. Dom: só o Ernane → 5.
  check('o rodapé conta quanta gente fica em cada dia',
    grade.pe.join('|') === 'Na escala|5|4|4|4|4|5|5|6 pessoas', grade.pe.join('|'));

  // ── Segurança e sujeira ────────────────────────────────────────────────────────────
  check('nome com HTML dentro é escapado, não interpretado',
    html.includes('&lt;b&gt;Batista&lt;/b&gt;') && !html.includes('Ernane <b>Batista</b>'));
  check('diz que é rascunho e não altera a escala', /não altera a escala da loja/.test(html));
  check('a loja está no título', /Escala 5x2 da semana — Bangu/.test(html));

  // ── CABE NUMA FOLHA: medido, não prometido ─────────────────────────────────────────
  check('a folha sai deitada', /@page\s*\{\s*size:\s*A4 landscape/.test(html),
    (html.match(/@page[^}]*}/) || [''])[0]);

  // A4 deitada a 96dpi = 1123×794; com 1cm de margem sobram ~680px de altura útil.
  const pag = await browser.newContext({ viewport: { width: 1123, height: 794 } });
  const p2 = await pag.newPage();
  await p2.setContent(String(html).replace(/<script>[\s\S]*?<\/script>/g, ''));
  await p2.waitForTimeout(300);
  const medida = await p2.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    cliente: document.documentElement.clientWidth,
    altura: Math.round(document.body.getBoundingClientRect().height),
    menorCelula: Math.min(...[...document.querySelectorAll('table.grade tbody td')].map(td => td.getBoundingClientRect().width)),
  }));
  check('a página não estoura a largura da folha deitada',
    medida.scroll <= medida.cliente + 1, JSON.stringify(medida));
  check('a semana cabe na altura de uma folha', medida.altura <= 680, JSON.stringify(medida));
  check('a coluna de dia continua larga o bastante pro horário caber numa linha',
    medida.menorCelula >= 60, JSON.stringify(medida));

  // ── A equipe de verdade é maior que a da fixture ───────────────────────────────────
  // As lojas vão de 13 pessoas (Guarulhos) a 52 (Nova América), mais uma linha por setor.
  // Com letra de tamanho fixo a promessa só valia pras pequenas — a grade tem que apertar
  // sozinha, e quando nem assim couber, TEM QUE DIZER, não prometer uma folha e sair duas.
  const FOLHA = 718;  // 190mm de altura útil numa A4 deitada com 1cm de margem, a 96dpi
  const daEquipe = n => page.evaluate(n => {
    const h = (e, s) => Array.from({ length: 7 }, () => ({ entrada: e, saida: s }));
    const funcs = Array.from({ length: n }, (_, i) => ({
      // Nome de 37 caracteres: o 97º percentil da rede (média real 15, maior 39).
      nome: 'FUNCIONARIO NOME COMPRIDO DE TESTE ' + (i + 1),
      setor: ['Salão', 'Cozinha', 'Copa / Bar', 'Caixa', 'Estoque', 'Gerente', 'ASG', 'Chapa'][i % 8],
      turno: ['MANHÃ', 'TARDE', 'NOITE'][i % 3],
      horario: '15:00-22:00', horario_dias: h('15:00', '22:00'),
    }));
    const folgas = funcs.map((_, i) => [i % 7, (i * 3 + 2) % 7].filter((v, j, a) => a.indexOf(v) === j));
    _sim5x2 = { funcs, folgas, perfil: [], horasDia: 6.9, nome: '', lista: null, origem: 'teste' };
    let cap = null; const o = window.open;
    window.open = () => ({ document: { write(x) { cap = x; }, close() {} }, focus() {}, print() {} });
    try { imprimirSemanaSim5x2(); } finally { window.open = o; }
    return cap;
  }, n);
  const medeEquipe = async n => {
    await p2.setContent(String(await daEquipe(n)).replace(/<script>[\s\S]*?<\/script>/g, ''));
    await p2.waitForTimeout(250);
    return p2.evaluate(() => ({
      alto: Math.round(document.body.getBoundingClientRect().height),
      largoOk: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      pt: parseFloat(getComputedStyle(document.querySelector('table.grade')).fontSize),
      linhasDoNome: Math.round(document.querySelector('table.grade tbody th.pessoa').getBoundingClientRect().height /
                    (parseFloat(getComputedStyle(document.querySelector('table.grade tbody th.pessoa')).fontSize) * 1.25)),
      diz2folhas: /não cabe numa folha só/.test(document.querySelector('.aviso').textContent),
    }));
  };

  // Até a maior equipe que a folha aguenta, a semana sai numa página — e em TODO tamanho
  // o que a folha promete bate com o que ela faz. É essa a invariante: não "cabe sempre",
  // que seria mentira, mas "o papel nunca promete uma folha e sai em duas".
  for (const n of [13, 18, 21, 27, 31, 35, 38]) {
    const m = await medeEquipe(n);
    check(`equipe de ${n}: a semana cabe numa folha só`, m.alto <= FOLHA && m.largoOk, JSON.stringify(m));
    check(`equipe de ${n}: e a folha não promete duas`, !m.diz2folhas, JSON.stringify(m));
    check(`equipe de ${n}: o nome sai numa linha só (é a quebra que estoura a folha)`,
      m.linhasDoNome === 1, JSON.stringify(m));
  }
  for (const n of [40, 42, 45, 48, 52, 60]) {
    const m = await medeEquipe(n);
    check(`equipe de ${n}: o que a folha promete bate com o que ela faz`,
      m.diz2folhas === (m.alto > FOLHA), JSON.stringify(m));
  }

  // Nova América, a maior da rede: aí não cabe mesmo — e a folha fala isso.
  const nAm = await medeEquipe(52);
  check('equipe de 52: não cabe, e a folha DIZ que segue na seguinte',
    nAm.alto > FOLHA && nAm.diz2folhas, JSON.stringify(nAm));
  check('e mesmo apertada a letra não some: nunca abaixo de 5pt',
    (await medeEquipe(60)).pt >= 5 * (96 / 72) - 0.1, JSON.stringify(await medeEquipe(60)));
  check('a equipe pequena não é apertada à toa: letra maior que a da grande',
    (await medeEquipe(13)).pt > (await medeEquipe(52)).pt);
  check('o cabeçalho se repete quando a grade passa pra folha seguinte',
    /thead\s*\{\s*display:\s*table-header-group/.test(html) &&
    /tr\s*\{[^}]*page-break-inside:\s*avoid/.test(html), (html.match(/thead\{[^}]*}/) || [''])[0]);

  await pag.close();

  // ── Sem simulação aberta, avisa em vez de quebrar ──────────────────────────────────
  const semSim = await page.evaluate(() => {
    _sim5x2 = null;
    let msg = null; const origA = window.alert; window.alert = m => { msg = m; };
    let abriu = false; const origO = window.open; window.open = () => { abriu = true; return null; };
    try { imprimirSemanaSim5x2(); } finally { window.alert = origA; window.open = origO; }
    return { msg, abriu };
  });
  check('sem simulação aberta, avisa e não abre nada',
    /simulação/i.test(semSim.msg || '') && !semSim.abriu, JSON.stringify(semSim));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log('\n' + ARQ);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
