// "Mudar o critério: notas 1 e 2 não pontuam, nota 3 20%, nota 4 30%, nota 5 50%.
//  Somando todas as perguntas: 80 a 99,99 ouro, 79 a 70 na média, 69 pra baixo atenção,
//  abaixo de 39 ruim."
//
// Duas coisas mudam juntas: quanto vale cada resposta e onde cada faixa começa. As duas
// entram em 10/10/2026 e NÃO valem pra trás — a avaliação já finalizada, assinada e
// conversada com a pessoa não pode trocar de rótulo sozinha. Metade deste teste é só sobre
// isso, rodando as 262 avaliações reais do banco e exigindo que nenhuma mude.
const CAMINHOS = require('../_env');
const fs = require('fs');
const path = require('path');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const ARQ = process.env.ARQ_PESOS || CAMINHOS.pub('gn-avaliacoes-pesos.js');
const DADOS = CAMINHOS.fix('form_dados.json');

// Carrega o arquivo real com um window de mentira — é como os apps o consomem.
const W = {};
new Function('window', fs.readFileSync(ARQ, 'utf8'))(W);

const DEPOIS = '2026-10-15';   // depois do corte
const ANTES  = '2026-09-30';   // antes do corte

// Uma avaliação de Gerente com a mesma nota em tudo.
const av = (data, nota) => ({
  data, cargo: 'Gerente', pontualidade: nota, uniforme: nota,
  criteriosSetor: [nota,nota,nota,nota,nota,nota,nota,nota,nota,nota],
});
const pct = a => W.gnAvalPct(a);
const r1 = v => Math.round(v * 10) / 10;

// ── 1. A escala ─────────────────────────────────────────────────────────────────
const E = W.gnAvalEscala(av(DEPOIS, 5));
check('nota 1 não pontua', W.gnAvalValorResposta(1, E) === 0);
check('nota 2 não pontua', W.gnAvalValorResposta(2, E) === 0);
check('nota 3 vale 20', W.gnAvalValorResposta(3, E) === 20);
check('nota 4 vale 30', W.gnAvalValorResposta(4, E) === 30);
check('nota 5 vale 50', W.gnAvalValorResposta(5, E) === 50);
check('critério não respondido continua 0 — não é o mesmo que tirar 1',
  W.gnAvalValorResposta(0, E) === 0);

// ── 2. Somando todas as perguntas ──────────────────────────────────────────────
check('tudo 5 dá 100%', r1(pct(av(DEPOIS, 5))) === 100);
check('tudo 4 dá 60%',  r1(pct(av(DEPOIS, 4))) === 60);
check('tudo 3 dá 40%',  r1(pct(av(DEPOIS, 3))) === 40);
check('tudo 2 dá 0%',   r1(pct(av(DEPOIS, 2))) === 0);
check('tudo 1 dá 0%',   r1(pct(av(DEPOIS, 1))) === 0);
// O denominador tem que acompanhar a escala, senão a nota estoura
check('a nota nunca passa de 100%', pct(av(DEPOIS, 5)) <= 100);

// ── 3. As faixas ───────────────────────────────────────────────────────────────
const fx = (p, data) => W.gnAvalFaixaPorPct(p, { data: data || DEPOIS });
check('100% é Ouro (o combinado dizia "até 99,99" — nota cheia não pode cair da faixa)',
  fx(100) === 'ouro');
check('80% é Ouro', fx(80) === 'ouro');
check('79,9% já não é Ouro', fx(79.9) === 'padrao');
check('70% é Dentro do Padrão', fx(70) === 'padrao');
check('69,9% é Alerta Amarelo', fx(69.9) === 'amarelo');
check('40% é Alerta Amarelo', fx(40) === 'amarelo');
check('39,9% é Alerta Vermelho — sem buraco no 39', fx(39.9) === 'vermelho');
check('0% é Alerta Vermelho', fx(0) === 'vermelho');
// A ponta que o combinado deixou em aberto, agora fechada dos dois lados
check('nenhuma nota de 0 a 100 fica sem faixa', (() => {
  for (let p = 0; p <= 1000; p++) {
    const f = fx(p / 10);
    if (['ouro','padrao','amarelo','vermelho'].indexOf(f) < 0) return false;
  }
  return true;
})());

// ── 4. Quem tira 4 em tudo cai pra Alerta Amarelo ──────────────────────────────
// Não é efeito colateral: é a consequência direta da regra, e precisa estar visível.
check('tudo 4 vira Alerta Amarelo (era Dentro do Padrão na régua antiga)',
  W.gnAvalFaixa(av(DEPOIS, 4)) === 'amarelo' && W.gnAvalFaixa(av(ANTES, 4)) === 'padrao');
// Onde fica a virada: 50 e 30 significam que o Ouro exige mais da METADE do peso em 5.
// Em Gerente, seis 5 dão 79,6% (fica no Padrão) e sete 5 dão 83,1% (chega no Ouro).
check('seis notas 5 em Gerente ainda não chegam no Ouro', (() => {
  const a = { data: DEPOIS, cargo: 'Gerente', pontualidade: 5, uniforme: 5,
              criteriosSetor: [5,5,5,5,4,4,4,4,4,4] };
  return W.gnAvalFaixa(a) === 'padrao' && r1(pct(a)) === 79.6;
})());
check('a sétima nota 5 chega', (() => {
  const a = { data: DEPOIS, cargo: 'Gerente', pontualidade: 5, uniforme: 5,
              criteriosSetor: [5,5,5,5,5,4,4,4,4,4] };
  return W.gnAvalFaixa(a) === 'ouro' && r1(pct(a)) === 83.1;
})());

// ── 5. O HISTÓRICO NÃO PODE MUDAR ──────────────────────────────────────────────
check('avaliação anterior ao corte usa a escala antiga', W.gnAvalEscala(av(ANTES, 5))[4] === 5);
check('e os cortes antigos', W.gnAvalCortes(av(ANTES, 5)).ouro === 85);
check('tudo 4 antes do corte continua dando 80%', r1(pct(av(ANTES, 4))) === 80);

const D = JSON.parse(fs.readFileSync(DADOS, 'utf8'));
// Reconstitui cada avaliação real com a data dela (todas são anteriores a 10/10).
const reais = D.avaliacoes.map((a, i) => ({
  data: '2026-09-25', cargo: a.c, pontualidade: a.r[0], uniforme: a.r[1],
  criteriosSetor: a.r.slice(2),
}));
// A conta antiga, escrita à mão aqui pra não medir o arquivo com ele mesmo.
const antigaPct = (a) => {
  const w = D.pesosAtuais[a.cargo];
  const r = [a.pontualidade, a.uniforme].concat(a.criteriosSetor);
  let s = 0, m = 0;
  for (let i = 0; i < 12; i++) { s += w[i] * (r[i] || 0); m += w[i] * 5; }
  return m > 0 ? s / m * 100 : 0;
};
const antigaFaixa = p => p >= 85 ? 'ouro' : p >= 60 ? 'padrao' : p >= 40 ? 'amarelo' : 'vermelho';
let difNota = 0, difFaixa = 0;
reais.forEach(a => {
  if (Math.abs(W.gnAvalPct(a) - antigaPct(a)) > 0.0001) difNota++;
  if (W.gnAvalFaixa(a) !== antigaFaixa(antigaPct(a))) difFaixa++;
});
check('as 262 avaliações reais mantêm a MESMA nota', difNota === 0);
check('e a MESMA faixa — ninguém é reclassificado pra trás', difFaixa === 0);

// ── 6. O que a regra nova faz com essas mesmas respostas ───────────────────────
// Não é asserção de valor "certo": é a trava que avisa se o efeito mudar sem querer.
const novas = reais.map(a => Object.assign({}, a, { data: DEPOIS }));
const cont = {};
novas.forEach(a => { const f = W.gnAvalFaixa(a); cont[f] = (cont[f] || 0) + 1; });
check('nas mesmas respostas, a régua nova dá 43 Ouro / 50 Padrão / 157 Amarelo / 12 Vermelho',
  cont.ouro === 43 && cont.padrao === 50 && cont.amarelo === 157 && cont.vermelho === 12);
const med = l => l.reduce((s, v) => s + v, 0) / l.length;
const dp = l => { const m = med(l); return Math.sqrt(med(l.map(v => (v - m) * (v - m)))); };
const pn = novas.map(a => W.gnAvalPct(a)), pa = reais.map(a => W.gnAvalPct(a));
check('e espalha mais: desvio sai de 9,9 pra 14,8',
  r1(dp(pa)) === 9.9 && r1(dp(pn)) === 14.8);

// ── 7. O que não pode ter quebrado ─────────────────────────────────────────────
check('as duas réguas não são comparáveis entre si',
  W.gnAvalComparavel(av(ANTES, 5), av(DEPOIS, 5)) === false);
check('duas da régua nova são comparáveis',
  W.gnAvalComparavel(av(DEPOIS, 5), av(DEPOIS, 4)) === true);
check('o teto por falta continua valendo na régua nova', (() => {
  const a = Object.assign(av(DEPOIS, 5), { faltasPeriodo: 2 });
  return W.gnAvalFaixa(a) === 'amarelo';   // 100% mas 2 faltas → teto amarelo
})());
check('1 falta ainda tira só o Ouro', (() => {
  const a = Object.assign(av(DEPOIS, 5), { faltasPeriodo: 1 });
  return W.gnAvalFaixa(a) === 'padrao';
})());
check('peso e pergunta continuam alinhados', W.gn_aval_pesos_conferir().length === 0);
check('chamada antiga de uma argumento só mantém os cortes antigos (compatibilidade)',
  W.gnAvalFaixaPorPct(82) === 'padrao');

console.log(`\n${ok} OK, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
