/* ── Carnes: esperado × contado, dia a dia ─────────────────────────────────────────────
   "É possível fazer um comparativo automático entre a contagem anterior e as vendas do
    período? Contagem de segunda 100 kg, vendido 20 kg, saldo esperado 80 kg, contagem 75 kg:
    divergência negativa de 5 kg." (25/11/2026)

   Regras decididas com o dono (25/11/2026):
   • A contagem é de TODA a carne da casa, inclusive a que chegou e está na salga. Então a
     carne entra na PRIMEIRA contagem depois que chegou. A contagem do dia é feita até 11h,
     antes de abrir: entrega conferida antes das 11h já está na contagem do mesmo dia; a
     conferida depois (o normal — medido em 26/11: as entregas de terça chegam à tarde e
     aparecem na contagem de quarta) entra na contagem do dia seguinte.
     Esperado(D) = contagem(D−1) + o que chegou entre as duas contagens − vendido(D−1).
   • SEGUNDA é a exceção: a carne que chega na segunda NUNCA entra na contagem de segunda
     (senão a venda de segunda some no meio da entrega); ela soma no esperado de terça.
   • A contagem de terça já viu a venda inteira de segunda — por isso o vendido é o do dia
     ANTERIOR.
   • Perda na salga, sobre o peso que chegou: carne de sol 6%, carne seca 30%. Picanha e
     camarão não vão pra salga.
   • Margem de pesagem: 1 kg. Dentro dela é "bate"; fora, falta (contou menos) ou sobra.
   • Dia sem contagem: o esperado anda a partir da última contagem que existe (pular um dia
     não quebra a conta). Dia sem vendidos lançados: "sem dado", nunca divergência — sem a
     venda o esperado fica alto e acusaria falta que não existe.

   Usado pelo Painel de Gestão (aba Carnes) e pela aba de acompanhamento diário (Home da
   loja) — o MESMO cálculo nos dois lugares, sem cópia. Funções puras: não leem banco. */
(function () {
  var DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
  var DIAS_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom', 'Seg seg.'];
  var PERDA_SALGA = { carne_sol: 0.06, carne_seca: 0.30, picanha: 0, camarao: 0 };
  var MARGEM_KG = 1;

  function num(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    var x = parseFloat(String(v).replace(',', '.'));
    return isFinite(x) ? x : null;
  }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  // Contagens da semana numa régua de 8 posições: 0 = segunda (o estoque inicial), 1..6 =
  // terça a domingo, 7 = segunda seguinte (contagem_final, o fechamento da semana).
  function contagens(c) {
    c = c || {};
    var out = [num(c.inicial)];
    for (var i = 1; i < 7; i++) out.push(num(c[DIAS[i]]));
    out.push(num(c.contagem_final));
    return out;
  }
  function entradas(c) {
    c = c || {};
    return DIAS.map(function (d) { return num(c['ent_' + d]) || 0; });
  }

  // Em que contagem cada entrada aparece: posição 0..7 da régua. ent[d] chega no dia d; a
  // parte conferida antes da contagem daquele dia (antesDaContagem[d], kg) já está nela; o
  // resto só aparece na contagem seguinte (d+1 — domingo vai pra segunda seguinte, 7).
  // Segunda nunca entra na própria contagem. Sem a hora da conferência (nota fiscal, número
  // digitado), vai pra seguinte: é o caso normal, entrega à tarde.
  function entradasPorContagem(c, antesDaContagem) {
    var ent = entradas(c), por = [0, 0, 0, 0, 0, 0, 0, 0];
    antesDaContagem = antesDaContagem || [];
    for (var d = 0; d < 7; d++) {
      if (!ent[d]) continue;
      var mesmo = d === 0 ? 0 : Math.min(ent[d], Math.max(0, Number(antesDaContagem[d]) || 0));
      por[d] += mesmo; por[d + 1] += ent[d] - mesmo;
    }
    return por;
  }

  // corte: chave; c: checklist_carnes.carnes[corte]; vendDia: 7 posições em kg, null = dia
  // sem vendidos lançados; antesDaContagem: kg de cada dia conferidos antes da contagem.
  // Devolve as 7 comparações (terça .. segunda seguinte).
  function dias(corte, c, vendDia, antesDaContagem) {
    var cont = contagens(c), ent = entradasPorContagem(c, antesDaContagem), perda = PERDA_SALGA[corte] || 0;
    vendDia = vendDia || [];
    var out = [];
    for (var i = 1; i <= 7; i++) {
      var r = { i: i, label: DIAS_LABEL[i], contado: cont[i], esperado: null, dif: null, status: 'sem_dado',
                base: null, baseValor: null, entBruta: 0, entLiq: 0, vend: 0, faltaVend: [] };
      var j = -1;
      for (var k = i - 1; k >= 0; k--) if (cont[k] !== null) { j = k; break; }
      if (j < 0) { r.motivo = 'sem contagem anterior'; out.push(r); continue; }
      r.base = j; r.baseValor = cont[j];
      // Entradas que apareceram nas contagens depois da base, até a comparada.
      var bruta = 0;
      for (var d = j + 1; d <= i; d++) bruta += ent[d];
      r.entBruta = r3(bruta); r.entLiq = r3(bruta * (1 - perda));
      // Vendidos: do dia da base até a véspera do dia comparado.
      var vend = 0;
      for (var v = j; v <= i - 1; v++) {
        var x = vendDia[v];
        if (x === null || x === undefined) r.faltaVend.push(DIAS_LABEL[v]);
        else vend += Number(x) || 0;
      }
      r.vend = r3(vend);
      if (r.faltaVend.length) { r.motivo = 'sem vendidos de ' + r.faltaVend.join(', '); out.push(r); continue; }
      r.esperado = r3(r.baseValor + r.entLiq - r.vend);
      if (r.contado === null) { r.status = 'sem_contagem'; r.motivo = 'sem contagem'; out.push(r); continue; }
      r.dif = r3(r.contado - r.esperado);
      r.status = Math.abs(r.dif) <= MARGEM_KG ? 'ok' : r.dif < 0 ? 'falta' : 'sobra';
      out.push(r);
    }
    // Falta num dia e sobra do MESMO tamanho no dia seguinte (ou o contrário) não é perda: é
    // carne que estava na casa e só foi contada um dia depois (na salga, que é o que o dono
    // descreveu). Medido em 26/11/2026: São Gonçalo carne de sol −94 / +97, Pedreira picanha
    // −40 / +39. Continua aparecendo — é erro de contagem a corrigir — mas marcado, pra não
    // ser lido como desvio. "Mesmo tamanho": a soma dos dois cabe na margem ou em 10%.
    for (var t = 0; t + 1 < out.length; t++) {
      var a = out[t], b = out[t + 1];
      if (a.dif === null || b.dif === null || a.status === 'ok' || b.status === 'ok' || a.status === b.status) continue;
      if (Math.abs(a.dif + b.dif) <= Math.max(MARGEM_KG, 0.1 * Math.abs(a.dif))) { a.compensa = b.label; b.compensa = a.label; t++; }
    }
    return out;
  }

  // Semana em andamento: quanto deveria ter agora, antes da venda de hoje. hojeIdx: 0..6.
  // "Chegou" é tudo o que chegou depois da última contagem, inclusive hoje.
  function previsao(corte, c, vendDia, hojeIdx, antesDaContagem) {
    var cont = contagens(c), ent = entradasPorContagem(c, antesDaContagem), perda = PERDA_SALGA[corte] || 0;
    vendDia = vendDia || [];
    var j = -1;
    for (var k = Math.min(hojeIdx, 6); k >= 0; k--) if (cont[k] !== null) { j = k; break; }
    if (j < 0) return { semContagem: true };
    var bruta = 0;
    for (var d = j + 1; d <= hojeIdx + 1; d++) bruta += ent[d];
    var vend = 0, falta = [];
    for (var v = j; v <= hojeIdx - 1; v++) {
      var x = vendDia[v];
      if (x === null || x === undefined) falta.push(DIAS_LABEL[v]); else vend += Number(x) || 0;
    }
    var liq = bruta * (1 - perda);
    return { base: j, baseLabel: DIAS_LABEL[j], baseValor: cont[j], chegouBruto: r3(bruta), chegouLiq: r3(liq),
             vendido: r3(vend), faltaVend: falta, deveTer: r3(cont[j] + liq - vend) };
  }

  // Resumo da semana de um corte: quantos dias bateram, faltaram, sobraram, e o saldo. Os
  // pares que se compensam (contagem atrasada um dia) ficam fora da falta/sobra.
  function resumo(lista) {
    var r = { ok: 0, falta: 0, sobra: 0, compensados: 0, semDado: 0, kgFalta: 0, kgSobra: 0 };
    (lista || []).forEach(function (x) {
      if (x.status === 'ok') r.ok++;
      else if (x.compensa) r.compensados++;
      else if (x.status === 'falta') { r.falta++; r.kgFalta = r3(r.kgFalta + x.dif); }
      else if (x.status === 'sobra') { r.sobra++; r.kgSobra = r3(r.kgSobra + x.dif); }
      else r.semDado++;
    });
    return r;
  }

  window.gnCarnesDiario = { DIAS: DIAS, DIAS_LABEL: DIAS_LABEL, PERDA_SALGA: PERDA_SALGA, MARGEM_KG: MARGEM_KG,
    HORA_CONTAGEM: 11, dias: dias, previsao: previsao, resumo: resumo, contagens: contagens, entradas: entradas,
    entradasPorContagem: entradasPorContagem };
})();
