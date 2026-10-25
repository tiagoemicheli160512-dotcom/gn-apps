// Duas coisas, no mesmo caminho (_carregarCarnesAutoLojas):
//
// 1. "Teve loja com entrada duplicada. A entrada tem que ser só a feita no app Lojas aba
//     Entrada, direto pela confirmação do fornecedor, que já definimos."
// 2. "Pode mudar pra usar a data real da nota."
//
// A entrada vem de duas fontes: a entrega conferida na portaria (datada pela data_entrega
// PROGRAMADA — nas carnes, sempre a segunda) e a nota de Entrada de Mercadoria (datada pela
// dataNF REAL — a carne chega terça ou quarta). Antes, escolher entre as duas dia a dia
// fazia a mesma remessa entrar duas vezes; e a entrada aparecia na segunda, que não é o dia
// em que a carne chegou.
//
// Agora a QUANTIDADE é sempre a conferida na portaria, e o DIA vem em cascata: a nota que
// casa pelo número, depois a conferência, e só então a data programada.
//
// Este teste roda a automação de verdade contra um Supabase falso servido pela REDE (o
// `const sb` não pode ser trocado de fora), com os dados reais do Norte Shopping de 05/10.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Semana 05/10 (segunda) a 11/10 (domingo). Toda entrega é programada pra SEGUNDA; a nota
// da mesma remessa foi lançada com dataNF de TERÇA, que é quando a carne chegou de fato.
const CENARIO = {
  semana: '2026-10-05',
  catalogo: [{ id: 'cat-sol', item_id: 207 }, { id: 'cat-seca', item_id: 209 },
             { id: 'cat-pic', item_id: 392 }, { id: 'cat-cam', item_id: 237 }],
  entregas: [
    // validado_em de QUINTA de propósito: a nota (terça) tem que ganhar dele.
    { catalogo_id: 'cat-sol',  data_entrega: '2026-10-05', gn_recebimentos: [{ qtd_recebida: 210.35, nota_numero: '3654012', validado_em: '2026-10-08T14:02:00+00:00' }] },
    { catalogo_id: 'cat-seca', data_entrega: '2026-10-05', gn_recebimentos: [{ qtd_recebida: 22.7,   nota_numero: '3654012', validado_em: '2026-10-06T09:10:00+00:00' }] },
    { catalogo_id: 'cat-pic',  data_entrega: '2026-10-05', gn_recebimentos: [{ qtd_recebida: 55.3,   nota_numero: '3654012', validado_em: '2026-10-06T09:10:00+00:00' }] },
    // Nota com dataNF de SEGUNDA: tem que FICAR na segunda, não sair de lá por teimosia.
    { catalogo_id: 'cat-cam',  data_entrega: '2026-10-05', gn_recebimentos: [{ qtd_recebida: 12,     nota_numero: '265914', validado_em: '2026-10-07T11:00:00+00:00' }] },
  ],
  notas: [
    // "265.958" na portaria e "265958" na loja são a mesma nota — o casamento é por dígitos.
    { insumo: 'CARNE DE SOL',                        qtd: '210.35', dataNF: '2026-10-06', nf: '3.654.012' },
    { insumo: 'CARNE SECA',                          qtd: '22.665', dataNF: '2026-10-06', nf: '3654012' },
    { insumo: 'PICANHA MATURATA / PICANHA DO CHEFF', qtd: '55.004', dataNF: '2026-10-06', nf: '3654012' },
    // A mesma linha lançada duas vezes, como a loja fez de verdade.
    { insumo: 'CAMARÃO SEM CABEÇA 61/70',            qtd: '12',     dataNF: '2026-10-05', nf: '265914' },
    { insumo: 'CAMARÃO SEM CABEÇA 61/70',            qtd: '12',     dataNF: '2026-10-05', nf: '265914' },
    // Petisco pronto: não é estoque cru, não pode entrar (exclusão já existente).
    { insumo: 'XIQUE DE CAMARÃO',                    qtd: '30',     dataNF: '2026-10-07', nf: '999' },
  ],
};

let CEN = null;                       // trocado entre os cenários; lido pelo route
const servirCenario = (ctx) => ctx.route('**/rest/v1/**', (rota) => {
  const tabela = new URL(rota.request().url()).pathname.split('/rest/v1/')[1].split('?')[0];
  let corpo = [];
  if (tabela === 'gn_catalogo')         corpo = CEN.catalogo.map(c => ({ id: c.id, item_id: c.item_id, origem_item_id: null }));
  else if (tabela === 'gn_provisoes')   corpo = CEN.entregas;
  else if (tabela === 'gn_lojas')       corpo = [{ all_data: { entradasAll: { ['NORTE SHOPPING|' + CEN.semana]: CEN.notas } } }];
  rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
});

const rodar = (page, semana, carnesGravadas, force) => page.evaluate(async ([semana, carnesGravadas, force]) => {
  state.semanaInicio = semana;
  stateWeek.semanaInicio = semana;
  stateWeek.carnes = JSON.parse(JSON.stringify(carnesGravadas));
  LOJA = 'Norte Shopping';
  _carnesAutoCarregando = false;
  _carnesAutoCarregado = false;
  // Não escrever no banco nem na tela durante o teste.
  autoSave = () => {};
  _debouncedSaveAll = () => {};
  _propagarFechamentoSemanaAnterior = () => {};
  renderCarnes = () => {};
  await _carregarCarnesAutoLojas(force);
  return { carnes: stateWeek.carnes, erro: _carnesAutoErro };
}, [semana, carnesGravadas, force]);

const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const vazio = (v) => v === undefined || v === '' || Number(v) === 0;
const entradasDe = (c) => dias.filter(d => !vazio(c['ent_' + d])).map(d => d + '=' + c['ent_' + d]).join(' ') || '(nenhuma)';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  CEN = CENARIO;
  await servirCenario(ctx);
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => { try { return typeof _carregarCarnesAutoLojas === 'function' && CARNES_DEF; } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o Check-list não carregou'); }
  }

  // ── 1. Semana limpa: uma entrada por remessa, no dia em que a carne chegou ─────────────
  const limpo = await rodar(page, CENARIO.semana, {}, false);
  check('a automação rodou sem erro', limpo.erro === false);
  const c1 = limpo.carnes;
  check('Carne de Sol: UMA entrada, na TERÇA (dia da nota), não na segunda programada',
    entradasDe(c1.carne_sol) === 'ter=210.35');
  check('e a nota manda na data mesmo quando a conferência foi só na quinta',
    vazio(c1.carne_sol.ent_qui));
  check('Carne Seca: UMA entrada na terça, com a quantidade CONFERIDA (22,7, não os 22,665 da nota)',
    entradasDe(c1.carne_seca) === 'ter=22.7');
  check('Picanha: UMA entrada na terça, com a conferida (55,3)',
    entradasDe(c1.picanha) === 'ter=55.3');
  check('Camarão: nota de segunda FICA na segunda — e a linha repetida conta uma vez',
    entradasDe(c1.camarao) === 'seg=12');
  check('Xique de Camarão continua fora (é petisco pronto, não estoque)',
    !dias.some(d => Number(c1.camarao['ent_' + d] || 0) === 30));
  check('o espelho da automação existe só no dia que entrou', (() => {
    const esperado = { carne_sol: 'ter', carne_seca: 'ter', picanha: 'ter', camarao: 'seg' };
    return Object.keys(esperado).every(k => {
      const espelhos = dias.filter(d => c1[k]['autoEnt_' + d] !== undefined);
      return espelhos.length === 1 && espelhos[0] === esperado[k];
    });
  })());

  // ── 2. A duplicação JÁ GRAVADA tem que sumir sozinha, sobrando o dia certo ─────────────
  // Estado real do banco: a automação pôs a entrega na segunda E a nota na terça.
  const sujo = {
    carne_sol:  { ent_seg: 210.35, autoEnt_seg: 210.35, ent_ter: 210.35, autoEnt_ter: 210.35 },
    carne_seca: { ent_seg: 22.7,   autoEnt_seg: 22.7,   ent_ter: 22.665, autoEnt_ter: 22.665 },
    picanha:    { ent_seg: 55.3,   autoEnt_seg: 55.3,   ent_ter: 55.004, autoEnt_ter: 55.004 },
    camarao:    { ent_seg: 12,     autoEnt_seg: 12,     ent_ter: 12,     autoEnt_ter: 12 },
  };
  const curado = (await rodar(page, CENARIO.semana, sujo, false)).carnes;
  check('só de abrir a aba, a duplicação vira UMA entrada no dia da nota',
    entradasDe(curado.carne_sol) === 'ter=210.35' &&
    entradasDe(curado.carne_seca) === 'ter=22.7' &&
    entradasDe(curado.picanha) === 'ter=55.3');
  check('e o camarão sobra na segunda, que é a data da nota dele',
    entradasDe(curado.camarao) === 'seg=12');
  check('o dia que perdeu a fonte não deixa espelho pra trás',
    curado.carne_sol.autoEnt_seg === undefined && curado.camarao.autoEnt_ter === undefined);

  // ── 3. O que foi digitado à mão não se perde numa abertura comum ───────────────────────
  // Contrato antigo da automação, que não pode mudar: só o 🔄 sobrescreve mão humana.
  const mao = {
    carne_sol: { ent_seg: 210.35, autoEnt_seg: 210.35, ent_ter: '145.6' },  // sem espelho = digitado
    camarao:   { ent_qui: '8' },
  };
  const semForce = (await rodar(page, CENARIO.semana, mao, false)).carnes;
  check('abrir a aba não sobrescreve nem apaga número digitado à mão',
    String(semForce.carne_sol.ent_ter) === '145.6' && String(semForce.camarao.ent_qui) === '8');
  check('mas o dia que ficou sem fonte é limpo (era a entrada velha da automação)',
    vazio(semForce.carne_sol.ent_seg));

  const comForce = (await rodar(page, CENARIO.semana, mao, true)).carnes;
  check('o 🔄 Atualizar do Lojas repõe o valor da fonte onde ela existe',
    entradasDe(comForce.carne_sol) === 'ter=210.35');
  check('e limpa o digitado que não tem fonte nenhuma',
    entradasDe(comForce.camarao) === 'seg=12');

  // ── 4. O caso de São Gonçalo: segunda zerada à mão, valor jogado na terça ─────────────
  const saoGoncalo = { carne_sol: { ent_seg: '0', autoEnt_seg: 140, ent_ter: '145.600' } };
  const sgForce = (await rodar(page, CENARIO.semana, saoGoncalo, true)).carnes;
  check('São Gonçalo: o 🔄 deixa só a entrada da fonte, no dia da nota',
    entradasDe(sgForce.carne_sol) === 'ter=210.35');

  // ── 5. Sem nota lançada, a data vem da conferência da portaria ────────────────────────
  CEN = {
    semana: CENARIO.semana, catalogo: CENARIO.catalogo, notas: [],
    entregas: [{ catalogo_id: 'cat-sol', data_entrega: '2026-10-05',
                 gn_recebimentos: [{ qtd_recebida: 80, nota_numero: '777', validado_em: '2026-10-07T08:30:00+00:00' }] }],
  };
  const porConferencia = (await rodar(page, CENARIO.semana, {}, false)).carnes;
  check('nota não lançada: a entrada cai no dia em que a portaria conferiu (quarta)',
    entradasDe(porConferencia.carne_sol) === 'qua=80');

  // ── 6. Sem nota e sem conferência, sobra a data programada ────────────────────────────
  CEN = {
    semana: CENARIO.semana, catalogo: CENARIO.catalogo, notas: [],
    entregas: [{ catalogo_id: 'cat-sol', data_entrega: '2026-10-05',
                 gn_recebimentos: [{ qtd_recebida: 80, nota_numero: null, validado_em: null }] }],
  };
  const porProgramada = (await rodar(page, CENARIO.semana, {}, false)).carnes;
  check('sem nota e sem conferência, fica na data programada (último recurso)',
    entradasDe(porProgramada.carne_sol) === 'seg=80');

  // ── 7. Data de FORA da semana não pode ser usada ──────────────────────────────────────
  // _diaSemanaKeyFromISO devolve um dia pra qualquer data: 28/09 é uma segunda, mas da
  // semana PASSADA. Sem a checagem de faixa, a entrada cairia na segunda desta semana como
  // se nada fosse, e uma nota de 12/10 (domingo seguinte) cairia no domingo desta.
  CEN = {
    semana: CENARIO.semana, catalogo: CENARIO.catalogo,
    notas: [{ insumo: 'CARNE DE SOL', qtd: '80', dataNF: '2026-10-13', nf: '888' }],
    entregas: [{ catalogo_id: 'cat-sol', data_entrega: '2026-10-07',
                 gn_recebimentos: [{ qtd_recebida: 80, nota_numero: '888', validado_em: '2026-09-28T08:00:00+00:00' }] }],
  };
  const foraDaSemana = (await rodar(page, CENARIO.semana, {}, false)).carnes;
  check('nota e conferência de outra semana são ignoradas — vale a data programada',
    entradasDe(foraDaSemana.carne_sol) === 'qua=80');

  // ── 8. Duas remessas de verdade continuam somando, cada uma no seu dia ────────────────
  CEN = {
    semana: CENARIO.semana, catalogo: CENARIO.catalogo, notas: [],
    entregas: [
      { catalogo_id: 'cat-sol', data_entrega: '2026-10-05', gn_recebimentos: [{ qtd_recebida: 100, nota_numero: '111', validado_em: '2026-10-06T10:00:00+00:00' }] },
      { catalogo_id: 'cat-sol', data_entrega: '2026-10-05', gn_recebimentos: [{ qtd_recebida: 40,  nota_numero: '222', validado_em: '2026-10-06T16:00:00+00:00' }] },
      { catalogo_id: 'cat-sol', data_entrega: '2026-10-08', gn_recebimentos: [{ qtd_recebida: 25,  nota_numero: '333', validado_em: '2026-10-09T09:00:00+00:00' }] },
    ],
  };
  const duas = (await rodar(page, CENARIO.semana, {}, false)).carnes;
  check('duas remessas conferidas no mesmo dia somam (140), e a de outro dia fica no seu (25)',
    entradasDe(duas.carne_sol) === 'ter=140 sex=25');

  // ── 9. Sem entrega conferida, a nota continua sendo o plano B ─────────────────────────
  CEN = Object.assign({}, CENARIO, { entregas: [] });
  const soNota = (await rodar(page, CENARIO.semana, {}, false)).carnes;
  check('sem entrega conferida, a nota entra — no dia da nota',
    entradasDe(soNota.carne_sol) === 'ter=210.35');
  check('e a linha de nota lançada duas vezes conta uma só',
    entradasDe(soNota.camarao) === 'seg=12');

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  console.log('\n--- Norte Shopping, semana limpa ---');
  Object.keys(c1).forEach(k => console.log('  ' + k.padEnd(11) + entradasDe(c1[k])));
  process.exit(falhou ? 1 : 0);
})();
