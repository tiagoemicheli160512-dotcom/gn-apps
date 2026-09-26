// Pesos das perguntas da avaliação de desempenho — fonte única.
//
// Até 22/09/2026 a avaliação não tinha peso nenhum: as 12 perguntas (2 gerais + 10 do
// setor) valiam 5 pontos cada, 60 no total, ou seja 8,3% da nota cada uma. Na prática
// "Pontualidade e Assiduidade" pesava o mesmo que "Sigilo com Informações Financeiras".
// Efeito medido sobre as 246 avaliações finalizadas até 23/09/2026: 36 pessoas tiraram 1
// ou 2 em pontualidade, 35 delas terminaram "Dentro do Padrão" ou melhor e 2 ficaram
// "Ouro" — porque tirar 1 em vez de 5 custava 4 pontos de 60, só 6,7 pontos percentuais.
//
// Agora cada pergunta tem um multiplicador definido pelo dono da rede, por setor. Peso 1
// = 5 pontos (como antes); peso 4 = 20 pontos. O total deixa de ser 60 e passa a variar
// por cargo (135 no Caixa, 225 no Gerente), mas a nota continua saindo em % — as faixas
// (Ouro 85, Padrão 60, Amarelo 40) não mudam.
//
// A ordem de cada array é: [Pontualidade, Uniforme, ...os 10 critérios do setor NA ORDEM
// em que aparecem em SETORES (gn-avaliacoes-setores.js)]. Trocar a ordem lá sem mexer
// aqui desalinha peso e pergunta em silêncio — por isso gn_aval_pesos_conferir() existe.
window.GN_AVAL_PESOS = {
  //                     pont unif │ 1  2  3  4  5  6  7  8  9 10
  'Caixa':             [ 3, 2,       4, 1, 2, 1, 2, 2, 3, 3, 1, 3 ], // 135 pts
  'Copa':              [ 4, 2,       2, 3, 3, 4, 2, 2, 2, 4, 2, 4 ], // 170 pts
  'Cozinha':           [ 4, 4,       4, 3, 3, 4, 4, 4, 2, 4, 4, 4 ], // 220 pts
  'Garçom/Garçonete':  [ 4, 3,       4, 4, 2, 4, 4, 2, 4, 3, 4, 4 ], // 210 pts
  'ASG':               [ 4, 3,       3, 4, 4, 2, 3, 3, 4, 3, 2, 4 ], // 195 pts
  'Estoquista':        [ 4, 3,       4, 4, 2, 4, 2, 2, 4, 4, 2, 4 ], // 195 pts
  'Recepcionista':     [ 4, 3,       4, 3, 4, 2, 4, 4, 3, 2, 4, 4 ], // 205 pts
  'Sub-Gerente':       [ 4, 4,       3, 3, 4, 4, 4, 4, 4, 4, 4, 3 ], // 225 pts
  'Gerente':           [ 4, 4,       4, 3, 3, 4, 4, 4, 4, 4, 4, 3 ]  // 225 pts
};

// Totais informados junto com os pesos — conferidos um a um contra a soma real.
// Servem de trava: se alguém editar um peso acima sem atualizar o total, o teste acusa.
window.GN_AVAL_PESOS_TOTAL = {
  'Caixa': 135, 'Copa': 170, 'Cozinha': 220, 'Garçom/Garçonete': 210, 'ASG': 195,
  'Estoquista': 195, 'Recepcionista': 205, 'Sub-Gerente': 225, 'Gerente': 225
};

// Avaliação com data ANTERIOR a esta continua valendo 60 pontos, sem peso.
//
// Não é cautela genérica: o app não guarda foto da nota, recalcula tudo na hora a partir
// das respostas cruas. Sem este corte, as 246 avaliações já finalizadas, assinadas e
// conversadas com cada funcionário mudariam de nota (e de faixa) sozinhas — gente que foi
// informada como "Ouro" apareceria como "Padrão" no dia seguinte, sem ninguém ter mexido
// em nada. Mesmo raciocínio do GN_GORJETA_JA_METADE_DESDE_SEM em gn-lojas-config.js.
// Pra aplicar os pesos no histórico inteiro, basta pôr uma data bem antiga aqui.
window.GN_AVAL_PESOS_DESDE = '2026-09-23';

// Uma avaliação usa pesos? Depende da data dela e de o cargo ter pesos cadastrados.
window.gnAvalPesado = function (av) {
  if (!av) return false;
  var cargo = av.cargo;
  if (!cargo || !window.GN_AVAL_PESOS[cargo]) return false;
  var data = av.data || '';
  return data >= window.GN_AVAL_PESOS_DESDE;
};

// Os 12 pesos que valem pra essa avaliação — tudo 1 quando ela é anterior ao corte, o que
// devolve exatamente a conta antiga (12 × 5 = 60).
window.gnAvalPesos = function (av) {
  if (window.gnAvalPesado(av)) return window.GN_AVAL_PESOS[av.cargo];
  return [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
};

// Respostas na mesma ordem dos pesos. Critério ainda não respondido conta 0 (igual antes).
function _gnAvalRespostas(av) {
  var crit = (av && av.criteriosSetor) || [];
  var out = [(av && av.pontualidade) || 0, (av && av.uniforme) || 0];
  for (var i = 0; i < 10; i++) out.push(crit[i] || 0);
  return out;
}

window.gnAvalNota = function (av) {
  var w = window.gnAvalPesos(av), r = _gnAvalRespostas(av), s = 0;
  for (var i = 0; i < 12; i++) s += (w[i] || 0) * r[i];
  return s;
};

// Máximo só conta os 10 critérios do setor quando o cargo TEM critérios cadastrados —
// mesma regra da conta antiga (10 + 50 se houver setor), pra avaliação sem cargo definido
// não virar 0% por causa de um denominador inflado.
//
// O reconhecimento do cargo não pode depender só de `window.SETORES`: nos apps que
// carregam gn-avaliacoes-setores.js (e no gn-avaliacoes.html, que tem a sua própria
// cópia), SETORES é declarado com `const` no topo do script — e `const` NÃO vira
// propriedade de window. Ou seja, window.SETORES é undefined em todo lugar, e confiar
// nele zerava os 10 critérios do denominador, jogando toda avaliação pra perto de 100%.
// GN_AVAL_PESOS tem exatamente os mesmos 9 cargos, então serve de reconhecedor.
window.gnAvalMax = function (av) {
  var w = window.gnAvalPesos(av);
  var cargo = av && av.cargo;
  var temSetor = !!(cargo && ((window.SETORES && window.SETORES[cargo]) || window.GN_AVAL_PESOS[cargo]));
  var s = (w[0] + w[1]) * 5;
  if (temSetor) for (var i = 2; i < 12; i++) s += w[i] * 5;
  return s;
};

window.gnAvalPct = function (av) {
  var mx = window.gnAvalMax(av);
  return mx > 0 ? window.gnAvalNota(av) / mx * 100 : 0;
};

// Duas avaliações só são comparáveis (o "↑+3pp" da evolução) quando as duas estão no mesmo
// regime. Comparar uma de 60 pontos sem peso com uma de 220 com peso mede coisas
// diferentes e inventaria uma queda ou uma alta que ninguém teve.
window.gnAvalComparavel = function (a, b) {
  return window.gnAvalPesado(a) === window.gnAvalPesado(b);
};

// ── Corte de faixa por falta ───────────────────────────────────────────────────────────
//
// Peso sozinho não resolveu o que motivou tudo: com os pesos definidos, a fatia da
// pontualidade só foi de 8,3% pra 8,9%–11,8% (subir uma pergunta junto com quase todas as
// outras não muda a fatia de ninguém), e o funcionário "bom no serviço, falta muito" saía
// de 75% pra 74% — seguia "Dentro do Padrão". O corte age sobre a FAIXA, não sobre a nota:
//
//   1 falta no período  → não pode ser Ouro (teto: Dentro do Padrão)
//   2 ou mais           → teto: Alerta Amarelo
//
// A nota em % não muda; o que muda é o rótulo. Assim o corte é explicável pro funcionário
// ("sua nota é 88%, mas teve 2 faltas") em vez de aparecer como uma nota mexida.
window.GN_AVAL_CORTE_JANELA_DIAS = 90;
// Conta como falta o que a regra de gorjeta já trata como ausência não justificada (ver
// calcSemana em gn-lojas-config.js: nFS = FALTA + SUSPENSÃO). ATESTADO, JUSTIFICATIVA,
// FÉRIAS, FOLGA e AFASTAMENTO nunca entram — falta abonada não é falta.
window.GN_AVAL_FALTA_STATUS = ['FALTA', 'SUSPENSÃO'];

window.GN_AVAL_FAIXAS = ['vermelho', 'amarelo', 'padrao', 'ouro'];

window.gnAvalFaixaPorPct = function (p) {
  return p >= 85 ? 'ouro' : p >= 60 ? 'padrao' : p >= 40 ? 'amarelo' : 'vermelho';
};

// Teto que o número de faltas impõe. `null`/`undefined` = não se sabe (avaliação antiga,
// sem o campo) → sem teto, nada muda.
window.gnAvalTetoPorFalta = function (faltas) {
  if (faltas === null || faltas === undefined || isNaN(faltas)) return null;
  if (faltas >= 2) return 'amarelo';
  if (faltas >= 1) return 'padrao';
  return null;
};

window.gnAvalAplicarCorte = function (faixa, faltas) {
  var teto = window.gnAvalTetoPorFalta(faltas);
  if (!teto) return faixa;
  var F = window.GN_AVAL_FAIXAS;
  return F.indexOf(faixa) > F.indexOf(teto) ? teto : faixa;
};

// Quantas faltas ficaram gravadas na avaliação. É gravado UMA VEZ, quando a avaliação é
// finalizada — não relido depois. Faltas que a pessoa der no mês seguinte não podem
// rebaixar, meses depois, uma avaliação já assinada e conversada com ela.
window.gnAvalFaltas = function (av) {
  var n = av && av.faltasPeriodo;
  return (typeof n === 'number' && n >= 0) ? n : null;
};

// A faixa final da avaliação, já com o corte. É por aqui que os quatro apps devem passar.
window.gnAvalFaixa = function (av) {
  return window.gnAvalAplicarCorte(
    window.gnAvalFaixaPorPct(window.gnAvalPct(av)),
    window.gnAvalFaltas(av)
  );
};

// O corte de fato rebaixou esta avaliação? Serve pra explicar na tela em vez de o número
// e o rótulo parecerem brigar entre si.
window.gnAvalCorteAplicado = function (av) {
  return window.gnAvalFaixaPorPct(window.gnAvalPct(av)) !== window.gnAvalFaixa(av);
};

window.gnAvalCorteTxt = function (av) {
  if (!window.gnAvalCorteAplicado(av)) return '';
  var n = window.gnAvalFaltas(av);
  return n === 1 ? 'teto por 1 falta no período' : 'teto por ' + n + ' faltas no período';
};

// Conta FALTA/SUSPENSÃO de um funcionário nos últimos `dias` antes de `ateISO`, lendo o
// all_data de gn_comissoes (o mesmo que o app Gorjetas grava dia a dia).
//
// O calendário passou a guardar o ANO de cada dia (`y`), então a data é exata. Antes era
// montada com o ano da avaliação e recuada um ano quando caía mais de 180 dias à frente —
// chute que errava na semana que atravessa o réveillon, justamente o caso que ele existia
// pra cobrir.
window.gnAvalContarFaltas = function (allData, nome, ateISO, dias) {
  var cal = window.COMISSOES_CAL;
  if (!allData || !nome || !ateISO || !cal) return null;
  var alvo = String(nome).trim().toLowerCase();
  if (!alvo) return null;
  var ate = new Date(ateISO + 'T12:00:00');
  if (isNaN(ate)) return null;
  var janela = (typeof dias === 'number' ? dias : window.GN_AVAL_CORTE_JANELA_DIAS);
  var de = new Date(ate); de.setDate(de.getDate() - janela);
  var status = window.GN_AVAL_FALTA_STATUS;
  var total = 0;

  Object.keys(allData).forEach(function (k) {
    if (!/^\d+$/.test(k)) return;               // ferias_geral e afins não são semanas
    var sem = cal[Number(k)];                    // índice do all_data = índice do calendário
    if (!sem || !sem.days) return;
    var wd = allData[k];
    if (!wd || !wd.funcs) return;
    var func = wd.funcs.filter(function (f) {
      return f && f.nome && String(f.nome).trim().toLowerCase() === alvo;
    })[0];
    if (!func || !func.dias) return;
    sem.days.forEach(function (d, i) {
      if (status.indexOf(func.dias[i]) < 0) return;
      var dt = new Date(d.y, d.m - 1, d.d, 12, 0, 0);
      if (dt >= de && dt <= ate) total++;
    });
  });
  return total;
};

// Confere que peso e pergunta continuam alinhados. Chamado pelos testes; devolve a lista
// de problemas (vazia = tudo certo).
window.gn_aval_pesos_conferir = function () {
  var erros = [];
  Object.keys(window.GN_AVAL_PESOS).forEach(function (cargo) {
    var w = window.GN_AVAL_PESOS[cargo];
    if (w.length !== 12) erros.push(cargo + ': tem ' + w.length + ' pesos, deveria ter 12');
    var soma = w.reduce(function (a, x) { return a + x * 5; }, 0);
    if (soma !== window.GN_AVAL_PESOS_TOTAL[cargo]) {
      erros.push(cargo + ': soma ' + soma + ' pts, mas o total cadastrado é ' + window.GN_AVAL_PESOS_TOTAL[cargo]);
    }
    if (window.SETORES) {
      if (!window.SETORES[cargo]) erros.push(cargo + ': tem peso mas não existe em SETORES');
      else if (window.SETORES[cargo].length !== 10) erros.push(cargo + ': SETORES tem ' + window.SETORES[cargo].length + ' critérios, os pesos assumem 10');
    }
  });
  if (window.SETORES) {
    Object.keys(window.SETORES).forEach(function (cargo) {
      if (!window.GN_AVAL_PESOS[cargo]) erros.push(cargo + ': existe em SETORES mas ficou sem peso');
    });
  }
  return erros;
};
