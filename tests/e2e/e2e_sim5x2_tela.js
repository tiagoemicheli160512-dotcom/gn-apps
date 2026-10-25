// A aba Simular 5x2 no app Check-list.
//
// A coisa mais importante a provar aqui NÃO é o desenho: é que a aba não encosta na
// escala real. O dono pediu "ela não mexe na escala em nada", e a escala de uma loja é o
// que paga as pessoas — um upsert errado aqui apaga a semana inteira de 22 pessoas.
// Por isso o teste vigia TODAS as escritas que saem da página.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const BANGU = require(CAMINHOS.fix('dados_bangu.json'));
// A lib do Supabase vem de CDN e o bloco inline do app inteiro depende dela: sem servir
// a lib, createClient estoura e TODO `let` de topo fica em TDZ — LOJA inclusive.
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const escritas = [];       // TUDO que a página tentar gravar
  const salvos = [];         // o que foi pra gn_escala_simulacao
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), url = req.url(), m = req.method();
    if (m !== 'GET') escritas.push({ metodo: m, url: url.split('/rest/v1/')[1].split('?')[0] });
    if (/checklist_diario/.test(url) && m === 'GET')
      return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(BANGU.vendas) });
    if (/gn_comissoes/.test(url) && m === 'GET') {
      const all = {};
      BANGU.semanas.forEach((sem, w) => {
        all[String(30 + w)] = { funcs: BANGU.funcs.map((f, i) => ({
          ...f, dias: Array.from({length:7}, (_, d) => i < sem[d] ? 'PRESENTE' : 'FOLGA') })) };
      });
      return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify([{ all_data: all }]) });
    }
    if (/gn_escala_simulacao/.test(url)) {
      if (m === 'POST') { salvos.push(JSON.parse(req.postData() || '{}')); return r.fulfill({ status:201, contentType:'application/json', body:'[]' }); }
      return r.fulfill({ status:200, contentType:'application/json',
        body: JSON.stringify(salvos.map((x, i) => ({ id:'c'+i, nome:x.nome, criado_por:x.criado_por, atualizado_em:'2026-10-17T10:00:00Z', dados:x.dados }))) });
    }
    r.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof abrirSim5x2 === 'function' && typeof window.gnSim5x2Perfil === 'function';
  } catch (e) { return false; } }, { timeout: 30000 });

  check('a aba existe na barra e na sidebar',
    await page.locator('#tab-btn-sim5x2').count() === 1 && await page.locator('#sidebar-btn-sim5x2').count() === 1);

  // Põe o app com loja e equipe, como depois do login.
  await page.evaluate((d) => {
    LOJA = 'Bangu';
    usuarioLogado = { nome: 'Tiago', cargo: 'mestre' };
    comissoesWD = { funcs: d.funcs.map(f => ({ ...f, dias: Array(7).fill('PRESENTE') })) };
  }, BANGU);
  await page.evaluate(() => abrirSim5x2());
  await page.waitForFunction(() => { const e = document.getElementById('sim5x2-corpo'); return e && /pessoa-dias/.test(e.textContent); }, { timeout: 20000 });

  const txt = () => page.evaluate(() => document.getElementById('sim5x2-corpo').textContent.replace(/\s+/g,' ').trim());
  let t = await txt();

  // O topo lidera com HORAS, não com pessoas: a direção é não contratar e cobrir com
  // jornada. Com "faltam 6 pessoas" em destaque, a tela dava a resposta oposta à da
  // estratégia — e a de cima é a que o olho lê primeiro.
  check('o topo responde se cabe nas 42h, não quantas pessoas faltam',
    /(Cabe|Não cabe) nas 42h/.test(t) && /precisaria de [\d,]+h por semana/.test(t),
    t.slice(0, 260));
  check('a contagem de pessoas continua, mas como apoio e já dizendo a direção',
    /equivaleria a 6 pessoas a mais/.test(t) && /a direção é cobrir com jornada/.test(t),
    (t.match(/equivaleria[\s\S]{0,140}/) || [''])[0]);
  check('e "faltam N" não aparece mais como manchete',
    !/faltam 6\b/.test(t.slice(0, 200)), t.slice(0, 200));
  // Número tirado do próprio motor, não cravado aqui: cravar faria o teste medir o
  // fixture em vez de medir se a tela mostra a conta que o motor fez.
  const esperado = await page.evaluate(() =>
    window.gnSim5x2Resumo(_sim5x2.funcs, _sim5x2.folgas, _sim5x2.perfil).pessoaDiasHoje);
  check('e mostra a conta por trás, em vez de só o número',
    new RegExp(esperado + ' pessoa-dias por semana').test(t) && esperado > 100,
    `esperava ${esperado} · ` + (t.match(/pessoa-dias[\s\S]{0,120}/) || [''])[0]);
  check('a semana aparece dia a dia', /Segunda/.test(t) && /Domingo/.test(t));
  check('com alerta de aperto citando o patamar real da loja',
    /acima do que a loja costuma segurar nesse dia/.test(t), (t.match(/Terça:[^🚨⚠️]{0,160}/) || [''])[0]);
  check('e a lista de quem folga quando', /Folgas de cada um/.test(t));

  // ── O que mais importa: a escala real não é tocada ────────────────────────
  check('abrir a simulação não escreve NADA em lugar nenhum',
    escritas.length === 0, JSON.stringify(escritas));

  // Mexer nas folgas e salvar um cenário.
  await page.evaluate(() => _sim5x2Toggle(0, 3));
  t = await txt();
  check('mexer numa folga redesenha a tela na hora', /Folgas de cada um/.test(t));
  await page.evaluate(() => { document.getElementById('sim5x2-nome').value = 'Proposta A'; });
  await page.evaluate(() => _sim5x2Salvar());
  await page.waitForFunction(() => /Cenário salvo/.test(document.getElementById('sim5x2-msg').textContent), { timeout: 15000 });

  check('salvar grava só em gn_escala_simulacao',
    escritas.length > 0 && escritas.every(e => e.url === 'gn_escala_simulacao'), JSON.stringify(escritas));
  check('e NUNCA em gn_comissoes, que é a escala real',
    !escritas.some(e => /gn_comissoes/.test(e.url)), JSON.stringify(escritas));
  check('o cenário vai com a equipe junto, pra reabrir certo meses depois',
    salvos.length === 1 && Array.isArray(salvos[0].dados.funcs) && salvos[0].dados.funcs.length === BANGU.funcs.length,
    JSON.stringify(Object.keys((salvos[0]||{}).dados||{})));
  check('e com o nome de quem salvou', salvos[0] && salvos[0].criado_por === 'Tiago', JSON.stringify(salvos[0]));
  check('cenário salvo aparece na lista', /Proposta A/.test(await txt()));

  // Sem nome não salva — senão vira uma pilha de cenários sem dono.
  await page.evaluate(() => { document.getElementById('sim5x2-nome').value = '   '; });
  const antes = salvos.length;
  await page.evaluate(() => _sim5x2Salvar());
  check('cenário sem nome não é salvo', salvos.length === antes,
    await page.evaluate(() => document.getElementById('sim5x2-msg').textContent));

  // Zerar e sugerir de novo.
  await page.evaluate(() => _sim5x2Limpar());
  // Com a inicial só, segunda/sexta e quarta/quinta ficavam iguais na tela — e é nesses
  // botões que a folga é marcada.
  const rotulos = await page.evaluate(() =>
    [...document.querySelectorAll('#sim5x2-corpo button')].map(b=>b.textContent.trim())
      .filter(t => /^[A-ZÁ][a-zá]{2}$/.test(t)).slice(0, 7));
  check('cada dia tem um rótulo distinto nos botões de folga',
    new Set(rotulos).size === 7, JSON.stringify(rotulos));

  check('zerar deixa todo mundo sem folga, pra montar do zero',
    await page.evaluate(() => Object.values(_sim5x2.folgas).every(f => !f.length)));
  await page.evaluate(() => _sim5x2Resugerir());
  check('sugerir de novo devolve as 2 folgas de cada um',
    await page.evaluate(() => _sim5x2.funcs.every((f, i) => (_sim5x2.folgas[i] || []).length === 2)));

  // ── A folga de domingo ────────────────────────────────────────────────────
  // O domingo é o dia que mais vende E o dia em que a lei tira gente: mulher folga um
  // domingo sim, outro não; homem, um por mês. Sem o sexo preenchido a aba não pode
  // inventar o número — tem que pedir o cadastro.
  // O sexo tem que CHEGAR do cadastro até a aba. Copiar só nome/setor fazia a aba dizer
  // "ninguém com sexo informado" com a loja inteira preenchida — e o número do domingo
  // sumia sem ninguém perceber.
  const chegou = await page.evaluate(() => {
    comissoesWD = { funcs: [{ nome:'Fulana', setor:'Salão', sexo:'F' }, { nome:'Beltrano', setor:'Salão', sexo:'M' }] };
    _sim5x2 = null;
    return abrirSim5x2().then(() => _sim5x2.funcs.map(f => f.sexo));
  });
  check('o sexo do cadastro chega na simulação', JSON.stringify(chegou) === '["F","M"]', JSON.stringify(chegou));
  await page.evaluate((d) => {
    comissoesWD = { funcs: d.funcs.map(f => ({ ...f, dias: Array(7).fill('PRESENTE') })) };
    _sim5x2 = null;
    return abrirSim5x2();
  }, BANGU);

  let t2 = await txt();
  check('sem o sexo preenchido, a aba pede o cadastro em vez de dizer que ninguém falta',
    /FOLGA DE DOMINGO/.test(t2) && /sem isso não dá pra calcular/.test(t2),
    (t2.match(/FOLGA DE DOMINGO[\s\S]{0,200}/) || [''])[0]);
  check('e aponta onde preencher', /na aba Escala/.test(t2) || /Escala/.test(t2));

  // Com a equipe preenchida, o número aparece — e ele depende de quantas mulheres são.
  await page.evaluate(() => {
    _sim5x2.funcs = _sim5x2.funcs.map((f, i) => ({ ...f, sexo: i % 2 === 0 ? 'F' : 'M' }));
    renderSim5x2();
  });
  t2 = await txt();
  check('com o sexo preenchido, a aba diz quantos saem no domingo',
    /por direito de folga dominical saem/.test(t2), (t2.match(/FOLGA DE DOMINGO[\s\S]{0,220}/) || [''])[0]);
  check('e dá o tamanho do extra a contratar',
    /é o tamanho do extra/.test(t2) || /cobre a obriga/.test(t2),
    (t2.match(/FOLGA DE DOMINGO[\s\S]{0,260}/) || [''])[0]);

  // Mais mulheres = domingo mais apertado. É a pergunta que o dono fez.
  const comparado = await page.evaluate(() => {
    const todasF = _sim5x2.funcs.map(f => ({ ...f, sexo: 'F' }));
    const todosM = _sim5x2.funcs.map(f => ({ ...f, sexo: 'M' }));
    return { f: window.gnSim5x2Domingo(todasF, {}).porDireito, m: window.gnSim5x2Domingo(todosM, {}).porDireito };
  });
  check('a mesma loja só com mulheres perde o dobro no domingo',
    Math.abs(comparado.f - comparado.m * 2) < 0.1, JSON.stringify(comparado));

  // O campo novo precisa existir no cadastro da Escala, senão não há como preencher.
  const temCampo = await page.evaluate(() => typeof updComissoesSexo === 'function');
  check('o cadastro da Escala tem onde informar o sexo', temCampo);
  const gravou = await page.evaluate(() => {
    comissoesWD = { funcs: [{ nome: 'Fulana', setor: 'Salão' }] };
    updComissoesSexo(0, 'F');
    const a = comissoesWD.funcs[0].sexo;
    updComissoesSexo(0, 'lixo');
    return { a, b: comissoesWD.funcs[0].sexo };
  });
  check('o campo grava F e recusa valor fora do esperado',
    gravou.a === 'F' && gravou.b === '', JSON.stringify(gravou));

  // ── Jornada e banco de horas ──────────────────────────────────────────────
  // 42h semanais é a meta; o que passar vira banco e tem que zerar em 6 meses. É a conta
  // que decide se a 5x2 se sustenta sem contratar.
  t2 = await txt();
  check('o bloco de jornada e banco de horas é o topo da aba',
    /^JORNADA E BANCO DE HORAS/.test(t2), t2.slice(0, 200));
  check('e aparece uma vez só, não duplicado',
    (t2.match(/JORNADA E BANCO DE HORAS/g) || []).length === 1,
    (t2.match(/JORNADA E BANCO DE HORAS/g) || []).length);
  check('com a meta de 42h e o teto de 10h explícitos',
    /42h por semana/.test(t2) && /Teto legal: 10h\/dia/.test(t2),
    (t2.match(/JORNADA E BANCO[\s\S]{0,320}/) || [''])[0]);
  check('e diz quantas horas por pessoa a semana exige',
    /precisaria de [\d,]+h por semana/.test(t2), (t2.match(/precisaria de[^.]{0,120}/) || [''])[0]);

  // O campo de horas é editável — foi o pedido: "ter a opção de colocar as horas".
  const temCampoH = await page.locator('#sim5x2-horas').count();
  check('a jornada por dia é um campo que dá pra mudar', temCampoH === 1);
  // input[type=number] descarta "8,4" com vírgula e fica VAZIO na tela — o campo existia
  // mas não mostrava nada, e ninguém sabia qual jornada estava sendo simulada.
  const valorNaTela = await page.locator('#sim5x2-horas').inputValue();
  check('e vem preenchido com a jornada atual, não vazio',
    valorNaTela !== '' && Math.abs(parseFloat(valorNaTela) - await page.evaluate(() => _sim5x2.horasDia)) < 0.01,
    'valor no campo: ' + JSON.stringify(valorNaTela));
  const antesH = await page.evaluate(() => _sim5x2.horasDia);
  await page.evaluate(() => _sim5x2SetHoras('9'));
  check('mudar a jornada muda o estado', await page.evaluate(() => _sim5x2.horasDia) === 9, antesH);
  t2 = await txt();
  check('e a conta da semana acompanha', /precisaria de [\d,]+h por semana/.test(t2));

  // Jornada absurda não vira simulação.
  await page.evaluate(() => _sim5x2SetHoras('40'));
  check('jornada fora do mundo real é recusada, em vez de virar um banco fantasia',
    await page.evaluate(() => _sim5x2.horasDia) === 9);
  await page.evaluate(() => _sim5x2SetHoras('abc'));
  check('texto no lugar do número também é recusado',
    await page.evaluate(() => _sim5x2.horasDia) === 9);
  await page.evaluate(() => _sim5x2SetHoras('11'));
  t2 = await txt();
  check('jornada acima do teto legal é avisada na tela',
    /passa do teto legal/.test(t2), (t2.match(/JORNADA E BANCO[\s\S]{0,340}/) || [''])[0]);
  await page.evaluate(() => _sim5x2SetHoras('8.4'));

  // As horas de cada um aparecem na lista — a média da loja esconde quem estoura.
  t2 = await txt();
  check('cada pessoa mostra as horas da sua semana', /42h/.test(t2),
    (t2.match(/FOLGAS DE CADA UM[\s\S]{0,200}/) || [''])[0]);

  // O relatório sai no padrão dos outros.
  const pdf = await page.evaluate(() => {
    let out = ''; const o = window.open;
    window.open = () => ({ document: { write: h => { out = h; }, close: () => {} } });
    try { gerarPDFSim5x2(); } finally { window.open = o; }
    return out;
  });
  check('o relatório sai no padrão GN', /class="marca-gn">GN</.test(pdf) && /Simula..o 5x2/.test(pdf), pdf.slice(0, 200));
  check('e leva a folga de domingo junto', /Folga de domingo/.test(pdf), (pdf.match(/Folga de domingo[\s\S]{0,160}/) || [''])[0]);
  check('e a jornada com o banco de horas — a "provisão" da escala',
    /Jornada e banco de horas/.test(pdf) && /meta 42h\/semana/.test(pdf),
    (pdf.match(/Jornada e banco[\s\S]{0,220}/) || [''])[0]);
  check('e avisa, no papel, que é rascunho e não altera a escala',
    /n.o altera a escala/i.test(pdf), (pdf.match(/[Rr]ascunho[\s\S]{0,90}/) || [''])[0]);

  check('nenhum erro de JS no caminho todo', erros.length === 0, erros.join(' | '));

  await ctx.close(); await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
