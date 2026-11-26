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
              rendimento: null, perda: null, status: 'parcial',
              // Pro detalhe em canecas (26/11/2026): o que foi contado e o dia a dia.
              iniSt: (o.ini || []).slice(), fimSt: (o.fim || []).slice(), porDia: o.porDia || [] };
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
  function isoLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
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
        // Dia a dia: barril que chegou entra no dia em que foi lançado (o que chegou depois do
        // último dia de venda — ex.: quinta de manhã, antes da contagem — fica no último dia).
        var porDia = dias.map(function (d) {
          var v = vRows.filter(function (x) { return String(x.data).slice(0, 10) === d; });
          var l = v.reduce(function (s2, x) { return s2 + (+((x.totais || {})[tipo === 'CLARO' ? 'chopp_l_claro' : 'chopp_l_vinho']) || 0); }, 0);
          return { dia: d, ent: 0, canecas: l / CANECA_L, lancado: v.length > 0 };
        });
        (o.ent || []).forEach(function (e) {
          if (o.tipoDe(e) !== tipo || !(e.criado_em > tA && e.criado_em <= tB)) return;
          var d = isoLocal(new Date(e.criado_em)), alvo = porDia.filter(function (x) { return x.dia === d; })[0] || porDia[d < dias[0] ? 0 : porDia.length - 1];
          if (alvo) alvo.ent++;
        });
        out[tipo] = fechar({ ini: a.filter(function (r) { return r.tipo === tipo; }).map(function (r) { return r.status; }),
                             fim: b.filter(function (r) { return r.tipo === tipo; }).map(function (r) { return r.status; }),
                             entradas: entradas, litros: litros, diasVend: vRows.length, diasTotal: dias.length, porDia: porDia });
      });
      return out;
    };
    return {
      fechada: janela(o.W1, o.W, [0, 1, 2, 3, 4, 5, 6].map(function (n) { return isoMais(o.W1, n); })),
      acomp: janela(o.W, o.QUI, [0, 1, 2].map(function (n) { return isoMais(o.W, n); })),
    };
  }

  /* ── Leitura em canecas (26/11/2026) ──────────────────────────────────────────────────
     "Na descrição usar sempre a métrica de canecas por barril, igual da Coca: seg tinha 1 e
      meio, 128 + 64 e o total; chegou 1, acrescentar 128 canecas, e diminuir da venda do
      dia." Mesma conta de fechar() — só escrita em canecas (barril × 128), dia a dia. */
  var ROT = { CHEIO: ['cheio', 'cheios'], NA_LINHA_CHEIO: ['na linha cheio', 'na linha cheios'], NA_LINHA_METADE: ['na linha pela metade', 'na linha pela metade'],
              NA_LINHA_ABAIXO_METADE: ['na linha abaixo da metade', 'na linha abaixo da metade'] };
  var ORDEM = ['CHEIO', 'NA_LINHA_CHEIO', 'NA_LINHA_METADE', 'NA_LINHA_ABAIXO_METADE'];
  function can(barris) { return Math.round(barris * CANECAS_META); }
  function nf(x) { return Math.round(x).toLocaleString('pt-BR'); }
  function barrisTxt(eq) {
    var int = Math.floor(eq + 1e-9), fr = Math.round((eq - int) * 4), f = ['', '¼', '½', '¾'][fr] || '';
    var t = (int || !f ? String(int) : '') + f;
    return t + (eq > 1 ? ' barris' : ' barril');
  }
  // "1 cheio + 1 na linha pela metade = 128 + 64 = 192 canecas" (+ vazios à parte).
  function composicao(statuses) {
    var cont = {}, vaz = 0;
    (statuses || []).forEach(function (s) { if (s === 'VAZIO') vaz++; else if (FRACAO[s] != null) cont[s] = (cont[s] || 0) + 1; });
    var partes = ORDEM.filter(function (s) { return cont[s]; });
    var total = can(equivalente(statuses));
    var txt = partes.length
      ? partes.map(function (s) { return cont[s] + ' ' + ROT[s][cont[s] > 1 ? 1 : 0]; }).join(' + ') +
        (partes.length > 1 ? ' = ' + partes.map(function (s) { return nf(can(cont[s] * FRACAO[s])); }).join(' + ') : '') +
        ' = ' + nf(total) + ' canecas'
      : 'nenhum barril com chopp = 0 canecas';
    return { txt: txt, canecas: total, vazios: vaz };
  }
  // Resumo de uma linha + veredito, em canecas. r = resultado de fechar().
  function resumo(r) {
    var ini = can(r.iniEq), ent = can(r.entradas), fim = can(r.fimEq);
    var deve = ini + ent - r.canecas, dif = fim - deve, tol = can(TOLERANCIA);
    var linha = 'início ' + nf(ini) + (r.entradas ? ' + chegou ' + nf(ent) + ' (' + barrisTxt(r.entradas) + ')' : '') + ' − vendeu ' + nf(r.canecas) +
      ' = deveria ter ' + nf(deve) + ' · contou ' + nf(fim);
    var ver = r.status === 'ok' && r.rendimento && r.rendimento >= CANECAS_META ? '✓ bate — rendeu ' + r.rendimento + ' canecas por barril (meta ' + CANECAS_META + '), dentro da meta'
      : r.status === 'ok' ? '✓ bate — diferença de ' + nf(Math.abs(dif)) + ' caneca' + (Math.abs(dif) === 1 ? '' : 's') + ' (até ' + tol + ' é a precisão da contagem, ¼ de barril)'
      : r.status === 'perda' ? '⚠ faltam ' + nf(-dif) + ' canecas — usou mais chopp do que vendeu' + (r.rendimento ? ' (' + r.rendimento + ' canecas por barril; meta ' + CANECAS_META + ')' : '')
      : r.status === 'conferir' ? '⚠ sobram ' + nf(dif) + ' canecas — vendeu mais do que os barris mostram: conferir a contagem ou barril que chegou sem registro'
      : r.status === 'sem_consumo' ? 'sem consumo'
      : 'vendidos incompletos — falta lançar ' + ((r.porDia || []).filter(function (d) { return !d.lancado; }).length || '') + ' dia(s)';
    return { ini: ini, ent: ent, fim: fim, deve: deve, dif: dif, linha: linha, veredito: ver };
  }
  // Tabela dia a dia em canecas (o mesmo HTML no Painel, na Home da loja e no app Lojas).
  // op: { rotIni: 'Contagem de segunda (23/11)', rotFim: 'Contagem de quinta (26/11)' }
  function detalheHtml(r, op) {
    op = op || {};
    var dm = function (iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); };
    var SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    // Sem a lista do que foi contado (dado antigo), fica o total em barris → canecas.
    var comp = function (st, eq) { return (st && st.length) || !eq ? composicao(st) : { txt: barrisTxt(eq) + ' = ' + nf(can(eq)) + ' canecas', vazios: 0 }; };
    var ci = comp(r.iniSt, r.iniEq), cf = comp(r.fimSt, r.fimEq), rs = resumo(r);
    var th = 'padding:3px 5px;font-size:10px;color:var(--t3,#64748b);text-align:right;border-bottom:1px solid var(--b1,#e2e8f0)';
    var td = 'padding:3px 5px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px solid var(--b1,#e2e8f0)';
    var saldo = rs.ini, linhas = (r.porDia || []).map(function (d) {
      var inicio = saldo; saldo = saldo + d.ent * CANECAS_META - d.canecas;
      return '<tr class="chopp-dia" data-dia="' + d.dia + '"><td style="' + td + ';text-align:left;font-weight:700">' + SEM[new Date(d.dia + 'T12:00:00').getDay()] + ' ' + dm(d.dia) + '</td>' +
        '<td style="' + td + '">' + nf(inicio) + '</td>' +
        '<td style="' + td + ';color:var(--txt-green,#15803d)">' + (d.ent ? '+' + nf(d.ent * CANECAS_META) + ' <span style="font-size:9px">(' + d.ent + (d.ent > 1 ? ' barris' : ' barril') + ')</span>' : '—') + '</td>' +
        '<td style="' + td + '">' + (d.lancado ? '−' + nf(d.canecas) : '<span style="color:var(--txt-amber,#b45309)">sem lançar</span>') + '</td>' +
        '<td style="' + td + ';font-weight:800">' + nf(saldo) + '</td></tr>';
    }).join('');
    var cor = r.status === 'ok' ? 'var(--txt-green,#15803d)' : r.status === 'perda' ? 'var(--txt-red,#dc2626)' : r.status === 'conferir' ? 'var(--txt-amber,#b45309)' : 'var(--t3,#64748b)';
    return '<div class="chopp-det" style="font-size:11px;color:var(--t2,#334155);line-height:1.45">' +
      '<div class="chopp-det-ini">📋 ' + (op.rotIni || 'Início') + ': ' + ci.txt + (ci.vazios ? ' <span style="color:var(--t3,#64748b)">(+ ' + ci.vazios + ' vazio' + (ci.vazios > 1 ? 's' : '') + ')</span>' : '') + '</div>' +
      (linhas ? '<div style="overflow-x:auto;margin:4px 0"><table style="border-collapse:collapse;width:100%;min-width:300px"><tr><th style="' + th + ';text-align:left">Dia</th><th style="' + th + '">Tinha</th><th style="' + th + '">Chegou</th><th style="' + th + '">Vendeu</th><th style="' + th + '">Deve ter</th></tr>' + linhas + '</table></div>'
        : '<div style="margin:3px 0">' + (r.entradas ? '+ chegou ' + nf(rs.ent) + ' (' + barrisTxt(r.entradas) + ') · ' : '') + '− vendeu ' + nf(r.canecas) + ' = deveria ter <b>' + nf(rs.deve) + '</b></div>') +
      '<div class="chopp-det-fim">📋 ' + (op.rotFim || 'Fim') + ': ' + cf.txt + (cf.vazios ? ' <span style="color:var(--t3,#64748b)">(+ ' + cf.vazios + ' vazio' + (cf.vazios > 1 ? 's' : '') + ')</span>' : '') + '</div>' +
      '<div class="chopp-det-ver" data-status="' + r.status + '" style="font-weight:800;color:' + cor + '">Contou ' + nf(rs.fim) + ' · deveria ter ' + nf(rs.deve) + ' → ' + rs.veredito + '</div>' +
      '</div>';
  }

  window.gnChoppControle = { resumo: resumo, detalheHtml: detalheHtml, composicao: composicao, barrisTxt: barrisTxt, canecas: can, janelasLoja: janelasLoja, isoMais: isoMais, FRACAO: FRACAO, CANECA_L: CANECA_L, CANECAS_META: CANECAS_META, CANECAS_TEORICO: CANECAS_TEORICO,
    PERDA_MAX: PERDA_MAX, BARRIL_L: BARRIL_L, TOLERANCIA: TOLERANCIA, equivalente: equivalente, fechar: fechar };
})();
