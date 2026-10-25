// Meio turno no Gorjetas: "o cálculo vai ser 70% do valor turno do dia (...) e o resto vai
// direto pro rateio pra quem tem direito, e 30% para turno noite e o restante vai para o
// rateio pra quem tem direito."
//
// O cálculo de verdade mora no calcSemana de gn-lojas-config.js, compartilhado entre o
// Gorjetas, a Mestra e o Painel. Este teste carrega o arquivo REAL (não uma cópia da
// conta) e confere os números na mão, porque aqui um erro de 30% vira dinheiro a menos no
// bolso de alguém e nenhuma tela acusa nada.
const CAMINHOS = require('../_env');
const fs = require('fs');
const path = CAMINHOS.pub('gn-lojas-config.js');
const win = {};
// O arquivo é escrito pra rodar no navegador: declara `function calcSemana` no topo e
// pendura o resto em window. Aqui ele roda num escopo com um window de mentira, e o
// `return` no fim entrega o que o teste precisa.
const carregar = new Function('window', fs.readFileSync(path, 'utf8') +
  '\n;return {calcSemana, gnMeioTurnoFator: window.gnMeioTurnoFator, ADM};');
const { calcSemana, gnMeioTurnoFator, ADM } = carregar(win);
Object.assign(globalThis, win);   // calcSemana lê gnGorjetaFatorDia/gnFatorDoDia do global

let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + extra); };
const perto = (a, b) => Math.abs(a - b) < 0.005;

const func = (nome, dias, turnos, tipo) => ({ nome, tipo: tipo || 'CLT / MENSALISTA', dias, turnos: turnos || null });
const sete = (s) => Array(7).fill(s);
// semIdx 40 = depois do corte da meia cota do Jovem Aprendiz (GN_GORJETA_JA_METADE_DESDE_SEM = 36)
const semana = (funcs) => ({ brutos: [1000, 0, 0, 0, 0, 0, 0], funcs, dist: 'SIM', vDist: 0, semIdx: 40 });

const mt = (turno) => { const d = sete('PRESENTE'); d[0] = 'MEIO TURNO';
  const t = Array(7).fill(null); t[0] = turno; return { dias: d, turnos: t }; };

// ── 1. A fração do dia ────────────────────────────────────────────────────────────────
check('turno dia paga 70%',   gnMeioTurnoFator('DIA') === 0.7);
check('turno noite paga 30%', gnMeioTurnoFator('NOITE') === 0.3);
check('sem turno escolhido vale DIA (é o que a tela mostra marcado)', gnMeioTurnoFator(null) === 0.7);

// ── 2. Três pessoas, uma segunda de R$ 1.000 ─────────────────────────────────────────
// e90 = 900; os três trabalharam a segunda, então o divisor é 3 e a cota do dia é 300.
const A = func('Ana', sete('PRESENTE'));
const Bm = mt('DIA'),   B = func('Bruno', Bm.dias, Bm.turnos);
const Cm = mt('NOITE'), C = func('Carla', Cm.dias, Cm.turnos);
const r = calcSemana(semana([A, B, C]), 0);
const [a, b, c] = r.funcCalc;

check('a cota do dia é 300 (900 ÷ 3) — meio turno conta como pessoa inteira no divisor',
  perto(r.dias[0].cotaUnit, 300), 'cotaUnit=' + r.dias[0].cotaUnit + ' I=' + r.dias[0].I);
check('quem fez o dia inteiro leva os 300 da cota',      perto(a.AF, 300), 'AF=' + a.AF);
check('meio turno DIA leva 210 (70% de 300)',            perto(b.AF, 210), 'AF=' + b.AF);
check('meio turno NOITE leva 90 (30% de 300)',           perto(c.AF, 90),  'AF=' + c.AF);

// ── 3. O que não foi pago vai pro rateio, não some ───────────────────────────────────
check('os 300 que sobraram caem no pool de rateio', perto(r.poolRateio, 300), 'pool=' + r.poolRateio);
check('e o pool é distribuído por inteiro entre os elegíveis',
  perto(a.rateio + b.rateio + c.rateio, 300),
  [a.rateio, b.rateio, c.rateio].map(x => x.toFixed(2)).join(' + '));
check('nada se perde: cota base + rateio = os 900 do caixa',
  perto(a.cota + b.cota + c.cota, 900),
  'soma=' + (a.cota + b.cota + c.cota).toFixed(2));

// ── 4. O dia de meio turno pesa proporcional no rateio (decisão do usuário) ───────────
// Ana: 7 dias. Bruno: 0,7 + 6 = 6,7. Carla: 0,3 + 6 = 6,3. Total 20.
check('no rateio, o dia de meio turno pesa 0,7 (dia) e 0,3 (noite), não 1',
  perto(a.diasEleg, 7) && perto(b.diasEleg, 6.7) && perto(c.diasEleg, 6.3),
  'diasEleg=' + [a.diasEleg, b.diasEleg, c.diasEleg].join(' / '));
check('rateio: 105 / 100,50 / 94,50',
  perto(a.rateio, 105) && perto(b.rateio, 100.5) && perto(c.rateio, 94.5),
  [a.rateio, b.rateio, c.rateio].map(x => x.toFixed(2)).join(' / '));
check('quem fez o turno inteiro recebe MAIS do que receberia sem o meio turno dos outros',
  a.cota > 300, 'cota de quem fez o dia inteiro = ' + a.cota.toFixed(2));

// ── 5. Quem fez meio turno continua elegível ─────────────────────────────────────────
check('meio turno não tira ninguém do rateio', b.elegivel === true && c.elegivel === true);
const so = mt('NOITE');
const soMT = calcSemana(semana([func('Só meio turno', so.dias.map((s, i) => i === 0 ? s : 'NÃO TRABALHADO'), so.turnos),
                                func('Outro', sete('PRESENTE'))]), 0);
check('quem só trabalhou um meio turno na semana ainda é elegível',
  soMT.funcCalc[0].elegivel === true);

// ── 6. Jovem Aprendiz em meio turno: as duas frações se multiplicam ──────────────────
const ja = mt('DIA');
const rJA = calcSemana(semana([func('Aprendiz', ja.dias, ja.turnos, 'JOVEM APRENDIZ'),
                               func('Dois', sete('PRESENTE')), func('Três', sete('PRESENTE'))]), 0);
check('Jovem Aprendiz em meio turno dia leva 0,5 × 0,7 = 35% da cota',
  perto(rJA.funcCalc[0].AF, 300 * 0.35), 'AF=' + rJA.funcCalc[0].AF);

// ── 7. Semana sem nenhum meio turno continua exatamente como era ─────────────────────
const antes = calcSemana(semana([func('X', sete('PRESENTE')), func('Y', sete('PRESENTE')), func('Z', sete('PRESENTE'))]), 0);
check('sem meio turno nenhum, cada um leva os 300 e o pool é zero',
  perto(antes.funcCalc[0].AF, 300) && perto(antes.poolRateio, 0),
  'AF=' + antes.funcCalc[0].AF + ' pool=' + antes.poolRateio);
check('e o líquido desconta o ADM rateado como sempre',
  perto(antes.funcCalc[0].liquido, 300 - ADM / 3),
  'liquido=' + antes.funcCalc[0].liquido);

// ── 8. Func sem o campo turnos (dado antigo) não quebra ──────────────────────────────
const velho = { nome: 'Antigo', tipo: 'CLT / MENSALISTA', dias: (() => { const d = sete('PRESENTE'); d[0] = 'MEIO TURNO'; return d; })() };
const rVelho = calcSemana(semana([velho, func('Par', sete('PRESENTE'))]), 0);
check('func gravado antes do campo turnos existir cai no padrão DIA, sem erro',
  perto(rVelho.funcCalc[0].AF, 450 * 0.7), 'AF=' + rVelho.funcCalc[0].AF);

// ── 9. Escopo: a regra do CLAUDE.md ──────────────────────────────────────────────────
// "qualquer mudança pedida só deve afetar a Maglia quando o pedido citar Maglia
// explicitamente pelo nome" — o pedido do meio turno não citou.
const STATUS_TELA = ["PRESENTE","MEIO TURNO","FALTA","ATESTADO","JUSTIFICATIVA","SUSPENSÃO",
                     "NÃO TRABALHADO","HORISTA","JOVEM APRENDIZ","FOLGA","BANCO DE HORAS","FÉRIAS","AFASTAMENTO"];
check('a Maglia não vê a opção de meio turno',
  !win.gnStatusDaLoja(STATUS_TELA, 'MAGLIA').includes('MEIO TURNO'));
check('as 11 lojas originais veem',
  ['BANGU','CAXIAS','SAO_GONCALO','NORTE_SHOPPING','BOULEVARD','NOVA_IGUACU','PEDREIRA',
   'NOVA_AMERICA','CAMPO_GRANDE','ITAQUERA','GUARULHOS']
    .every(l => win.gnStatusDaLoja(STATUS_TELA, l).includes('MEIO TURNO')));
check('a chave da loja é comparada sem depender de caixa alta (Maglia/MAGLIA/maglia)',
  ['Maglia','MAGLIA','maglia',' maglia '].every(l => !win.gnStatusDaLoja(STATUS_TELA, l).includes('MEIO TURNO')));
check('sem loja definida, nada é escondido — esconder por engano é pior que mostrar',
  win.gnStatusDaLoja(STATUS_TELA, '').includes('MEIO TURNO') &&
  win.gnStatusDaLoja(STATUS_TELA, null).includes('MEIO TURNO'));
check('esconder a opção NÃO muda a conta: se um dia vier marcado assim, ele é pago igual',
  perto(calcSemana(semana([func('X', mt('NOITE').dias, mt('NOITE').turnos), func('Y', sete('PRESENTE'))]), 0).funcCalc[0].AF, 450 * 0.3));

console.log(`\n${ok} OK, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
