// "No app Check-list, na aba escala 5x2, quando vou imprimir, queria que tivesse como
//  imprimir a escala no formato dia a dia, se for o caso por setor — tipo cozinha, salão,
//  copa. Pois sai quebrado."
//
// O que saía quebrado era a TELA impressa pelo navegador: a linha de cada pessoa é um nome
// mais sete botõezinhos de dia, e no papel vira uma faixa estreita que não cabe em
// retrato — o nome sai cortado ("FELIPE BORGES DA…") e a página sai deitada.
//
// Esta suíte prova a outra leitura: o dia manda, o setor vem dentro dele, e o resultado
// CABE em A4 retrato sem corte — medido num navegador no tamanho da folha, não no HTML.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 320)); };

// Equipe de mentira, mas com os casos que importam: nome comprido (o que saía cortado),
// setor fora do cadastro, nome com HTML dentro, e alguém com UMA folga só.
const FUNCS = [
  // Horário por DIA preenchido: é o que deve sair na linha.
  { nome: 'FELIPE ALVES SANTOS JUNIOR', setor: 'Cozinha', turno: 'NOITE', sexo: 'M',
    horario: '15:00-22:00', horario_dias: Array.from({length:7},()=>({entrada:'15:00',saida:'22:00'})) },
  { nome: 'Beatriz Alexandre', setor: 'Cozinha', turno: 'MANHÃ', sexo: 'F',
    horario: '08:00/16:00', horario_dias: Array.from({length:7},()=>({entrada:'08:00',saida:'16:00'})) },
  // Sem grid do dia: cai no horário geral do cadastro.
  { nome: 'Agnaldo Campos', setor: 'Salão', turno: 'MANHÃ', sexo: 'M',
    horario: '8:00-16:00', horario_dias: Array.from({length:7},()=>({entrada:'',saida:''})) },
  // Nem grid nem geral: a linha sai só com o nome, sem inventar horário.
  { nome: 'Cristóvão Costa', setor: 'Salão', turno: 'TARDE', sexo: 'M', horario: '', horario_dias: null },
  { nome: 'Ernane <b>Batista</b>', setor: 'Copa / Bar', turno: 'NOITE', sexo: 'M',
    horario: '', horario_dias: Array.from({length:7},()=>({entrada:'16:00',saida:'23:00'})) },
  // Sem turno cadastrado: tem que aparecer mesmo assim, no fim.
  { nome: 'Gabriel Fontes', setor: 'Setor Novo', turno: '', sexo: 'M', horario: '', horario_dias: null },
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
    return typeof imprimirEscalaSim5x2 === 'function' && typeof window.gnSim5x2Horas === 'function';
  } catch (e) { return false; } }, { timeout: 30000 });

  // Monta a simulação direto no estado, como ela fica depois de abrir a aba.
  const html = await page.evaluate(({ funcs, folgas }) => {
    LOJA = 'Bangu';
    _sim5x2 = { funcs, folgas, perfil: [], horasDia: 8.4, nome: '', lista: null, origem: 'teste' };
    let capturado = null;
    const origOpen = window.open;
    window.open = () => ({
      document: { write(h) { capturado = h; }, close() {} },
      focus() {}, print() {},
    });
    try { imprimirEscalaSim5x2(); } finally { window.open = origOpen; }
    return capturado;
  }, { funcs: FUNCS, folgas: FOLGAS });

  check('a impressão gera uma página', !!html && html.length > 500, String(html).slice(0, 120));
  check('o botão existe na aba', (await page.locator('button[onclick="imprimirEscalaSim5x2()"]').count()) === 1);

  // ── O formato é dia a dia ──────────────────────────────────────────────────────────
  const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  check('traz os sete dias da semana, nomeados', DIAS.every(d => html.includes('>' + d + '<')),
    DIAS.filter(d => !html.includes('>' + d + '<')).join(','));
  check('e cada dia é um bloco que não parte no meio da folha',
    (html.match(/class="dia"/g) || []).length === 7 && /page-break-inside:avoid/.test(html),
    (html.match(/class="dia"/g) || []).length + ' blocos');

  // ── Dentro do dia, o setor ─────────────────────────────────────────────────────────
  check('dentro do dia vêm os setores', /Cozinha/.test(html) && /Salão/.test(html) && /Copa \/ Bar/.test(html));
  check('setor fora do cadastro não some, vai pro fim',
    html.indexOf('Setor Novo') > html.indexOf('Copa / Bar'), 'novo=' + html.indexOf('Setor Novo'));

  // ── Separado por turno, com o horário ──────────────────────────────────────────────
  check('o dia é separado por turno', /class="turno-top"/.test(html),
    html.slice(html.indexOf('class="dia"'), html.indexOf('class="dia"') + 700));
  const ordemTurnos = (html.match(/class="turno-top">([^<]+)/g) || []).slice(0, 3).map(x => x.split('>')[1].trim());
  check('na ordem de quem abre, vira e fecha: MANHÃ, TARDE, NOITE',
    ordemTurnos.join('|') === 'MANHÃ|TARDE|NOITE', ordemTurnos.join('|'));
  check('cada turno diz quantos são', /class="turno-top">MANHÃ <span class="n">\d<\/span>/.test(html),
    (html.match(/class="turno-top">[^<]+<span class="n">\d+/g) || []).slice(0, 3).join(' | '));
  check('o setor continua dentro do turno', /class="turno-bloco"[\s\S]{0,400}?class="setores"/.test(html));
  check('o turno saiu de dentro do nome (não repete em cada linha)',
    !/\(NOITE\)/.test(html) && !/\(MANHÃ\)/.test(html));

  check('o horário do DIA aparece ao lado do nome', /15:00–22:00/.test(html), html.slice(0, 400));
  // A base e o dia divergem de propósito (banco de horas): quando o dia não foi preenchido,
  // o papel mostra a base — e tem que dizer que é base, senão vira "o horário daquele dia".
  check('sem grid do dia, usa o horário base do cadastro', /8:00-16:00/.test(html));
  check('e a base sai DITA como base, não como o horário do dia',
    /base 8:00-16:00/.test(html), (html.match(/class="hora">[^<]*/g) || []).slice(0, 6).join(' | '));
  check('o horário que veio do DIA não é chamado de base',
    !/base 15:00–22:00/.test(html) && /15:00–22:00/.test(html));
  check('e a página explica a diferença quando usa alguma base',
    /horário é o <b>do dia<\/b>/.test(html) && /horário <b>base<\/b> do cadastro/.test(html),
    html.slice(html.indexOf('class="aviso"'), html.indexOf('class="aviso"') + 400));
  check('sem nenhum dos dois, a linha sai só com o nome (sem inventar)',
    (() => { const i = html.indexOf('Cristóvão Costa');
             return i > 0 && !/class="hora"/.test(html.slice(i, i + 90)); })(),
    html.slice(Math.max(0, html.indexOf('Cristóvão Costa')), html.indexOf('Cristóvão Costa') + 120));
  check('quem não tem turno cadastrado não some — vai pro fim como "Sem turno"',
    /class="turno-top">Sem turno/.test(html) &&
    html.indexOf('>Sem turno') > html.indexOf('>NOITE'), 'sem=' + html.indexOf('>Sem turno') + ' noite=' + html.indexOf('>NOITE'));

  // ── Quem trabalha em cada dia (a conta que o papel tem que acertar) ────────────────
  const porDia = await page.evaluate(h => {
    const d = document.createElement('div'); d.innerHTML = h;
    return [...d.querySelectorAll('section.dia')].slice(0, 7).map(sec => ({
      titulo: sec.querySelector('h2').textContent.trim(),
      qtd: sec.querySelector('.qtd').textContent.trim(),
      corpo: sec.querySelector('table.setores') ? sec.querySelector('table.setores').textContent : '',
      folgam: (sec.querySelector('.folgam') || {}).textContent || '',
    }));
  }, html);
  // Segunda (d=0): só o Agnaldo folga → 5 trabalham.
  check('na segunda, conta certo quem trabalha', porDia[0].qtd === '5 pessoas', JSON.stringify(porDia[0]));
  check('e quem folga aparece como folga, não como escalado',
    /Agnaldo Campos/.test(porDia[0].folgam) && !/Agnaldo Campos/.test(porDia[0].corpo),
    porDia[0].folgam);
  // Terça (d=1): Felipe e Ernane folgam → 4 trabalham.
  check('na terça, os dois que folgam saem da lista',
    porDia[1].qtd === '4 pessoas' && !/FELIPE/.test(porDia[1].corpo) && /FELIPE/.test(porDia[1].folgam),
    JSON.stringify(porDia[1]).slice(0, 220));
  check('domingo tem só a folga do Ernane', /Ernane/.test(porDia[6].folgam) && porDia[6].qtd === '5 pessoas',
    JSON.stringify(porDia[6]).slice(0, 220));

  // ── O nome inteiro, que era a queixa ───────────────────────────────────────────────
  check('o nome comprido sai INTEIRO, sem reticências',
    html.includes('FELIPE ALVES SANTOS JUNIOR') && !/FELIPE BORGES DA\s*…/.test(html));
  check('a conferência diz que o horário dela é a base do contrato',
    /class="hora">base 15:00-22:00<\/span>/.test(html),
    html.slice(html.indexOf('Conferência por pessoa'), html.indexOf('Conferência por pessoa') + 500));
  check('a conferência por pessoa mostra turno e horário geral',
    /Felipe[\s\S]{0,200}?NOITE[\s\S]{0,80}?15:00-22:00/.test(html) || /FELIPE[\s\S]{0,260}?15:00-22:00/.test(html),
    html.slice(html.indexOf('Conferência por pessoa'), html.indexOf('Conferência por pessoa') + 600));
  check('nome com HTML dentro é escapado, não interpretado',
    html.includes('&lt;b&gt;Batista&lt;/b&gt;') && !html.includes('Ernane <b>Batista</b>'));

  // ── Conferência por pessoa, no fim ─────────────────────────────────────────────────
  check('tem a conferência por pessoa no fim', /Conferência por pessoa/.test(html));
  check('e marca quem está com folga faltando', /\(1\/2\)/.test(html) && /class="pessoa alerta"/.test(html),
    (html.match(/class="pessoa[^"]*"/g) || []).slice(0, 4).join(' | '));
  check('diz que é rascunho e não altera a escala', /não altera a escala da loja/.test(html));

  // ── CABE NA FOLHA: medido, não prometido ───────────────────────────────────────────
  const pag = await browser.newContext({ viewport: { width: 794, height: 1123 } });  // A4 retrato a 96dpi
  const p2 = await pag.newPage();
  await p2.setContent(html);
  await p2.waitForTimeout(300);
  const medida = await p2.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    cliente: document.documentElement.clientWidth,
    maiorBloco: Math.max(...[...document.querySelectorAll('section.dia')].map(s => s.getBoundingClientRect().width)),
    alturaMaxDia: Math.max(...[...document.querySelectorAll('section.dia')].map(s => s.getBoundingClientRect().height)),
  }));
  check('a página não estoura a largura da folha A4 em retrato',
    medida.scroll <= medida.cliente + 1, JSON.stringify(medida));
  check('nenhum bloco de dia é mais alto que uma folha (senão partiria mesmo assim)',
    medida.alturaMaxDia < 1000, JSON.stringify(medida));
  await pag.close();

  // ── Sem simulação aberta, avisa em vez de quebrar ──────────────────────────────────
  const semSim = await page.evaluate(() => {
    _sim5x2 = null;
    let msg = null; const origA = window.alert; window.alert = m => { msg = m; };
    let abriu = false; const origO = window.open; window.open = () => { abriu = true; return null; };
    try { imprimirEscalaSim5x2(); } finally { window.alert = origA; window.open = origO; }
    return { msg, abriu };
  });
  check('sem simulação aberta, avisa e não abre nada', /simulação/i.test(semSim.msg || '') && !semSim.abriu,
    JSON.stringify(semSim));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log('\n' + ARQ);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
