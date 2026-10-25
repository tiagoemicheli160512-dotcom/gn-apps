// Jornada, 42 horas e o banco que tem que zerar.
//
// A regra: 42 horas semanais trabalhadas por pessoa. O que passar vira hora extra, entra
// no banco e precisa ser compensado com folga até o fim do ciclo de 6 meses — todo mundo
// 0 a 0. Então a pergunta que decide a escala não é "quanta gente falta", é "cabe em 42h?".
//
// Se não couber, o banco não aperta um pouco: cresce toda semana. Guarulhos, pelos dados
// reais, precisa de 48,4h por pessoa — +6,4h por semana, 167h em seis meses, 20 dias de
// folga por pessoa só pra zerar. É melhor descobrir no rascunho.
const CAMINHOS = require('../_env');
global.window = {};
require(CAMINHOS.pub('gn-lojas-config.js'));
const REDE = require(CAMINHOS.fix('dados_rede.json'));
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };
const perto = (a, b, t) => Math.abs(a - b) < (t || 0.06);

const loja = nome => {
  const l = REDE.find(x => x.loja === nome);
  const perfil = window.gnSim5x2Perfil(l.vendas, l.semanas);
  const folgas = window.gnSim5x2Sugerir(l.funcs, perfil);
  return { l, perfil, folgas, hr: window.gnSim5x2Horas(l.funcs, folgas, perfil, l.horasDia) };
};

// ── A meta e a âncora ──────────────────────────────────────────────────────
check('a meta semanal é 42h', window.GN_SIM5X2_META_SEMANAL === 42);
check('o teto diário é 10h', window.GN_SIM5X2_TETO_DIA === 10);
check('o ciclo do banco é 6 meses', window.GN_SIM5X2_BANCO_MESES === 6);
const g = loja('Guarulhos');
check('a jornada que fecha a meta em 5 dias é 8,4h (8h24)', perto(g.hr.jornadaDaMeta, 8.4), g.hr.jornadaDaMeta);

// ── Horas de cada pessoa ───────────────────────────────────────────────────
const umaPessoa = g.hr.porPessoa[0];
check('a semana de cada um é dias trabalhados × jornada',
  perto(umaPessoa.semana, umaPessoa.dias * g.l.horasDia), JSON.stringify(umaPessoa));
check('em 5x2 cada um trabalha 5 dias',
  g.hr.porPessoa.every(p => p.dias === 5), JSON.stringify(g.hr.porPessoa.map(p => p.dias)));
check('o excedente de cada um é medido contra as 42h',
  perto(umaPessoa.excedente, umaPessoa.semana - 42), umaPessoa.excedente);
// Quem folga mais trabalha menos: sem folga nenhuma, 7 dias.
const semFolga = window.gnSim5x2Horas(g.l.funcs, {}, g.perfil, 8);
check('quem não folga aparece com 7 dias e 56h — e isso estoura a meta',
  semFolga.porPessoa[0].dias === 7 && perto(semFolga.porPessoa[0].semana, 56)
  && semFolga.porPessoa[0].excedente > 0, JSON.stringify(semFolga.porPessoa[0]));

// ── O veredito do ciclo, com dados REAIS ───────────────────────────────────
check('Guarulhos não fecha em 42h', g.hr.fecha === false, JSON.stringify({
  porPessoa: g.hr.porPessoaNecessaria, exc: g.hr.excedenteSemanal }));
check('e o teste diz de quanto é o excedente semanal',
  g.hr.excedenteSemanal > 5 && g.hr.excedenteSemanal < 8, g.hr.excedenteSemanal);
check('o banco do ciclo é o excedente × 26 semanas',
  perto(g.hr.bancoCiclo, g.hr.excedenteSemanal * 26, 0.5), g.hr.bancoCiclo);
check('e os dias pra zerar saem do banco dividido por um dia de meta (8,4h)',
  perto(g.hr.diasPraZerar, g.hr.bancoCiclo / 8.4, 0.2), g.hr.diasPraZerar);
console.log(`      → Guarulhos: ${window.gnSim5x2HorasTexto(g.hr)}`);

const cg = loja('Campo Grande');
check('Campo Grande fecha dentro das 42h', cg.hr.fecha === true, cg.hr.porPessoaNecessaria);
check('e o texto diz que o banco zera, sem inventar dias de folga',
  /fecha 0 a 0/.test(window.gnSim5x2HorasTexto(cg.hr)) && cg.hr.diasPraZerar === 0,
  window.gnSim5x2HorasTexto(cg.hr));

// A rede inteira: a conta tem que ser consistente loja a loja.
const todas = REDE.filter(l => !l.erro && l.funcs.length && l.horasDia).map(l => {
  const perfil = window.gnSim5x2Perfil(l.vendas, l.semanas);
  const hr = window.gnSim5x2Horas(l.funcs, window.gnSim5x2Sugerir(l.funcs, perfil), perfil, l.horasDia);
  return { loja: l.loja, exc: hr.excedenteSemanal, fecha: hr.fecha };
}).filter(x => x.exc != null);
check('todas as lojas com histórico têm veredito',
  todas.length >= 10 && todas.every(x => typeof x.fecha === 'boolean'), todas.length);
check('fecha é exatamente excedente <= 0 — sem zona cinzenta',
  todas.every(x => x.fecha === (x.exc <= 0)), JSON.stringify(todas.filter(x => x.fecha !== (x.exc <= 0))));
console.log('      → não fecham: ' + todas.filter(x => !x.fecha).map(x => x.loja).join(', '));

// ── Mexer na jornada muda a conta ──────────────────────────────────────────
const curta = window.gnSim5x2Horas(g.l.funcs, g.folgas, g.perfil, 6);
const longa = window.gnSim5x2Horas(g.l.funcs, g.folgas, g.perfil, 9);
check('jornada menor reduz o que cada pessoa precisa entregar',
  curta.porPessoaNecessaria < longa.porPessoaNecessaria, `${curta.porPessoaNecessaria} vs ${longa.porPessoaNecessaria}`);
check('jornada acima do teto legal é sinalizada',
  window.gnSim5x2Horas(g.l.funcs, g.folgas, g.perfil, 11).acimaDoTeto === true);
check('e o texto avisa do teto',
  /passa do teto legal/.test(window.gnSim5x2HorasTexto(window.gnSim5x2Horas(g.l.funcs, g.folgas, g.perfil, 11))));
check('jornada dentro do teto não acusa nada',
  window.gnSim5x2Horas(g.l.funcs, g.folgas, g.perfil, 9.5).acimaDoTeto === false);

// ── Sem histórico, a conta não é inventada ─────────────────────────────────
const semBase = window.gnSim5x2Horas(g.l.funcs, g.folgas,
  window.gnSim5x2Perfil([{data_operacao:'2026-10-12', venda_salao:100, venda_delivery:0}], [[5,5,5,5,5,5,5]]), 8);
check('sem histórico, não há veredito sobre o ciclo', semBase.fecha === null, JSON.stringify(semBase.fecha));
check('e o texto diz que não dá pra saber, em vez de dizer que fecha',
  /Sem histórico suficiente/.test(window.gnSim5x2HorasTexto(semBase)), window.gnSim5x2HorasTexto(semBase));
check('loja vazia não quebra', window.gnSim5x2Horas([], {}, g.perfil, 8).porPessoaNecessaria === null);

console.log(`\n${ok} OK, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
