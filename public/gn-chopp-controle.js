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
  // As duas janelas de UMA loja, a partir das linhas cruas do banco — o mesmo código no
  // Painel (todas as lojas) e no app Lojas (a própria loja).
  //   o.cont: gn_barris_semanal_contagem (semana_inicio, tipo, status, criado_em) da loja
  //   o.ent:  gn_barris_validade da loja (criado_em) · o.tipoDe(linha) → 'CLARO'|'VINHO'
  //   o.vend: gn_vendidos_diario da loja (data, totais)
  //   o.W1 / o.W / o.QUI: segunda passada, segunda, quinta ('YYYY-MM-DD') · o.inicio: 1º dia dos vendidos
  function isoMais(iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function janelasLoja(o) {
    var daSemana = function (s) { return (o.cont || []).filter(function (r) { return r.semana_inicio === s; }); };
    var quando = function (rs) { return rs.reduce(function (m, r) { return r.criado_em > m ? r.criado_em : m; }, ''); };
    var janela = function (sIni, sFim, dias) {
      var a = daSemana(sIni), b = daSemana(sFim);
      if (!a.length || !b.length) return { semContagem: !a.length ? sIni : sFim };
      if (dias[dias.length - 1] < o.inicio) return { antesDosVendidos: true };
      var tA = quando(a), tB = quando(b), out = {};
      ['CLARO', 'VINHO'].forEach(function (tipo) {
        var entradas = (o.ent || []).filter(function (e) { return o.tipoDe(e) === tipo && e.criado_em > tA && e.criado_em <= tB; }).length;
        var vRows = (o.vend || []).filter(function (v) { return dias.indexOf(String(v.data).slice(0, 10)) >= 0; });
        var litros = vRows.reduce(function (s2, v) { return s2 + (+((v.totais || {})[tipo === 'CLARO' ? 'chopp_l_claro' : 'chopp_l_vinho']) || 0); }, 0);
        out[tipo] = fechar({ ini: a.filter(function (r) { return r.tipo === tipo; }).map(function (r) { return r.status; }),
                             fim: b.filter(function (r) { return r.tipo === tipo; }).map(function (r) { return r.status; }),
                             entradas: entradas, litros: litros, diasVend: vRows.length, diasTotal: dias.length });
      });
      return out;
    };
    return {
      fechada: janela(o.W1, o.W, [0, 1, 2, 3, 4, 5, 6].map(function (n) { return isoMais(o.W1, n); })),
      acomp: janela(o.W, o.QUI, [0, 1, 2].map(function (n) { return isoMais(o.W, n); })),
    };
  }
  window.gnChoppControle = { janelasLoja: janelasLoja, isoMais: isoMais, FRACAO: FRACAO, CANECA_L: CANECA_L, CANECAS_META: CANECAS_META, CANECAS_TEORICO: CANECAS_TEORICO,
    PERDA_MAX: PERDA_MAX, BARRIL_L: BARRIL_L, TOLERANCIA: TOLERANCIA, equivalente: equivalente, fechar: fechar };
})();
