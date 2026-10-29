// Veio de um CI vermelho: a e2e_utensilio_louca.js falhou no GitHub e passava local. Não
// era instabilidade de rede — era colisão de id.
//
// Manutenção, utensílios, faltas, retiradas, entradas manuais e parcelas nasciam com
// `id: Date.now()`. Dois itens criados no MESMO milissegundo ficavam com o mesmo id, e o
// id é o que identifica o item pra editar (`find`), pra excluir (`filter`) e pra mesclar
// entre aparelhos (_mesclarArrChk + _pendingDelChk).
//
// MEDIDO na própria página antes de mexer, 300 criações seguidas:
//   27 colisões (9%);
//   com a colisão, updateManut editou o item ERRADO;
//   e o filtro de exclusão apagou os DOIS — inclusive marcando os dois pro servidor.
//
// Clicando na mão é difícil chegar lá: exige dois cliques dentro do mesmo milissegundo. O
// caminho alcançável é o carry do dia anterior, que cria a lista INTEIRA de uma vez — os
// `+i+1` e `+i+100` que havia nessas linhas eram um remendo pra isso, e remendo que não
// cobria o clique que viesse logo em seguida, dentro da mesma janela.
//
// O id continua NUMÉRICO de propósito: os já gravados são números, e trocar o tipo
// quebraria a comparação com o que está no banco.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const RODADAS = 300;

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof addManutencao === 'function' && typeof addFalta === 'function'
        && typeof updateManut === 'function' && typeof _utensNovoRegistrar === 'function'; }
    catch (e) { return false; } }, null, { timeout: 25000 });
  await page.evaluate(() => { hideLogin(); LOJA = 'Pedreira';
    usuarioLogado = { id:1, nome:'Tiago', cargo:'gerente', loja:'PEDREIRA' }; });

  // ══ 1. DUAS CRIAÇÕES SEGUIDAS NÃO COMPARTILHAM ID ═══════════════════════════════
  const manut = await page.evaluate((N) => {
    let colisoes = 0;
    for (let i = 0; i < N; i++) {
      state.manutencao = [];
      addManutencao(); const a = state.manutencao[0].id;
      addManutencao(); const b = state.manutencao[0].id;
      if (a === b) colisoes++;
    }
    return { colisoes };
  }, RODADAS);
  check(`manutenção: nenhuma colisão em ${RODADAS} criações seguidas`,
    manut.colisoes === 0, JSON.stringify(manut));

  const faltas = await page.evaluate((N) => {
    let colisoes = 0;
    for (let i = 0; i < N; i++) {
      state.faltas = [];
      addFalta(); const a = state.faltas[state.faltas.length - 1].id;
      addFalta(); const b = state.faltas[state.faltas.length - 1].id;
      if (a === b) colisoes++;
    }
    return { colisoes };
  }, RODADAS);
  check(`faltas: nenhuma colisão em ${RODADAS} criações seguidas`,
    faltas.colisoes === 0, JSON.stringify(faltas));

  // Utensílio e manutenção dividem o MESMO array e o mesmo espaço de id.
  const misto = await page.evaluate((N) => {
    let colisoes = 0;
    for (let i = 0; i < N; i++) {
      state.manutencao = [];
      addManutencao(); const a = state.manutencao[0].id;
      _utensNovo = { nome: 'Copo', qtd: '2', situacao: 'Quebrou', setor: 'Salão' };
      _utensNovoRegistrar(); const b = state.manutencao[0].id;
      if (a === b) colisoes++;
    }
    return { colisoes };
  }, RODADAS);
  check(`utensílio e manutenção no mesmo array: nenhuma colisão em ${RODADAS}`,
    misto.colisoes === 0, JSON.stringify(misto));

  // Dois utensílios SEGUIDOS, sem manutenção no meio. Alternando os dois, o id que vem do
  // contador já está à frente do relógio e esconde um gerador revertido do outro lado —
  // a mutação que devolvia `Date.now()` só ao utensílio passava por isso.
  const utens = await page.evaluate((N) => {
    let colisoes = 0;
    for (let i = 0; i < N; i++) {
      state.manutencao = [];
      _utensNovo = { nome: 'Copo', qtd: '2', situacao: 'Quebrou', setor: 'Salão' };
      _utensNovoRegistrar(); const a = state.manutencao[0].id;
      _utensNovo = { nome: 'Prato', qtd: '1', situacao: 'Faltando', setor: 'Cozinha' };
      _utensNovoRegistrar(); const b = state.manutencao[0].id;
      if (a === b) colisoes++;
    }
    return { colisoes };
  }, RODADAS);
  check(`dois utensílios seguidos: nenhuma colisão em ${RODADAS}`,
    utens.colisoes === 0, JSON.stringify(utens));

  // ══ 2. A CONSEQUÊNCIA QUE A COLISÃO CAUSAVA ═════════════════════════════════════
  // É o que importa de verdade: editar um mudava o outro, e excluir um apagava os dois.
  // Em N rodadas, não numa só: um par que por acaso não colide faz a verificação passar
  // sem medir nada — foi o que aconteceu contra o origin/main, onde 60% dos pares colidem
  // e estas duas ainda assim passaram na primeira escrita.
  const consequencia = await page.evaluate((N) => {
    let editouErrado = 0, apagouDemais = 0;
    for (let i = 0; i < N; i++) {
      state.manutencao = [];
      addManutencao(); addManutencao();
      const [primeiro, segundo] = state.manutencao;
      updateManut(segundo.id, 'descricao', 'era pro de baixo');
      if (segundo.descricao !== 'era pro de baixo' || primeiro.descricao === 'era pro de baixo') editouErrado++;
      if (state.manutencao.filter(m => m.id !== segundo.id).length !== 1) apagouDemais++;
    }
    return { editouErrado, apagouDemais, rodadas: N };
  }, RODADAS);
  check(`editar um item muda SÓ ele, nas ${RODADAS} rodadas`,
    consequencia.editouErrado === 0, JSON.stringify(consequencia));
  check(`e excluir um deixa o outro de pé, nas ${RODADAS} rodadas`,
    consequencia.apagouDemais === 0, JSON.stringify(consequencia));

  // ══ 3. O CAMINHO ALCANÇÁVEL: A LISTA INTEIRA DE UMA VEZ ═════════════════════════
  // O carry do dia anterior cria tudo num bloco só, e o clique seguinte caía dentro da
  // mesma janela de milissegundos. É por isso que existia o `+i+1` nessas linhas.
  // Os cliques vêm ALGUNS MILISSEGUNDOS depois, não no mesmo instante: é aí que mora a
  // colisão. O carry de 60 itens ocupa uma faixa de 60 ms à frente do relógio, então o
  // lançamento feito 5, 10, 20 ms depois cai DENTRO dessa faixa. Um clique imediato, no
  // mesmo milissegundo do carry, não colide — e uma verificação que só testasse esse caso
  // passaria com o remendo antigo no lugar.
  const carry = await page.evaluate(async () => {
    const espera = ms => new Promise(r => setTimeout(r, ms));
    const anterior = Array.from({ length: 60 }, (_, i) => ({ nome: 'Item ' + i, quantidade: '1', urgencia: 'Media' }));
    state.faltas = anterior.map(f => ({ ...f, id: novoIdLocalChk() }));
    for (const ms of [3, 7, 12, 20, 35]) { await espera(ms); addFalta(); }
    const ids = state.faltas.map(f => f.id);
    return { total: ids.length, unicos: new Set(ids).size };
  });
  check('carry de 60 itens e os lançamentos seguintes: todos com id próprio',
    carry.total === 65 && carry.unicos === 65, JSON.stringify(carry));

  // ══ 4. O ID CONTINUA NUMÉRICO E CRESCENTE ═══════════════════════════════════════
  // Trocar pra texto quebraria a comparação com os ids já gravados no banco, que são
  // número — o item salvo deixaria de ser encontrado pelo próprio app.
  const forma = await page.evaluate(() => {
    const ids = [];
    for (let i = 0; i < 50; i++) ids.push(novoIdLocalChk());
    return { tipos: [...new Set(ids.map(x => typeof x))],
             inteiros: ids.every(Number.isInteger),
             crescente: ids.every((v, i) => i === 0 || v > ids[i - 1]),
             perto: Math.abs(ids[0] - Date.now()) < 60000 };
  });
  check('o id é número', forma.tipos.length === 1 && forma.tipos[0] === 'number', JSON.stringify(forma.tipos));
  check('e inteiro, como os que já estão gravados', forma.inteiros === true, JSON.stringify(forma));
  check('sempre crescente, nunca repetido', forma.crescente === true, JSON.stringify(forma));
  check('e ainda ancorado no relógio, não um contador do zero',
    forma.perto === true, JSON.stringify(forma));

  // ══ 4b. NENHUM CAMINHO DE CRIAÇÃO PODE VOLTAR AO RELÓGIO ════════════════════════
  // Os carries do dia anterior vivem dentro de onDataChange e initAppWithLoja, funções que
  // buscam e renderizam o dia inteiro — exercitá-las uma a uma custaria caro e ainda
  // deixaria de fora o caminho que alguém criar amanhã. Esta é a trava que cobre todos: no
  // código-fonte não pode sobrar `id: Date.now()`. A exceção é o id que já leva sufixo
  // aleatório, que é único por construção.
  const fs = require('fs');
  const fontes = [['gn-checklist.html', CHK], ['gn-lojas.html', LOJAS]];
  const sobraram = [];
  fontes.forEach(([nome, caminho]) => {
    const txt = fs.readFileSync(caminho, 'utf8');
    txt.split('\n').forEach((linha, i) => {
      if (/^\s*\/\//.test(linha)) return;                       // comentário não é código
      const m = linha.match(/\bid\s*:\s*Date\.now\(\)[^,}]*/g);
      (m || []).forEach(trecho => {
        if (/Math\.random/.test(trecho)) return;                  // já é único por construção
        sobraram.push(nome + ':' + (i + 1) + ' → ' + trecho.trim());
      });
    });
  });
  check('nenhum caminho de criação gera id a partir do relógio puro',
    sobraram.length === 0, sobraram.join(' | '));

  const reaisChk = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS no Check-list', reaisChk.length === 0, reaisChk.slice(0, 3).join(' | '));

  // ══ 5. O MESMO NO APP LOJAS (parcelas da calculadora) ═══════════════════════════
  const page2 = await ctx.newPage();
  const erros2 = []; page2.on('pageerror', e => erros2.push(String(e.message || e)));
  await page2.goto('file://' + LOJAS);
  await page2.waitForFunction(() => { try { return typeof novoIdLocalLojas === 'function'
    && Array.isArray(_calcParcelas); } catch (e) { return false; } }, null, { timeout: 25000 });
  const parcelas = await page2.evaluate((N) => {
    let colisoes = 0;
    for (let i = 0; i < N; i++) {
      const a = novoIdLocalLojas(), b = novoIdLocalLojas();
      if (a === b) colisoes++;
    }
    // A consequência aqui: tirar uma parcela tirava duas, e o total ficava errado.
    _calcParcelas = [{ id: novoIdLocalLojas(), valor: 10 }, { id: novoIdLocalLojas(), valor: 20 }];
    const alvo = _calcParcelas[1].id;
    const sobrou = _calcParcelas.filter(p => p.id !== alvo);
    return { colisoes, sobraram: sobrou.length, total: sobrou.reduce((a, p) => a + p.valor, 0) };
  }, RODADAS);
  check(`parcelas: nenhuma colisão em ${RODADAS} criações seguidas`,
    parcelas.colisoes === 0, JSON.stringify(parcelas));
  check('e tirar uma parcela deixa a outra, com o total certo',
    parcelas.sobraram === 1 && parcelas.total === 10, JSON.stringify(parcelas));
  const reaisLojas = erros2.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS no Lojas', reaisLojas.length === 0, reaisLojas.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
