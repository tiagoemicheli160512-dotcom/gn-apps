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
      // Feriado do comércio, numa segunda. O aviso sai do ar sozinho no fim do dia 19 —
      // é pra isso que serve o `ate`.
      //
      // Peso alto porque segunda de feriado é o MAIOR dia da rede, não um dia comum
      // deslocado: nas duas últimas, as 11 lojas somaram R$ 330 mil (07/09) e R$ 440 mil
      // (12/10), contra ~R$ 68 mil numa segunda normal. O 12/10 vendeu mais que um
      // domingo médio (R$ 307 mil). Escalar como segunda é o erro caro aqui.
      id: 'dia-comercio-2026',
      de: '2026-10-17', ate: '2026-10-19',
      peso: 'alto', icone: '🏪',
      titulo: 'Dia do Comércio 19/10 — reforce a escala',
      sub: 'segunda-feira, feriado',
      texto: 'Segunda de feriado <b>não é segunda</b>. Nos dois últimos, a rede fez <b>R$ 330 mil</b> (07/09) e <b>R$ 440 mil</b> (12/10) — contra cerca de <b>R$ 68 mil</b> numa segunda comum. O 12/10 vendeu mais que um domingo médio.',
      itens: [
        'Monte a escala desse dia como se fosse <b>domingo forte</b>, não segunda.',
        'Confira na véspera o <b>abastecimento e a produção</b>: a conta é de feriado, não de segunda.',
        'Reforce os <b>horários de pico</b> em vez de espalhar gente o dia inteiro.',
        'Loja de shopping: confirme o <b>horário do shopping</b> no feriado antes de fechar a escala.',
        'Deixe combinado <b>quem cobre</b> se faltar alguém — num dia desses não dá pra absorver.',
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
