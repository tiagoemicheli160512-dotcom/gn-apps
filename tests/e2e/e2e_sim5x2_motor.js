// Simulação 5x2: o motor. A tela só desenha o que sai daqui, então é aqui que o erro
// custa caro — um alerta errado manda a rede dimensionar equipe pelo número errado.
//
// A régua NÃO é um teto inventado: é o que cada loja já sustenta em cada dia da semana.
// Em Bangu, pelos últimos 90 dias, a terça roda a R$ 334 por pessoa e o domingo a
// R$ 1.641 — 4,9 vezes mais. Um teto único acusaria o domingo todo dia e nunca a terça.
const CAMINHOS = require('../_env');
global.window = {};
require(CAMINHOS.pub('gn-lojas-config.js'));
const BANGU = require(CAMINHOS.fix('dados_bangu.json'));   // dados REAIS, puxados do banco
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

// ── Perfil: o que a loja vende e com quanta gente ──────────────────────────
const perfil = window.gnSim5x2Perfil(BANGU.vendas, BANGU.semanas);
check('o perfil tem os sete dias', perfil.length === 7, perfil.length);
check('segunda é o índice 0 e domingo o 6, como no `dias` da escala',
  perfil[0].nome === 'Segunda' && perfil[6].nome === 'Domingo');
check('o domingo de Bangu aparece como o dia mais forte',
  perfil[6].venda > perfil[1].venda * 3, `dom ${perfil[6].venda} vs ter ${perfil[1].venda}`);
check('e com a carga por pessoa muito acima da terça — a razão de não usar teto único',
  perfil[6].porPessoa > perfil[1].porPessoa * 3,
  `dom ${Math.round(perfil[6].porPessoa)} vs ter ${Math.round(perfil[1].porPessoa)}`);
check('todos os dias de Bangu têm histórico suficiente', perfil.every(p => p.confiavel));

// Dia sem venda lançada não entra como "vendeu zero" — isso derrubaria a mediana.
const comZeros = window.gnSim5x2Perfil(
  BANGU.vendas.concat([{data_operacao:'2026-10-18', venda_salao:0, venda_delivery:0}]), BANGU.semanas);
check('dia com venda zerada é ignorado, não contado como venda baixa',
  comZeros[6].venda === perfil[6].venda, `${comZeros[6].venda} vs ${perfil[6].venda}`);

// Loja nova, sem histórico: a resposta certa é "não sei", não um número.
const magro = window.gnSim5x2Perfil(
  [{data_operacao:'2026-10-12', venda_salao:1000, venda_delivery:0}], [[5,5,5,5,5,5,5]]);
check('com uma amostra só, o dia é marcado como não confiável', !magro[0].confiavel, JSON.stringify(magro[0]));

// ── A sugestão ─────────────────────────────────────────────────────────────
const folgas = window.gnSim5x2Sugerir(BANGU.funcs, perfil);
check('todo mundo recebe exatamente 2 folgas',
  BANGU.funcs.every((f, i) => (folgas[i] || []).length === 2),
  JSON.stringify(Object.values(folgas).map(f => f.length)));
check('as duas folgas de uma pessoa caem em dias diferentes',
  Object.values(folgas).every(f => f[0] !== f[1]));
const porDia = Array(7).fill(0);
Object.values(folgas).forEach(f => f.forEach(d => porDia[d]++));
check('sobra muito mais folga na terça que no domingo — a sugestão protege o dia forte',
  porDia[1] > porDia[6] * 2, `ter ${porDia[1]} · dom ${porDia[6]}`);
check('e no sábado também', porDia[1] > porDia[5] * 2, `ter ${porDia[1]} · sáb ${porDia[5]}`);
const denovo = window.gnSim5x2Sugerir(BANGU.funcs, perfil);
check('a sugestão é determinística — mesma equipe, mesma proposta',
  JSON.stringify(folgas) === JSON.stringify(denovo));
check('equipe vazia não quebra', JSON.stringify(window.gnSim5x2Sugerir([], perfil)) === '{}');

// ── A avaliação ────────────────────────────────────────────────────────────
const av = window.gnSim5x2Avaliar(BANGU.funcs, folgas, perfil);
check('avalia os sete dias', av.dias.length === 7);
check('ninguém trabalha no dia em que folgou',
  av.dias.every(d => d.pessoas === BANGU.funcs.filter((f, i) => !(folgas[i] || []).includes(d.dia)).length));
check('a razão compara com o patamar do PRÓPRIO dia, não com uma média da semana',
  Math.abs(av.dias[1].razao - (av.dias[1].porPessoa / perfil[1].porPessoa)) < 1e-9);

// Sem nenhuma folga a escala é a de hoje: nada pode acusar aperto.
const semFolga = window.gnSim5x2Avaliar(BANGU.funcs, {}, perfil);
check('a escala de hoje, sem folga nenhuma, não acusa aperto',
  !semFolga.alertas.some(a => a.tipo === 'apertada'),
  JSON.stringify(semFolga.alertas.filter(a => a.tipo === 'apertada').map(a => a.msg)));

// Todo mundo folgando no mesmo dia: tem que gritar.
const todosNaTerca = {}; BANGU.funcs.forEach((f, i) => { todosNaTerca[i] = [1, 2]; });
const colapso = window.gnSim5x2Avaliar(BANGU.funcs, todosNaTerca, perfil);
check('loja sem ninguém num dia vira alerta grave',
  colapso.alertas.some(a => a.tipo === 'sem_ninguem' && a.nivel === 'grave'),
  JSON.stringify(colapso.alertas.slice(0, 2)));

// Setor que fica vazio é ruptura, mesmo num dia fraco onde a conta geral fecharia.
const soOEstoque = {};
BANGU.funcs.forEach((f, i) => { soOEstoque[i] = f.setor === 'Estoque' ? [1, 2] : [5, 6]; });
const rup = window.gnSim5x2Avaliar(BANGU.funcs, soOEstoque, perfil);
check('setor que fica sem ninguém é ruptura, não só "apertado"',
  rup.alertas.some(a => a.tipo === 'ruptura_setor' && a.setor === 'Estoque' && a.nivel === 'grave'),
  JSON.stringify(rup.alertas.filter(a => a.tipo === 'ruptura_setor').slice(0, 2)));

// Sem histórico o alerta se cala em vez de afirmar.
const semBase = window.gnSim5x2Perfil([{data_operacao:'2026-10-13', venda_salao:5000, venda_delivery:0}], [[10,10,10,10,10,10,10]]);
const mudo = window.gnSim5x2Avaliar(BANGU.funcs, folgas, semBase);
check('sem histórico, o dia diz que não sabe em vez de inventar aperto',
  mudo.alertas.some(a => a.tipo === 'sem_historico') && !mudo.alertas.some(a => a.tipo === 'apertada'),
  JSON.stringify(mudo.alertas.slice(0, 3).map(a => a.tipo)));

// ── O número que decide: o quadro ──────────────────────────────────────────
const rs = window.gnSim5x2Resumo(BANGU.funcs, folgas, perfil);
check('o resumo conta as pessoas da loja', rs.pessoas === BANGU.funcs.length, rs.pessoas);
const somaHoje = perfil.reduce((a, p) => a + (p.pessoas || 0), 0);
check('pessoa-dias é a soma do que a loja usa em cada dia', rs.pessoaDiasHoje === somaHoje,
  `${rs.pessoaDiasHoje} vs ${somaHoje}`);
check('o quadro necessário é pessoa-dias dividido por 5, arredondado pra cima',
  rs.quadroNecessario === Math.ceil(somaHoje / 5), `${rs.quadroNecessario} vs ${Math.ceil(somaHoje/5)}`);
check('em Bangu o 5x2 não fecha com o quadro atual — e o teste diz de quanto é o buraco',
  rs.faltam > 0, `faltam ${rs.faltam} (tem ${rs.pessoas}, precisa ${rs.quadroNecessario})`);
console.log(`      → Bangu: ${rs.pessoas} pessoas hoje, ${rs.quadroNecessario} necessárias, faltam ${rs.faltam}`);

// Loja com gente de sobra não pode dizer que falta.
const folgado = window.gnSim5x2Resumo(
  Array.from({length:60},(_,i)=>({nome:'P'+i,setor:'Salão'})), {}, perfil);
check('loja com quadro de sobra não acusa falta', folgado.faltam === 0 && folgado.sobram > 0,
  JSON.stringify(folgado));

console.log(`\n${ok} OK, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
