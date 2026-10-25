// A folga de domingo, que é o que faz o domingo furar sempre.
//
// Regra da casa (e da lei): mulher folga um domingo a cada 15 dias — trabalha um sim,
// outro não —, homem folga um domingo por mês. Duas lojas do mesmo tamanho têm domingos
// diferentes conforme quantas mulheres cada uma tem. Ninguém fazia essa conta na hora de
// montar a escala, e é por isso que o domingo "some" gente.
//
// O sexo NÃO existia em cadastro nenhum e não dá pra deduzir pelo nome sem errar em nome
// ambíguo — num cálculo que vira escala de gente de verdade. Por isso virou campo.
const CAMINHOS = require('../_env');
global.window = {};
require(CAMINHOS.pub('gn-lojas-config.js'));
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };
const eqc = (a, b) => Math.abs(a - b) < 0.06;
const equipe = (nf, nm, nx) => []
  .concat([...Array(nf||0)].map((_, i) => ({ nome: 'F' + i, setor: 'Salão', sexo: 'F' })))
  .concat([...Array(nm||0)].map((_, i) => ({ nome: 'M' + i, setor: 'Salão', sexo: 'M' })))
  .concat([...Array(nx||0)].map((_, i) => ({ nome: 'X' + i, setor: 'Salão' })));

// ── A conta ────────────────────────────────────────────────────────────────
const a = window.gnSim5x2Domingo(equipe(12, 10), {});
check('conta mulheres e homens separados', a.mulheres === 12 && a.homens === 10, JSON.stringify(a));
check('mulher pesa o dobro do homem no domingo — um sim e outro não, contra um por mês',
  eqc(a.porDireitoMulheres / a.mulheres, 2 * (a.porDireitoHomens / a.homens)),
  `F ${a.porDireitoMulheres}/12 vs M ${a.porDireitoHomens}/10`);
check('12 mulheres e 10 homens tiram ~7,8 pessoas de um domingo médio', eqc(a.porDireito, 7.8), a.porDireito);

// A pergunta que o dono fez: a mesma loja com mais mulheres fura mais.
const poucas = window.gnSim5x2Domingo(equipe(4, 18), {});
const muitas = window.gnSim5x2Domingo(equipe(18, 4), {});
check('com 22 pessoas, a loja com mais mulheres perde bem mais gente no domingo',
  muitas.porDireito > poucas.porDireito * 1.5,
  `18F/4M = ${muitas.porDireito} · 4F/18M = ${poucas.porDireito}`);
console.log(`      → 22 pessoas: com 18 mulheres saem ~${muitas.porDireito}; com 4, ~${poucas.porDireito}`);

// ── O que vira extra ───────────────────────────────────────────────────────
const semNinguemFolgando = window.gnSim5x2Domingo(equipe(12, 10), {});
check('sem ninguém folgando no domingo, o buraco inteiro vira extra',
  semNinguemFolgando.aMais === Math.ceil(semNinguemFolgando.porDireito), semNinguemFolgando.aMais);
const folgas = {}; [0,1,2,3,4,5].forEach(i => { folgas[i] = [6, 1]; });
const comAlguns = window.gnSim5x2Domingo(equipe(12, 10), folgas);
check('quem a simulação já folgou no domingo abate do extra',
  comAlguns.jaFolgam === 6 && comAlguns.aMais === Math.max(0, Math.ceil(comAlguns.porDireito - 6)),
  JSON.stringify(comAlguns));
const todosFolgando = {}; equipe(12, 10).forEach((f, i) => { todosFolgando[i] = [6, 1]; });
const coberto = window.gnSim5x2Domingo(equipe(12, 10), todosFolgando);
check('simulação que já cobre a obrigação não pede extra', coberto.aMais === 0, JSON.stringify(coberto));
check('e o texto diz que está coberto, em vez de pedir zero extras',
  /cobre a obriga/.test(window.gnSim5x2DomingoTexto(coberto)), window.gnSim5x2DomingoTexto(coberto));

// ── Quem não foi preenchido não vira homem por omissão ─────────────────────
const metade = window.gnSim5x2Domingo(equipe(5, 5, 12), {});
check('quem está sem sexo informado é contado à parte', metade.semInfo === 12, JSON.stringify(metade));
check('e não entra na conta como se fosse homem',
  eqc(metade.porDireito, window.gnSim5x2Domingo(equipe(5, 5), {}).porDireito), metade.porDireito);
check('o texto avisa que o número tende a subir',
  /tende a subir/.test(window.gnSim5x2DomingoTexto(metade)), window.gnSim5x2DomingoTexto(metade));
check('e marca que a conta não está completa', metade.completo === false, metade.completo);
check('loja toda preenchida fecha a conta', window.gnSim5x2Domingo(equipe(5,5), {}).completo === true);

// Ninguém preenchido: a resposta é "não sei", não um zero que parece bom.
const nada = window.gnSim5x2Domingo(equipe(0, 0, 20), {});
check('sem ninguém informado, o texto pede o cadastro em vez de dizer que não falta ninguém',
  /sem isso não dá pra calcular/.test(window.gnSim5x2DomingoTexto(nada)) && !/faltariam ~0/.test(window.gnSim5x2DomingoTexto(nada)),
  window.gnSim5x2DomingoTexto(nada));

// ── Plural e bordas ────────────────────────────────────────────────────────
const um = window.gnSim5x2DomingoTexto(window.gnSim5x2Domingo(equipe(1, 1), {}));
check('singular sai certo: "1 mulher e 1 homem"', /1 mulher e 1 homem/.test(um), um);
const soHomens = window.gnSim5x2DomingoTexto(window.gnSim5x2Domingo(equipe(0, 8), {}));
check('plural sai certo: "0 mulheres e 8 homens"', /0 mulheres e 8 homens/.test(soHomens), soHomens);
check('loja vazia não quebra', window.gnSim5x2DomingoTexto(window.gnSim5x2Domingo([], {})) === '');

// ── O domingo da tabela mente se ignorar o direito ─────────────────────────
// Sem este alerta a tela mostrava o domingo confortável ao lado de um aviso dizendo que
// faltariam 5 pessoas. Duas afirmações opostas na mesma tela, e a verde é a que o olho
// acredita.
const perfilDom = Array.from({length:7}, (_, i) => ({
  dia:i, venda: i===6 ? 28000 : 7000, pessoas: i===6 ? 17 : 20,
  porPessoa: i===6 ? 28000/17 : 350, confiavel:true, amostras:9 }));
const diasDom = [{ dia:6, nome:'Domingo', pessoas:19, vendaEsperada:28000, porPessoa:28000/19, razao:(28000/19)/(28000/17) }];
const domCheio = window.gnSim5x2Domingo(equipe(11, 11), {});
const al = window.gnSim5x2AlertaDomingo(diasDom, domCheio, perfilDom);
check('com folga de domingo pendente, sai o alerta do domingo real', !!al, JSON.stringify(domCheio));
check('e ele mostra o número depois das folgas, não o da tabela',
  /a tabela mostra 19/.test(al.msg) && /sobram ~\d+/.test(al.msg), al.msg);
check('e diz quantos extras devolvem o domingo ao patamar',
  new RegExp('~' + domCheio.aMais + ' extra').test(al.msg), al.msg);
console.log('      → ' + al.msg);
check('o domingo real acusa aperto que a tabela escondia',
  al.nivel === 'atencao' || al.nivel === 'grave', al.nivel);

// Simulação que já cobriu a obrigação não gera alerta nenhum.
const todosNoDom = {}; equipe(11,11).forEach((f,i)=>{ todosNoDom[i]=[6,1]; });
check('sem folga pendente, não há alerta de domingo',
  window.gnSim5x2AlertaDomingo(diasDom, window.gnSim5x2Domingo(equipe(11,11), todosNoDom), perfilDom) === null);
// Sem histórico de domingo, o alerta se cala em vez de calcular sobre nada.
const semDom = perfilDom.map((p,i)=> i===6 ? {...p, confiavel:false} : p);
check('sem histórico de domingo, o alerta se cala',
  window.gnSim5x2AlertaDomingo(diasDom, domCheio, semDom) === null);
// Caso extremo: o direito leva todo mundo.
const todosFora = window.gnSim5x2AlertaDomingo([{...diasDom[0], pessoas:3}], domCheio, perfilDom);
check('se o direito levar todo mundo, o alerta é grave e diz isso',
  todosFora.nivel === 'grave' && /sem ninguém/.test(todosFora.msg), todosFora && todosFora.msg);

console.log(`\n${ok} OK, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
