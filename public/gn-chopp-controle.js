/* ── Controle do chopp: barris consumidos × canecas vendidas ────────────────────────────
   Etapa 2 do plano de ajustes (26/11/2026). Parâmetros do dono:
     • Barril: 50 L · caneca de venda: 350 ml · rendimento teórico: 143 canecas.
     • Margem de perda: até 10% · meta operacional: 128 canecas por barril (claro e vinho).
     • "A cada 128 canecas vendidas, o sistema considera 1 barril vendido."
   O problema que isso resolve: o barril que está pela metade na linha ainda não foi
   finalizado, mas o chopp dele já foi vendido — não pode virar falta. Por isso a conta NÃO
   usa a finalização: usa a contagem semanal (segunda × segunda, ou segunda × quinta), em
   que cada barril vale a fração do que tem dentro:
       cheio 1 · na linha cheio 1 · na linha metade ½ · na linha abaixo da metade ¼ · vazio 0
   Barris consumidos = estoque no início + barris que chegaram − estoque no fim.
   Barris pelas vendas = canecas vendidas ÷ 128 (o chopp vendido em litros ÷ 0,35 L).
   Rendimento = canecas vendidas ÷ barris consumidos. ≥ 128 está na meta; abaixo, a perda
   passou de 10% sobre o teórico de 143.
   Precisão da leitura: a contagem anda de ¼ em ¼ de barril. Diferença de até ¼ de barril
   entre usados e vendidos é a própria imprecisão da contagem, não perda — sem isso, meio
   barril usado contra 0,49 vendido (Pedreira, 26/11) virava "perda" por 1 caneca.
   Usado pelo Painel de Gestão (aba Barris) e pela aba de acompanhamento. Funções puras. */
(function () {
  var FRACAO = { CHEIO: 1, NA_LINHA_CHEIO: 1, NA_LINHA_METADE: 0.5, NA_LINHA_ABAIXO_METADE: 0.25, VAZIO: 0 };
  var CANECA_L = 0.35, CANECAS_META = 128, CANECAS_TEORICO = 143, PERDA_MAX = 0.10, BARRIL_L = 50, TOLERANCIA = 0.25;
  function r2(x) { return Math.round(x * 100) / 100; }
  // statuses: lista de status de UM tipo (CLARO ou VINHO) numa contagem.
  function equivalente(statuses) {
    return r2((statuses || []).reduce(function (a, s) { return a + (FRACAO[s] != null ? FRACAO[s] : 0); }, 0));
  }
  // o: { ini:[status], fim:[status], entradas:n, litros:n, diasVend:n, diasTotal:n }
  function fechar(o) {
    var iniEq = equivalente(o.ini), fimEq = equivalente(o.fim);
    var consumido = r2(iniEq + (o.entradas || 0) - fimEq);
    var canecas = (o.litros || 0) / CANECA_L;
    var vendidoBarris = r2(canecas / CANECAS_META);
    var completo = (o.diasVend || 0) >= (o.diasTotal || 0);
    var r = { iniEq: iniEq, fimEq: fimEq, entradas: o.entradas || 0, consumido: consumido, litros: r2(o.litros || 0),
              canecas: Math.round(canecas), vendidoBarris: vendidoBarris, completo: completo,
              rendimento: null, perda: null, status: 'parcial' };
    if (!completo) return r;
    if (consumido <= 0 && vendidoBarris <= TOLERANCIA) { r.status = 'sem_consumo'; return r; }
    if (consumido > 0) {
      r.rendimento = Math.round(canecas / consumido);
      r.perda = r2(1 - (canecas / consumido) / CANECAS_TEORICO);
    }
    var dif = r2(consumido - vendidoBarris);
    r.dif = dif;
    // Usou mais barril do que as vendas explicam (perda acima de 10%) / vendeu mais do que
    // usou (contagem ou entrada de barril a conferir) / dentro da precisão da contagem.
    r.status = dif > TOLERANCIA ? 'perda' : dif < -TOLERANCIA ? 'conferir' : 'ok';
    return r;
  }
  window.gnChoppControle = { FRACAO: FRACAO, CANECA_L: CANECA_L, CANECAS_META: CANECAS_META, CANECAS_TEORICO: CANECAS_TEORICO,
    PERDA_MAX: PERDA_MAX, BARRIL_L: BARRIL_L, TOLERANCIA: TOLERANCIA, equivalente: equivalente, fechar: fechar };
})();
