// "Na loja de Nova Iguaçu, na aba Funcionários do app Gorjetas, todos os nomes
//  desapareceram na semana atual, semana 44."
//
// O cadastro não sumiu: a semana nunca herdou. O repique do Caixa grava a semana direto no
// banco pela RPC gn_sync_repique_comissoes, que faz jsonb_set em ['brutos'] e mais nada —
// a semana passa a existir SEM a chave `funcs`. Quando isso acontece antes de alguém abrir
// a semana no app, o `if(!state.allData[k])` do getWD não herda mais (a chave existe), e o
// preenchimento seguinte completava as 80 vagas VAZIAS. Aba em branco; e a primeira edição
// gravava essas 80 vagas vazias no servidor, deixando a semana sem nome de vez.
//
// Medido no banco em 29/10/2026: RANCHO (Nova Iguaçu) com 27 nomes na S43 e ZERO na S44,
// cuja semana tinha brutos de seg/ter/qua lançados pelo repique. As outras 10 lojas com
// nome na S44 — nelas alguém abriu a semana antes do repique chegar.
//
// O que esta suíte cobra, nesta ordem de importância:
//   1. semana criada só com brutos HERDA os nomes, sem perder o repique já lançado;
//   2. semana que o app JÁ gravou vazia NÃO se preenche sozinha na carga — getSaldoAntes
//      soma semana por semana, então encher uma semana fechada com 7 dias PRESENTE mudaria
//      o pagamento de todas as semanas seguintes. Ela avisa e oferece o clique;
//   3. o clique traz os nomes e também não perde o repique.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const DIR = process.env.DIR || CAMINHOS.PUBLICO;
const ARQ = process.env.ARQ_COM || (DIR + '/gn-comissoes.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// 27 nomes, como os de Nova Iguaçu na S43.
const NOMES = ['Adriana Lima','Alex Souza','Aline Barros','Ana Paula','Bruno Dias',
  'Carla Mendes','Cícero Alves','Daniel Rocha','Édson Vieira','Elaine Costa','Fábio Luz',
  'Gabriel Pinto','Helena Braga','Igor Nunes','Joana Prado','Júlio Matos','Karina Sá',
  'Lucas Reis','Márcia Melo','Nilton Paz','Otávio Cruz','Paula Rego','Renato Góis',
  'Sandra Lis','Tiago Abreu','Vera Pinho','Wesley Dantas'];
const mkFunc = (nome, i) => ({ id: i, nome, tipo: 'CLT / MENSALISTA', setor: 'Salão',
  turno: 'NOITE', horario: '15:00-23:00', dias: Array(7).fill('PRESENTE'),
  turnos: Array(7).fill(null), inicio_contrato: '2025-01-01', fim_contrato: '' });
// A S43 real tem faltas e folgas lançadas: é o que prova que o herdado zera os status.
const FUNCS_S43 = NOMES.map((n, i) => {
  const f = mkFunc(n, i);
  if (i === 0) f.dias = ['FALTA','PRESENTE','PRESENTE','FOLGA','PRESENTE','PRESENTE','PRESENTE'];
  if (i === 1) f.dias = ['PRESENTE','FÉRIAS','FÉRIAS','FÉRIAS','FÉRIAS','FÉRIAS','FÉRIAS'];
  return f;
});
const vazias = (n) => Array.from({ length: n }, (_, i) =>
  ({ id: i, nome: '', tipo: 'CLT / MENSALISTA', dias: Array(7).fill('PRESENTE'), turnos: Array(7).fill(null) }));

// Os brutos reais da S44 de Nova Iguaçu: seg/ter/qua lançados pelo repique do Caixa.
const BRUTOS_S44 = [402.26, 524.94, 399.27, 0, 0, 0, 0];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  // Quinta 29/10/2026: a semana vigente é a 42 no índice, rotulada S44 — a do pedido.
  await CAMINHOS.fixarRelogio(ctx, '2026-10-29T12:00:00');
  // Sem servir a lib do Supabase, createClient estoura e TODO `let` de topo do bloco inline
  // fica em TDZ — getWD inclusive, e a suíte mediria a ausência da lib (mesma armadilha
  // documentada em e2e_ordem_alfabetica).
  const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200,
    contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  const erros = [];
  // Monta o app com um all_data de partida e devolve o que a aba Funcionários mostra.
  const montar = async (allData) => {
    const page = await ctx.newPage();
    page.on('pageerror', e => erros.push(String(e.message || e)));
    await page.addInitScript(({ allData }) => {
      try {
        localStorage.setItem('gn_session_v1', JSON.stringify({ id: 1, nome: 'Tiago',
          cargo: 'mestre', loja: 'RANCHO', permissoes: { master: true, comissoes: true }, ts: Date.now() }));
        localStorage.setItem('gn_RANCHO_usuario', JSON.stringify('Tiago'));
        localStorage.setItem('gn_RANCHO_allData', JSON.stringify(allData));
        localStorage.setItem('gn_aviso_guia_v1', '1');
      } catch (e) {}
    }, { allData });
    await page.goto('file://' + ARQ);
    await page.waitForFunction(() => {
      try { return typeof getWD === 'function' && typeof calcSemIdxAtual === 'function'
             && LOJA === 'RANCHO' && Object.keys(state.allData || {}).length > 0; }
      catch (e) { return false; }
    }, null, { timeout: 25000 });
    return page;
  };

  const ler = (page) => page.evaluate(() => {
    const idx = calcSemIdxAtual();
    const wd = getWD(idx);
    const nomes = (wd.funcs || []).filter(f => f && f.nome && f.nome.trim()).map(f => f.nome.trim());
    const ct = document.createElement('div');
    renderFuncs(ct, CAL[idx]);
    const txt = ct.textContent.replace(/\s+/g, ' ').trim();
    // O nome fica no `value` de um <input>, que textContent não enxerga: ler só o texto
    // dava a aba por vazia mesmo cheia. É o campo que a pessoa vê.
    const naTela = [...ct.querySelectorAll('.fc-nome')].map(i => i.value.trim()).filter(Boolean);
    return { idx, rotulo: 'S' + String(CAL[idx].num).padStart(2, '0'), nomes, naTela,
      brutos: wd.brutos, txt, html: ct.innerHTML,
      diasDoPrimeiro: (wd.funcs.find(f => f.nome && f.nome.trim()) || {}).dias,
      gravado: (state.allData[String(idx)].funcs || []).filter(f => f && f.nome && f.nome.trim()).length };
  });

  // ══ 1. A semana do pedido: criada pelo repique, só com brutos ═══════════════════════
  // É a linha que a RPC deixa: jsonb_set(['brutos']) e mais nada — sem a chave `funcs`.
  const p1 = await montar({
    '41': { funcs: FUNCS_S43, brutos: [499.78,283.44,254.58,355.49,696.53,1231.14,1435.58],
            saidas: [], _lastEdit: 1793213249950 },
    '42': { brutos: BRUTOS_S44 },
  });
  const r1 = await ler(p1);

  check('a semana vigente em 29/10/2026 é a S44 (índice 42)',
    r1.idx === 42 && r1.rotulo === 'S44', r1.idx + ' / ' + r1.rotulo);
  check('semana criada só com brutos herda os 27 nomes da S43',
    r1.nomes.length === 27, r1.nomes.length + ' nomes: ' + r1.nomes.slice(0, 5).join(', '));
  check('e são os mesmos nomes, não outros',
    JSON.stringify(r1.nomes.slice().sort()) === JSON.stringify(NOMES.slice().sort()),
    r1.nomes.join(' | '));
  check('a aba Funcionários mostra os 27 nomes em vez de abrir em branco',
    r1.naTela.length === 27 && r1.naTela.includes('Adriana Lima') && r1.naTela.includes('Wesley Dantas'),
    r1.naTela.length + ': ' + r1.naTela.slice(0, 6).join(', '));
  check('o contador do topo diz 27, não 0', /27 \/ 80/.test(r1.txt), r1.txt.slice(0, 120));
  // O repique é dinheiro já lançado pelo Caixa: herdar nome não pode custar o bruto.
  check('o repique de seg/ter/qua continua lá depois de herdar',
    JSON.stringify(r1.brutos) === JSON.stringify(BRUTOS_S44), JSON.stringify(r1.brutos));
  // Semana nova começa limpa: a falta e as férias da S43 não vêm junto.
  check('os status vêm zerados em PRESENTE, sem a falta e as férias da S43',
    JSON.stringify(r1.diasDoPrimeiro) === JSON.stringify(Array(7).fill('PRESENTE')),
    JSON.stringify(r1.diasDoPrimeiro));
  check('e a aba não mostra o aviso de semana vazia, porque não está vazia',
    !/sem nenhum funcionário/.test(r1.txt), r1.txt.slice(0, 200));

  // ══ 2. A semana JÁ gravada vazia — o estado em que Nova Iguaçu ficou ═══════════════
  // Aqui a correção da carga não vale de propósito: a semana pode ser uma já fechada, e
  // encher de nomes com 7 dias PRESENTE mexeria no pagamento e no saldo das seguintes.
  const p2 = await montar({
    '41': { funcs: FUNCS_S43, brutos: [499.78,283.44,254.58,355.49,696.53,1231.14,1435.58], saidas: [], _lastEdit: 1793213249950 },
    '42': { funcs: vazias(80), brutos: BRUTOS_S44, dist: 'SIM', saidas: [], _lastEdit: 1793201353226 },
  });
  const r2 = await ler(p2);
  check('semana já gravada vazia NÃO se enche sozinha na carga',
    r2.nomes.length === 0 && r2.naTela.length === 0, r2.nomes.join(' | '));
  check('mas a aba avisa, em vez de só abrir em branco calada',
    /sem nenhum funcionário/.test(r2.txt), r2.txt.slice(0, 300));
  check('o aviso diz de qual semana os nomes viriam e quantos são',
    /A S43 tem 27 cadastrados/.test(r2.txt), r2.txt.slice(0, 300));
  check('e explica que o cadastro não se perdeu',
    /não se perdeu/.test(r2.txt), r2.txt.slice(0, 400));
  check('tem o botão pra trazer os nomes',
    /herdarNomesSemana\(\)/.test(r2.html) && /Trazer os 27 nomes da S43/.test(r2.txt), r2.txt.slice(0, 300));

  // ══ 3. O clique ════════════════════════════════════════════════════════════════════
  const r3 = await p2.evaluate(() => {
    herdarNomesSemana();
    const idx = calcSemIdxAtual();
    const wd = getWD(idx);
    const g = state.allData[String(idx)];
    return { nomes: (wd.funcs || []).filter(f => f && f.nome && f.nome.trim()).map(f => f.nome.trim()),
             brutos: g.brutos,
             gravados: (g.funcs || []).filter(f => f && f.nome && f.nome.trim()).length,
             log: (logEntries[0] || {}).desc };
  });
  check('o clique traz os 27 nomes', r3.nomes.length === 27, r3.nomes.length + '');
  check('e grava: não é só visual', r3.gravados === 27, r3.gravados + '');
  check('e o repique de seg/ter/qua sobrevive ao clique',
    JSON.stringify(r3.brutos) === JSON.stringify(BRUTOS_S44), JSON.stringify(r3.brutos));
  check('o clique entra no log, com a semana de origem',
    /S43/.test(r3.log || ''), r3.log);
  const r3b = await p2.evaluate(() => { herdarNomesSemana(); const idx = calcSemIdxAtual();
    return (getWD(idx).funcs || []).filter(f => f && f.nome && f.nome.trim()).length; });
  check('clicar de novo não duplica nem apaga', r3b === 27, r3b + '');

  // ══ 4. Semana passada vazia não é mexida pela carga ════════════════════════════════
  // getSaldoAntes percorre TODAS as semanas anteriores e alimenta calcSemana: preencher uma
  // semana fechada na carga mudaria o retido/saldo de cada semana seguinte, em silêncio.
  const p4 = await montar({
    '37': { funcs: FUNCS_S43, brutos: [100,100,100,100,100,100,100], saidas: [], _lastEdit: 1 },
    '38': { funcs: [], brutos: [521.06,290.22,534.55,604.51,1001.5,2391.32,2162.53], saidas: [], _lastEdit: 0 },
    '41': { funcs: FUNCS_S43, brutos: [1,1,1,1,1,1,1], saidas: [], _lastEdit: 1793213249950 },
    '42': { brutos: BRUTOS_S44 },
  });
  const r4 = await p4.evaluate(() => {
    const a = (state.allData['38'].funcs || []).filter(f => f && f.nome && f.nome.trim()).length;
    const b = (getWD(38).funcs || []).filter(f => f && f.nome && f.nome.trim()).length;
    return { gravado: a, lido: b };
  });
  check('semana fechada com funcs vazio continua vazia depois da carga',
    r4.gravado === 0 && r4.lido === 0, JSON.stringify(r4));

  // ══ 5. Semana que já tem nomes não é tocada ════════════════════════════════════════
  const p5 = await montar({
    '41': { funcs: FUNCS_S43, brutos: [1,1,1,1,1,1,1], saidas: [], _lastEdit: 1 },
    '42': { funcs: NOMES.slice(0, 3).map(mkFunc).concat(vazias(77)), brutos: BRUTOS_S44, saidas: [], _lastEdit: 2 },
  });
  const r5 = await ler(p5);
  check('semana com 3 nomes fica com 3: a herança não atropela cadastro existente',
    r5.nomes.length === 3 && r5.naTela.length === 3, r5.nomes.join(' | '));
  check('e sem aviso nenhum', !/sem nenhum funcionário/.test(r5.txt), r5.txt.slice(0, 160));

  // ══ 6. Sem semana anterior com nomes, não há o que herdar ══════════════════════════
  const p6 = await montar({ '42': { brutos: BRUTOS_S44 } });
  const r6 = await ler(p6);
  check('loja sem histórico abre vazia, sem inventar nome',
    r6.nomes.length === 0, r6.nomes.join(' | '));
  check('e sem o aviso, porque não há semana de onde trazer',
    !/sem nenhum funcionário/.test(r6.txt), r6.txt.slice(0, 200));
  const r6b = await p6.evaluate(() => { herdarNomesSemana();
    return (getWD(calcSemIdxAtual()).funcs || []).filter(f => f && f.nome && f.nome.trim()).length; });
  check('e chamar a herança na mão também não inventa', r6b === 0, r6b + '');

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
