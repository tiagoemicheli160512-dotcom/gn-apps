/* ── Quebras de utensílios: quantas peças quebraram, por peça ──────────────────────────
   "No nosso controle de utensílios não aparece quantidade quebrada, o saldo só diminui."
   (24/11/2026)

   Por que contar dos LANÇAMENTOS e não do saldo: o saldo (gn_lojas.all_data.utensilios_saldo)
   só cai quando alguém toca "Lançar no controle" no item. Em 24/11/2026 a rede tinha 61
   lançamentos de quebra (88 peças), e 43 dessas peças nunca tinham sido descontadas — o saldo
   sozinho escondia metade do que quebrou. A fonte de verdade da quebra é o item "Utensílio /
   Louça" com situação "Quebrou" em checklist_diario.manutencao; o saldo diz se ela já foi
   DESCONTADA. (Contar as linhas cruas do banco dá ~500: são as mesmas pendências copiadas
   dia após dia — ver o primeiro cuidado abaixo.)

   Cuidados:
   • O mesmo item atravessa dias: o que fica em aberto é COPIADO pro dia seguinte, com id
     novo. Conta UMA vez, na data em que apareceu primeiro — senão a quebra de segunda
     contaria de novo na terça, na quarta… (ver agrupar()).
   • "descontada" vale se o item foi aplicado em QUALQUER dia em que aparece.
   • Sem situação = "Quebrou" (é o padrão do Check-list desde que o campo existe).
   • A peça é casada pelo mesmo normalizador do Check-list e da Manutenção (sem acento,
     minúscula, espaço colapsado, 60 caracteres) — "Canecão" e "canecao" são a mesma.

   Usado pelo Check-list (aba Utensílios) e pelo Painel de Gestão (aba Utensílios). */
(function () {
  var TIPO = 'Utensílio / Louça';
  function chave(nome) {
    return String(nome == null ? '' : nome)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
  }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; }

  // rows: [{data_operacao, manutencao:[…]}] de UMA loja, de preferência com uns dias ANTES de
  // `desde` (a quebra herdada do dia anterior à janela só é reconhecida como herdada se o
  // dia anterior vier junto). desde/ate: 'YYYY-MM-DD' (opcionais), aplicados à data em que
  // a quebra apareceu PRIMEIRO.
  // Devolve { porPeca: {chave: {nome, qtd, lancs, naoDesc, naoDescLancs, ultima}},
  //           total, lancs, naoDesc, naoDescLancs }.
  function aberto(m) { return !(m.status === 'Resolvido' && m.confirmado_loja); }
  function agrupar(rows, desde, ate) {
    var itens = {}, prev = [];
    (rows || []).slice().sort(function (a, b) { return String(a.data_operacao).localeCompare(String(b.data_operacao)); })
      .forEach(function (r) {
        var arr = Array.isArray(r && r.manutencao) ? r.manutencao : [];
        var uts = arr.filter(function (m) { return m && m.tipo === TIPO; });
        // O que o dia anterior deixou em aberto é o que o Check-list copia pra hoje — com id
        // NOVO (novoIdLocalChk) e todos os outros campos iguais. Antes do orig_id (24/11/2026)
        // a cópia só é reconhecível pelo conteúdo: casa primeiro peça+quantidade, depois só a
        // peça (a quantidade pode ter sido corrigida no dia seguinte). Um pra um: se hoje tem
        // dois "copo 1" e ontem só um em aberto, o segundo é quebra nova.
        var livres = prev.slice(), cur = [];
        var tomar = function (pred) {
          for (var i = 0; i < livres.length; i++) if (pred(livres[i])) return livres.splice(i, 1)[0];
          return null;
        };
        // Três passadas, da identidade mais certa pra menos: orig_id; depois peça+quantidade
        // pra TODOS; só então peça sozinha. Numa passada única, um "copo 2" novo listado antes
        // do "copo 1" herdado roubaria a identidade dele pelo casamento só de peça.
        var idents = new Array(uts.length);
        uts.forEach(function (m, i) {
          if (m.orig_id == null) return;
          var o = String(m.orig_id);
          // orig_id aponta pro item de ontem — que pode ser uma cópia de antes do orig_id
          // existir (e aí a identidade dele veio do conteúdo): casa pelo id cru também.
          // Sem par: é quebra própria. NÃO cai no casamento por conteúdo — quem tem orig_id é
          // cópia de algo que estava no dia anterior; se não está, juntar pela peça colaria
          // esta quebra numa outra do mesmo copo.
          var h = tomar(function (p) { return p.ident === 'o:' + o || p.id === o || p.orig === o; });
          idents[i] = h ? h.ident : 'o:' + o;
        });
        uts.forEach(function (m, i) {
          if (idents[i]) return;
          var ck = chave(m.descricao), q = num(m.qtd);
          var h = tomar(function (p) { return p.ck === ck && p.q === q; });
          if (h) idents[i] = h.ident;
        });
        uts.forEach(function (m, i) {
          if (idents[i]) return;
          var ck = chave(m.descricao);
          var h = tomar(function (p) { return p.ck === ck; });
          idents[i] = h ? h.ident : 'o:' + (m.id != null ? m.id : r.data_operacao + '|' + ck + '|' + num(m.qtd));
        });
        uts.forEach(function (m, i) {
          var ck = chave(m.descricao), q = num(m.qtd), ident = idents[i];
          if (aberto(m)) cur.push({ ident: ident, id: m.id != null ? String(m.id) : '', orig: m.orig_id != null ? String(m.orig_id) : '', ck: ck, q: q });
          if ((m.situacao || 'Quebrou') !== 'Quebrou') return;
          var ja = itens[ident];
          if (!ja) {
            itens[ident] = { dia: r.data_operacao, nome: String(m.descricao || '').trim(), qtd: q,
                             chave: m.saldo_chave || ck, desc: !!m.saldo_aplicado };
          } else {
            // A mesma quebra num dia seguinte: vale a última quantidade e a última descrição; a
            // data continua a do primeiro dia; descontada se foi descontada em qualquer dia.
            if (q) ja.qtd = q;
            if (m.saldo_aplicado) { ja.desc = true; if (m.saldo_chave) ja.chave = m.saldo_chave; }
            if (String(m.descricao || '').trim()) { ja.nome = String(m.descricao).trim(); if (!ja.desc) ja.chave = ck; }
          }
        });
        prev = cur;
      });
    var res = { porPeca: {}, total: 0, lancs: 0, naoDesc: 0, naoDescLancs: 0 };
    Object.keys(itens).forEach(function (id) {
      var it = itens[id];
      if (desde && it.dia < desde) return;
      if (ate && it.dia > ate) return;
      if (!it.qtd || !it.chave) return;
      var p = res.porPeca[it.chave] || (res.porPeca[it.chave] = { nome: it.nome, qtd: 0, lancs: 0, naoDesc: 0, naoDescLancs: 0, ultima: '' });
      p.qtd += it.qtd; p.lancs++;
      if (it.dia > p.ultima) { p.ultima = it.dia; if (it.nome) p.nome = it.nome; }
      res.total += it.qtd; res.lancs++;
      if (!it.desc) { p.naoDesc += it.qtd; p.naoDescLancs++; res.naoDesc += it.qtd; res.naoDescLancs++; }
    });
    return res;
  }

  window.gnUtensQuebras = { agrupar: agrupar, chave: chave, TIPO: TIPO };
})();
