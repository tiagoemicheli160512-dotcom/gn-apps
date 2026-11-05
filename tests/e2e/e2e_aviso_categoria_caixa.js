// "Alargar o filtro e indicar no app caixa um aviso sobre lançar corretamente as despesas."
//
// O MOTIVO, medido: "Outros" é 44% de todo o dinheiro que sai do caixa da rede — R$ 40.137
// de R$ 80.322 em Out/26, 409 lançamentos. É a categoria que não diz o que foi, e por isso
// cresce: na dúvida, vai nela.
//
// Dentro dela mora um caso que não é dúvida: extra lançado como "Outros". Desde 01/10 a
// Guarulhos fez isso 31 vezes (R$ 4.300), escrevendo "EXTRA" ou "dobra fulano" na descrição.
// No Painel a loja aparecia em ÚLTIMO em extra (R$ 500) sendo a PRIMEIRA da rede (R$ 4.800).
//
// A regra que decide isso é UMA só, em gn-lojas-config.js, porque os dois lados dependem
// dela: o Caixa pra avisar na hora de lançar, o Painel pra somar na hora de ler. Esta suíte
// cobra os dois — o comportamento do aviso aqui, e a regra em si com os textos reais da
// base, pra que ela não possa ser afrouxada num lado sem o outro ver.
//
// O aviso NÃO TRAVA o lançamento, e isso é cobrado: travar o caixa no fim do turno por causa
// de uma palavra num campo livre custa mais do que a categoria errada.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra !== undefined ? ' >> ' + String(extra).slice(0, 220) : '')); c ? ok++ : falhou++; };

// Textos reais da base (Out/26 em diante), dos dois lados da regra.
const SAO_EXTRA = ['EXTRA', 'extra', 'extra jonatan', 'extra taiane', 'EXTRA DIA 04/10',
                   'dobra', 'dobra daniella', 'Dobra gerência', 'DOBRA DANIELLA 21/10 E 25/10',
                   'dobra folga gerente', 'Dobra chapeiro Mauro', 'dobra gerencia Edna'];
const NAO_SAO   = ['mercado', 'CONSUMAÇÃO MUSICOS', 'consumo banda', 'LIMPEZA VIDROS',
                   'SEGURANÇA TIÃO', 'filmagem Marketing', 'Diferença de comissão',
                   'ANIVERSARIANTE DO MES', 'conserto liquidificador', 'pedra amolar',
                   'QUATRO DIAS TRABALHADOS/FUNCIONARIO ARTHUR/GARÇOM',
                   'extrato bancario', 'extração de dente', 'dobradiça da porta'];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const escritas = [];
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), m = req.method();
    if (m !== 'GET') {
      escritas.push({ metodo: m, alvo: req.url().split('/rest/v1/')[1].split('?')[0],
                      body: req.postData() ? JSON.parse(req.postData()) : null });
      return r.fulfill({ status: 200, contentType: 'application/json',
                         body: JSON.stringify([{ id: 'd' + escritas.length, ...(req.postData() ? JSON.parse(req.postData()) : {}) }]) });
    }
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message)));
  await page.goto('file://' + ARQ);
  try {
    await page.waitForFunction(() => {
      try { return typeof _montarSeletorSaidas === 'function' && typeof addSaida === 'function'
                && typeof S !== 'undefined'; } catch (e) { return false; }
    }, { timeout: 25000 });
  } catch (e) { console.log('FALHOU: o app Caixa não carregou'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }

  // ── A regra, com os textos reais — vale pros dois apps ────────────────────────────────
  const regra = await page.evaluate(({ sim, nao }) => {
    if (!window.gnDespesaEhExtra || !window.gnDespesaCategoriaSugerida) return { ausente: true };
    const eh = (cat, nome, just) => window.gnDespesaEhExtra({ categoria: cat, nome, justificativa: just });
    return {
      pegaTodos:   sim.filter(t => !eh('outros', t, '')),
      pegaDemais:  nao.filter(t =>  eh('outros', t, '')),
      categoriaCerta: eh('funcionario_extra', '', ''),
      // Só opina sobre "Outros": quem escolheu categoria específica escolheu de propósito.
      naoOpinaEmOutras: ['transporte', 'alimentacao', 'insumo', 'manutencao']
        .filter(c => eh(c, 'extra do garçom', '')),
      pelaJustificativa: eh('outros', '', 'Dobra folga do Fernando'),
      vazio: eh('outros', '', ''),
      sugereCerta: window.gnDespesaCategoriaSugerida('outros', 'EXTRA', ''),
      naoSugereNada: window.gnDespesaCategoriaSugerida('outros', 'mercado', ''),
      naoSugereEmOutraCat: window.gnDespesaCategoriaSugerida('transporte', 'EXTRA', ''),
    };
  }, { sim: SAO_EXTRA, nao: NAO_SAO });
  if (regra.ausente) {
    console.log('FALHOU: a regra compartilhada (gnDespesaEhExtra) não existe — é recurso novo, contraprova esperada');
    console.log('\n0 OK, 29 falhou'); await browser.close(); process.exit(1);
  }
  check(`reconhece os ${SAO_EXTRA.length} jeitos que as lojas escrevem extra`, regra.pegaTodos.length === 0, JSON.stringify(regra.pegaTodos));
  check(`e não confunde com os ${NAO_SAO.length} "Outros" que não são extra`, regra.pegaDemais.length === 0, JSON.stringify(regra.pegaDemais));
  check('"extrato", "extração" e "dobradiça" ficam de fora — borda de palavra',
    !regra.pegaDemais.length && NAO_SAO.includes('extrato bancario'));
  check('quem já está na categoria certa continua sendo extra', regra.categoriaCerta === true);
  check('não opina sobre quem escolheu categoria específica', regra.naoOpinaEmOutras.length === 0, JSON.stringify(regra.naoOpinaEmOutras));
  check('lê também a justificativa (244 de 1.297 lançamentos vêm sem descrição)', regra.pelaJustificativa === true);
  check('"Outros" sem texto nenhum não vira extra por chute', regra.vazio === false);
  check('sugere a categoria certa, e só quando há o que corrigir',
    regra.sugereCerta === 'funcionario_extra' && regra.naoSugereNada === '' && regra.naoSugereEmOutraCat === '');

  // ── O aviso na tela ───────────────────────────────────────────────────────────────────
  const montar = () => page.evaluate(() => {
    S.user = { nome: 'Tiago', cargo: 'gerente' };
    S.loja = 'GUARULHOS'; S.turnoSel = 'NOITE'; S.modoConsulta = false; S.saidas = [];
    S.fech = { id: 'fech-1', loja: 'GUARULHOS', data: '2026-11-05', turno: 'NOITE', status: 'ABERTO' };
    // A tela de login e a aba de saídas começam escondidas. Elemento dentro de container
    // oculto não recebe foco, e aí o teste mediria o harness em vez do app — foi o que
    // aconteceu na primeira rodada, com `offsetParent` nulo e o foco parado no body.
    document.getElementById('telaLogin').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('pane-saidas').classList.remove('hidden');
    _montarSeletorSaidas();
  });
  const preencher = (cat, nome, just) => page.evaluate(({ cat, nome, just }) => {
    document.getElementById('saidaCat').value = cat;
    _syncSaidaForm();
    document.getElementById('saidaNome').value = nome || '';
    if (just !== undefined && document.getElementById('saidaJust')) document.getElementById('saidaJust').value = just;
    _syncSaidaAvisoCat();
    const box = document.getElementById('saidaAvisoCat');
    return { visivel: !box.classList.contains('hidden'), html: box.innerHTML,
             texto: box.textContent, cor: box.style.color };
  }, { cat, nome, just });

  await montar();
  const semCat = await preencher('', '');
  check('sem categoria escolhida, nenhum aviso na tela', !semCat.visivel, semCat.texto);

  const transp = await preencher('transporte', 'passagem do Gean');
  check('categoria específica: nenhum aviso — o aviso que aparece à toa é o aviso que ninguém lê', !transp.visivel, transp.texto);

  const outros = await preencher('outros', '');
  check('escolheu "Outros": aparece a lembrança de que ela não diz o que foi',
    outros.visivel && /não diz o que foi/.test(outros.texto), outros.texto);
  check('e essa lembrança pede a descrição, que é o que sobra pra conferir depois',
    /escreva na descrição o que foi/i.test(outros.texto), outros.texto);
  check('ela é discreta: nem botão, nem cor de alarme',
    !/\<button/.test(outros.html) && outros.cor === 'var(--mut)', outros.cor);

  const mercado = await preencher('outros', 'mercado do bairro');
  check('"Outros" com descrição que não é extra segue só com a lembrança',
    mercado.visivel && !/<button/.test(mercado.html) && /não diz o que foi/.test(mercado.texto));

  const extra = await preencher('outros', 'EXTRA');
  check('escreveu "EXTRA" em "Outros": o aviso vira firme e diz a categoria certa',
    extra.visivel && /parece Funcionário Extra/.test(extra.texto), extra.texto);
  check('e explica a consequência, não só a regra',
    /some do controle de extra/.test(extra.texto), extra.texto);
  check('com o botão que troca a categoria no lugar',
    /<button[^>]*_trocarCatSaida\('funcionario_extra'\)/.test(extra.html) &&
    /Mudar para Funcionário Extra/.test(extra.texto), extra.html.slice(0, 180));
  check('em cor de aviso, não na cor da lembrança', extra.cor === 'var(--ouro)', extra.cor);

  const dobra = await preencher('outros', 'dobra daniella');
  check('"dobra fulano" também — é como a Guarulhos escreve', /parece Funcionário Extra/.test(dobra.texto));

  // Reage enquanto se digita: quem escreve a descrição depois de escolher a categoria é a
  // maioria, e um aviso que só aparece ao trocar o seletor nunca apareceria pra ela.
  const digitando = await page.evaluate(() => {
    document.getElementById('saidaCat').value = 'outros'; _syncSaidaForm();
    const campo = document.getElementById('saidaNome');
    campo.value = 'ext';  campo.dispatchEvent(new Event('input'));
    const meio = document.getElementById('saidaAvisoCat').textContent;
    campo.value = 'extra do salão'; campo.dispatchEvent(new Event('input'));
    const fim = document.getElementById('saidaAvisoCat').textContent;
    return { meio, fim };
  });
  check('o aviso acompanha a digitação da descrição',
    !/parece Funcionário Extra/.test(digitando.meio) && /parece Funcionário Extra/.test(digitando.fim),
    JSON.stringify(digitando));

  // ── O botão faz o serviço inteiro ─────────────────────────────────────────────────────
  const trocou = await page.evaluate(() => {
    document.getElementById('saidaCat').value = 'outros'; _syncSaidaForm();
    document.getElementById('saidaNome').value = 'EXTRA'; _syncSaidaAvisoCat();
    _trocarCatSaida('funcionario_extra');
    return { cat: document.getElementById('saidaCat').value,
             avisoSumiu: document.getElementById('saidaAvisoCat').classList.contains('hidden'),
             justVisivel: !document.getElementById('saidaJustRow').classList.contains('hidden'),
             foco: document.activeElement ? document.activeElement.id : '',
             nomePreservado: document.getElementById('saidaNome').value };
  });
  check('o botão troca a categoria de verdade', trocou.cat === 'funcionario_extra', trocou.cat);
  check('e o aviso some — já foi atendido', trocou.avisoSumiu, JSON.stringify(trocou));
  check('abre a justificativa, que o extra exige, e põe o dedo nela',
    trocou.justVisivel && trocou.foco === 'saidaJust', JSON.stringify(trocou));
  check('sem apagar o que a pessoa já tinha escrito', trocou.nomePreservado === 'EXTRA', trocou.nomePreservado);

  // ── O aviso avisa, não impede ─────────────────────────────────────────────────────────
  // Travar o caixa no fim do turno por causa de uma palavra num campo livre custa mais do
  // que a categoria errada — a regra lê texto digitado às pressas.
  escritas.length = 0;
  const lancou = await page.evaluate(async () => {
    document.getElementById('saidaCat').value = 'outros'; _syncSaidaForm();
    document.getElementById('saidaNome').value = 'EXTRA';
    document.getElementById('saidaVal').value = '100,00';
    _syncSaidaAvisoCat();
    await addSaida();
    return { saidas: S.saidas.length };
  });
  const post = escritas.find(e => e.alvo === 'gn_caixa_despesa' && e.metodo === 'POST');
  check('quem insistir em "Outros" ainda consegue lançar — o aviso não trava o caixa',
    lancou.saidas === 1 && !!post, JSON.stringify(escritas));
  check('e vai pro banco como a pessoa escolheu, sem o app corrigir por conta própria',
    post && post.body.categoria === 'outros' && post.body.nome === 'EXTRA', JSON.stringify(post && post.body));
  // O que some é o aviso FIRME — ele falava da descrição, que acabou de ir pro banco. A
  // lembrança de "Outros" fica: a categoria continua escolhida pro próximo lançamento.
  const depois = await page.evaluate(() => {
    const box = document.getElementById('saidaAvisoCat');
    return { texto: box.textContent, botao: /<button/.test(box.innerHTML) };
  });
  check('depois de lançar, o aviso firme some — a descrição dele já foi embora',
    !/parece Funcionário Extra/.test(depois.texto) && !depois.botao, depois.texto);
  check('mas a lembrança de "Outros" fica, porque a categoria continua escolhida',
    /não diz o que foi/.test(depois.texto), depois.texto);

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
