/* ── REGISTRO DE AVISOS ────────────────────────────────────────────────────────────────
   "Os avisos que volta e meia colocamos como card, como a da eleição que colocamos, a do
    feriado, nesse estilo sempre."

   Antes disso cada aviso era um card escrito à mão no meio do gn-home.html, com as datas
   fixas no código. Funcionava, mas tinha dois defeitos que só aparecem com o tempo: um
   aviso novo custava uma cirurgia (achar o lugar, escrever o HTML, lembrar de tirar
   depois), e nada lia a lista de avisos ativos — então a tela de abertura do Check-list
   não teria como mostrá-los sem copiar tudo de novo e passar a ter DUAS verdades sobre a
   mesma eleição.

   Aqui cada aviso é UMA ENTRADA. Quem desenha é quem consome (o card do Home e a tela de
   abertura desenham diferente, de propósito — um é cartão na lista, o outro é tela cheia).

   Campos:
     id      chave estável; é por ela que a leitura de cada pessoa é registrada, então
             MUDAR O ID faz o aviso voltar a aparecer pra todo mundo. Mude de propósito,
             nunca por arrumação.
     de/ate  ISO, ambos inclusive. Fora da janela o aviso simplesmente não existe — aviso
             vencido no ar é o que ensina a equipe a ignorar os outros.
     peso    'alto' pinta de vermelho e vai pro topo; 'normal' é azul.
     lojas   omitido = todas as 11. A Maglia só entra quando for citada explicitamente
             (CLAUDE.md), então ela fica de fora por padrão aqui também.
     cargos  omitido = todos os que passam pela tela.
     itens   lista opcional de pontos práticos; aceita <b>.                                */
(function (raiz) {
  'use strict';

  const AVISOS = [
    {
      id: 'eleicao-2026-1t',
      de: '2026-09-20', ate: '2026-10-04',
      peso: 'normal', icone: '🗳️',
      titulo: 'Eleição 04/10 — feche a escala antes',
      sub: '1º turno, domingo',
      texto: 'Domingo de eleição é o dia que mais derruba escala: <b>todo mundo precisa votar</b>, muita gente vota longe da loja e o movimento não é o de um domingo comum. Escala montada na véspera nesse dia vira sufoco — planeje agora.',
      itens: [
        'Levante <b>hoje</b> quem vota onde e em que horário — não no sábado.',
        'As urnas abrem <b>8h</b> e fecham <b>17h</b>: quem trabalhar precisa de janela pra votar, e ninguém pode ficar sem.',
        'Reforce os <b>horários de pico</b> em vez de espalhar gente o dia inteiro.',
        'Deixe combinado quem cobre se alguém atrasar voltando da seção.',
        'Depois vem o <b>2º turno em 25/10</b> — mesmo planejamento.',
      ],
    },
    {
      id: 'eleicao-2026-2t',
      de: '2026-10-05', ate: '2026-10-25',
      peso: 'normal', icone: '🗳️',
      titulo: 'Eleição 25/10 — feche a escala antes',
      sub: '2º turno, domingo',
      texto: 'Domingo de eleição é o dia que mais derruba escala: <b>todo mundo precisa votar</b>, muita gente vota longe da loja e o movimento não é o de um domingo comum. Escala montada na véspera nesse dia vira sufoco — planeje agora.',
      itens: [
        'Levante <b>hoje</b> quem vota onde e em que horário — não no sábado.',
        'As urnas abrem <b>8h</b> e fecham <b>17h</b>: quem trabalhar precisa de janela pra votar, e ninguém pode ficar sem.',
        'Reforce os <b>horários de pico</b> em vez de espalhar gente o dia inteiro.',
        'Deixe combinado quem cobre se alguém atrasar voltando da seção.',
      ],
    },
  ];

  // Comparação de ISO é textual de propósito: 'YYYY-MM-DD' ordena igual à data, e montar
  // Date a partir de ISO puro cai em UTC — em Brasília isso jogava o aviso pra fora da
  // janela durante as primeiras horas do dia.
  function ativos(hojeISO, opts) {
    const o = opts || {};
    const loja = o.loja || null;
    const cargo = String(o.cargo || '').toLowerCase();
    return AVISOS
      .filter(a => (!a.de || hojeISO >= a.de) && (!a.ate || hojeISO <= a.ate))
      .filter(a => !loja || (a.lojas ? a.lojas.indexOf(loja) >= 0 : loja !== 'MAGLIA'))
      .filter(a => !cargo || !a.cargos || a.cargos.indexOf(cargo) >= 0)
      .sort((x, y) => (y.peso === 'alto') - (x.peso === 'alto'));
  }

  function porId(id) { return AVISOS.filter(a => a.id === id)[0] || null; }

  raiz.GN_AVISOS = AVISOS;
  raiz.gnAvisosAtivos = ativos;
  raiz.gnAvisoPorId = porId;
})(typeof window !== 'undefined' ? window : globalThis);
