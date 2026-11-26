/* ── Acompanhamento diário de carnes e bebidas ────────────────────────────────────────
   Pedido do dono (25/11/2026): "A aba ACOMPANHAMENTO DIÁRIO DE CARNES E BEBIDAS deverá
   ser disponibilizada em dois locais: Painel de Gestão (acompanhamento gerencial) e App
   Lojas Home (gerentes e subgerentes acompanharem a própria unidade). Mesmas informações
   nos dois ambientes; integração automática com o Painel de Carne e o de Vendidos;
   estoque inicial, entradas, saídas e saldo; fechamento após a segunda contagem (saldo
   físico, teórico e diferença); histórico por dia; faltas e sobras visíveis; sem
   lançamento nem alteração. Os dois ambientes consultam a mesma base." E (26/11): "onde
   num olhar sabemos identificar a diferença".

   Este arquivo é a ÚNICA leitura desses dados pros dois lugares, e as contas são as dos
   módulos que o Painel já usa — nada recalculado de outro jeito:
     • Carnes: gn-carnes-diario.js (esperado × contado, dia a dia, salga, margem 1 kg).
     • Chopp:  gn-chopp-controle.js (barris usados × canecas vendidas, ¼ de tolerância).
     • Coca:   contagem do Pedido de segunda + recebido − contagem da segunda seguinte =
               saída, contra o vendido lançado (a mesma conta da aba Vendidos do Painel,
               que passou a chamar daqui — gnAcomp.cocaSemana).
   Só leitura. Maglia fora (não foi citada; não tem aba Carnes nem chopp). */
(function () {
  'use strict';
  var SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';
  var H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  var LOJAS_FORA = ['MAGLIA'];
  var CARNES = [
    { key: 'carne_sol', label: 'Carne de sol', curto: 'C. sol' },
    { key: 'picanha', label: 'Picanha', curto: 'Picanha' },
    { key: 'carne_seca', label: 'Carne seca', curto: 'C. seca' },
    { key: 'camarao', label: 'Camarão', curto: 'Camarão' },
  ];
  // Os mesmos números do Painel (gn-home.html): catálogo do Rio, SP pela origem_item_id.
  var CARNES_ITEM_ID_RJ = { carne_sol: 207, carne_seca: 209, picanha: 392, camarao: 237 };
  var CARNE_SOL_POR_RODIZIO_KG = 0.250;
  var BARRIL_TIPO_CATALOGO = {
    'd8d457b1-0fb9-4c58-952b-27c175700f1f': 'CLARO', // Barril Chopp claro 50 litros (AMBEV)
    '60bbc4c5-a781-485b-9454-091d376d124a': 'VINHO', // Chopp Vinho Barril c/ 50 litros (DuGomes)
  };
  function tipoBarril(row) { return BARRIL_TIPO_CATALOGO[row.catalogo_id] || (/vinho/i.test(row.produto || '') ? 'VINHO' : 'CLARO'); }

  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function isoMais(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); }
  function segunda(off, agora) { var d = new Date(agora || new Date()); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * (off || 0)); return iso(d); }
  function norm(n) { if (n === 'SAO_GONCALO') return 'SÃO GONÇALO'; return String(n || '').toUpperCase().replace('AMÉRICA', 'AMERICA'); }
  function lojaDeSlug(slug) { var i = window.gnLojaPorChave ? window.gnLojaPorChave(slug) : null; return i ? norm(i.userKey) : null; }
  function lojasRede() {
    return (window.GN_LOJAS || []).filter(function (l) { return LOJAS_FORA.indexOf(l.userKey) < 0; })
      .map(function (l) { return { k: norm(l.userKey), slug: l.lojaSlug, nome: l.display || l.userKey }; });
  }
  function get(url, ctx) { return window.gnFetchJson(SB_URL + '/rest/v1/' + url, H, 'acomp:' + ctx, null); }
  function r1(x) { return Math.round(x * 10) / 10; }

  // ── Coca: a mesma conta da aba Vendidos do Painel ───────────────────────────────────
  // ini: Date da segunda; cad: gn_vendidos_itens; vendRows: gn_vendidos_diario (itens);
  // diasISO: os 7 dias. Devolve { porLoja: { k: { base: {ini, ent, fim, saida, entAgora,
  // contadoEm, vendido, diasVend, repetida, pendCx} } } } — ou { falhou: true }.
  function cocaSemana(ini, cad, vendRows, diasISO, prefixo) {
    var px = prefixo || 'acomp:';
    var getC = function (url, nome) { return window.gnFetchJson(SB_URL + '/rest/v1/' + url, H, px + nome, null); };
    var bases = []; (cad || []).forEach(function (c) { if (c.item_estoque && bases.indexOf(+c.item_estoque) < 0) bases.push(+c.item_estoque); });
    if (!bases.length) return Promise.resolve({ porLoja: {} });
    var dia = function (n) { var d = new Date(ini); d.setDate(d.getDate() + n); return d; };
    var lista = bases.join(',');
    return getC('gn_catalogo?or=(item_id.in.(' + lista + '),origem_item_id.in.(' + lista + '))&select=id,item_id,origem_item_id,und_por_caixa', 'estoqueCat').then(function (catRows) {
      if (!catRows) return { falhou: true, porLoja: {} };
      var cat = {}; catRows.forEach(function (c) { cat[c.id] = { base: +(c.origem_item_id || c.item_id), upc: parseFloat(c.und_por_caixa) || 1 }; });
      var ids = Object.keys(cat);
      if (!ids.length) return { porLoja: {} };
      return Promise.all([
        getC('gn_contagens_pedido?catalogo_id=in.(' + ids.join(',') + ')&data_contagem=gte.' + iso(ini) + '&data_contagem=lte.' + iso(dia(8)) + '&select=loja_slug,catalogo_id,atual,data_contagem,criado_em', 'estoqueCont'),
        getC('gn_recebimentos?select=qtd_recebida,validado_em,gn_provisoes!inner(loja_slug,catalogo_id)&gn_provisoes.catalogo_id=in.(' + ids.join(',') + ')&validado_em=gte.' + iso(dia(-1)) + 'T00:00:00&validado_em=lt.' + iso(dia(10)) + 'T00:00:00', 'estoqueRec'),
        // Pedido da semana ainda "aguardando" no recebimento — a causa mais comum de saída negativa.
        window.gnFetchJson(SB_URL + '/rest/v1/gn_provisoes?status=eq.AGUARDANDO&catalogo_id=in.(' + ids.join(',') + ')&data_entrega=gte.' + iso(dia(0)) + '&data_entrega=lte.' + iso(dia(6)) + '&select=loja_slug,catalogo_id,qtd_prevista', H, px + 'estoquePend', []),
      ]).then(function (r) {
        var cont = r[0], rec = r[1], pend = r[2];
        if (!cont || !rec) return { falhou: true, porLoja: {} };
        // Contagem da ponta: a da segunda (ou terça, quando a segunda foi feriado); no mesmo
        // dia, a última gravada.
        var ponta = function (de, ate) {
          var m = {};
          cont.filter(function (x) { return x.data_contagem >= de && x.data_contagem <= ate; }).forEach(function (x) {
            var k = lojaDeSlug(x.loja_slug), c = cat[x.catalogo_id]; if (!k || !c) return;
            var key = k + '|' + c.base, a = m[key];
            if (!a || x.data_contagem < a.data_contagem || (x.data_contagem === a.data_contagem && x.criado_em > a.criado_em)) m[key] = x;
          });
          return m;
        };
        var c0 = ponta(iso(dia(0)), iso(dia(1))), c1 = ponta(iso(dia(7)), iso(dia(8)));
        var baseDoVend = {}; (cad || []).forEach(function (c) { if (c.item_estoque) baseDoVend[c.id] = +c.item_estoque; });
        var vend = {}, diasVend = {};
        (vendRows || []).forEach(function (x) {
          var k = norm(x.loja); if (diasISO.indexOf(String(x.data).slice(0, 10)) < 0) return;
          diasVend[k] = (diasVend[k] || 0) + 1;
          Object.keys(x.itens || {}).forEach(function (id) { var b = baseDoVend[id]; if (!b) return; vend[k + '|' + b] = (vend[k + '|' + b] || 0) + (+((x.itens[id] || {}).q) || 0); });
        });
        var recDe = function (k, b, depois, ate) {
          return rec.filter(function (x) { var p = x.gn_provisoes || {}, c = cat[p.catalogo_id];
            return c && c.base === +b && lojaDeSlug(p.loja_slug) === k && x.validado_em > depois && (ate == null || x.validado_em <= ate); })
            .reduce(function (s, x) { return s + (parseFloat(x.qtd_recebida) || 0) * cat[x.gn_provisoes.catalogo_id].upc; }, 0);
        };
        var porLoja = {}, chaves = {};
        Object.keys(c0).concat(Object.keys(c1)).forEach(function (key) { chaves[key] = 1; });
        Object.keys(chaves).forEach(function (key) {
          var p = key.split('|'), k = p[0], b = p[1], a = c0[key], z = c1[key];
          var ent = a && z ? recDe(k, b, a.criado_em, z.criado_em) : null;
          var ini0 = a ? parseFloat(a.atual) : null, fim = z ? parseFloat(z.atual) : null;
          var entAgora = a && !z ? recDe(k, b, a.criado_em, null) : null;
          var pendCx = (pend || []).filter(function (x) { var c = cat[x.catalogo_id]; return c && c.base === +b && lojaDeSlug(x.loja_slug) === k; })
            .reduce(function (s, x) { return s + (parseFloat(x.qtd_prevista) || 0); }, 0);
          (porLoja[k] = porLoja[k] || {})[b] = { ini: ini0, ent: ent, fim: fim, saida: a && z ? ini0 + ent - fim : null, entAgora: entAgora,
            contadoEm: a ? a.criado_em : null, vendido: vend[key] == null ? null : vend[key], diasVend: diasVend[k] || 0,
            repetida: !!(a && z && ini0 === fim && ini0 > 0), pendCx: pendCx };
        });
        return { porLoja: porLoja };
      });
    });
  }
  // Status de UM item de Coca na semana fechada — mesma regra de cor da aba Vendidos:
  // diferença até max(6 un, 5% do vendido) é "bate"; saiu mais do que vendeu = falta.
  function cocaStatus(x) {
    if (!x || x.saida === null) return { status: 'sem_dado', motivo: !x || x.ini === null ? 'sem a contagem de segunda' : 'sem a contagem da segunda seguinte' };
    if (!(x.diasVend >= 7) || x.vendido === null) return { status: 'sem_dado', motivo: 'vendidos de ' + (x.diasVend || 0) + '/7 dias' };
    var dif = x.saida - x.vendido;   // > 0: saiu mais do que vendeu
    var leve = Math.abs(dif) <= Math.max(6, x.vendido * 0.05);
    return { status: leve ? 'ok' : dif > 0 ? 'falta' : 'sobra', dif: -dif };
  }

  // ── Carnes da semana (mesmas fontes do _carnesBuscarSemana do Painel) ──────────────
  var _catCarnes = null;
  function catalogoCarnes() {
    if (_catCarnes) return Promise.resolve(_catCarnes);
    var ids = Object.keys(CARNES_ITEM_ID_RJ).map(function (k) { return CARNES_ITEM_ID_RJ[k]; }).join(',');
    return get('gn_catalogo?or=(item_id.in.(' + ids + '),origem_item_id.in.(' + ids + '))&select=id,item_id,origem_item_id,regiao', 'carnesCat').then(function (rows) {
      if (!rows) return null;
      var porItem = {}; Object.keys(CARNES_ITEM_ID_RJ).forEach(function (k) { porItem[CARNES_ITEM_ID_RJ[k]] = k; });
      var map = {};
      rows.forEach(function (r) { var base = r.regiao === 'SP' ? r.origem_item_id : r.item_id; if (porItem[base]) map[r.id] = porItem[base]; });
      _catCarnes = map;
      return map;
    });
  }

  // Carrega a semana `off` (0 = a atual, -1 = a passada) pras lojas pedidas (userKeys;
  // vazio = as 11). Tudo numa ida só, como o Painel faz.
  function carregar(opts) {
    opts = opts || {};
    var agora = opts.agora ? new Date(opts.agora) : new Date();
    var off = opts.off || 0;
    var iniISO = segunda(off, agora), fimISO = isoMais(iniISO, 6);
    var ini = new Date(iniISO + 'T12:00:00');
    var diasISO = [0, 1, 2, 3, 4, 5, 6].map(function (n) { return isoMais(iniISO, n); });
    var lojas = lojasRede();
    if (opts.lojas && opts.lojas.length) { var q = opts.lojas.map(norm); lojas = lojas.filter(function (l) { return q.indexOf(l.k) >= 0; }); }
    var ks = lojas.map(function (l) { return l.k; });
    var slugs = lojas.map(function (l) { return l.slug; }).filter(Boolean);
    // Chopp: as janelas são sempre a semana fechada (segunda passada → segunda) e o
    // acompanhamento (segunda → quinta) contadas a partir da segunda ATUAL.
    var W = segunda(0, agora), W1 = isoMais(W, -7), QUI = isoMais(W, 3);
    var dIni = isoMais(iniISO, -7), dIni21 = isoMais(iniISO, -21);
    return Promise.all([
      get('checklist_carnes?semana_inicio=gte.' + iniISO + '&semana_inicio=lte.' + fimISO + '&select=loja,semana_inicio,carnes,updated_at&order=updated_at.desc', 'carnes'),
      get('gn_vendidos_diario?data=gte.' + (W1 < iniISO ? W1 : iniISO) + '&data=lte.' + isoMais(fimISO, 7) + '&select=loja,data,totais,itens', 'vendidos'),
      get('gn_caixa_fechamento?data=gte.' + iniISO + '&data=lte.' + fimISO + '&select=loja,data,rodizio_inteira,rodizio_meia', 'rodizio'),
      get('gn_vendidos_itens?select=id,grupo,nome,item_estoque,ativo,ordem&order=grupo.asc,ordem.asc,nome.asc', 'cadastro'),
      slugs.length ? get('gn_barris_semanal_contagem?loja_slug=in.(' + slugs.join(',') + ')&semana_inicio=in.(' + W1 + ',' + W + ',' + QUI + ')&tipo=in.(CLARO,VINHO)&select=loja_slug,semana_inicio,tipo,status,criado_em', 'choppCont') : Promise.resolve([]),
      slugs.length ? get('gn_barris_validade?loja_slug=in.(' + slugs.join(',') + ')&criado_em=gte.' + W1 + 'T00:00:00-03:00&select=loja_slug,catalogo_id,produto,criado_em', 'choppEnt') : Promise.resolve([]),
      catalogoCarnes(),
    ]).then(function (r) {
      var rows = r[0], vendAll = r[1], rodRows = r[2], cad = r[3], choppCont = r[4], choppEnt = r[5], cat = r[6];
      var erros = [];
      if (!rows) erros.push('carnes');
      if (!vendAll) erros.push('vendidos');
      var vendSemana = (vendAll || []).filter(function (v) { var d = String(v.data).slice(0, 10); return d >= iniISO && d <= fimISO; });
      var recebP = cat && Object.keys(cat).length
        ? get('gn_provisoes?catalogo_id=in.(' + Object.keys(cat).join(',') + ')&data_entrega=gte.' + dIni + '&data_entrega=lte.' + fimISO + '&select=loja_slug,catalogo_id,gn_recebimentos!inner(qtd_recebida,validado_em)', 'carnesRec')
        : Promise.resolve([]);
      return Promise.all([recebP, cocaSemana(ini, cad || [], vendSemana, diasISO)]).then(function (r2) {
        var recebHora = r2[0] || [], coca = r2[1];
        if (coca.falhou) erros.push('coca');
        var horaCont = (window.gnCarnesDiario && window.gnCarnesDiario.HORA_CONTAGEM) || 11;
        var porLoja = {};
        lojas.forEach(function (l) {
          porLoja[l.k] = { k: l.k, nome: l.nome, slug: l.slug, carnesRow: null, vendDia: [null, null, null, null, null, null, null],
            rodDia: [null, null, null, null, null, null, null], antesDaContagem: {}, foraDoBuffet: (window.GN_BUFFET_FORA || []).indexOf(l.k) >= 0 };
        });
        (rodRows || []).forEach(function (x) {
          var p = porLoja[norm(x.loja)]; if (!p || p.foraDoBuffet) return;
          var i = diasISO.indexOf(String(x.data).slice(0, 10));
          if (i >= 0 && (x.rodizio_inteira != null || x.rodizio_meia != null))
            p.rodDia[i] = (p.rodDia[i] || 0) + Math.max(0, parseInt(x.rodizio_inteira, 10) || 0) + Math.max(0, parseInt(x.rodizio_meia, 10) || 0);
        });
        recebHora.forEach(function (pv) {
          var k = lojaDeSlug(pv.loja_slug), corte = cat && cat[pv.catalogo_id], p = porLoja[k];
          if (!p || !corte) return;
          (Array.isArray(pv.gn_recebimentos) ? pv.gn_recebimentos : [pv.gn_recebimentos]).forEach(function (rc) {
            if (!rc || !rc.validado_em) return;
            var dt = new Date(rc.validado_em);
            if (dt.getHours() >= horaCont) return;
            var di = diasISO.indexOf(iso(dt)); if (di < 0) return;
            (p.antesDaContagem[corte] = p.antesDaContagem[corte] || [0, 0, 0, 0, 0, 0, 0])[di] += parseFloat(rc.qtd_recebida) || 0;
          });
        });
        vendSemana.forEach(function (x) { var p = porLoja[norm(x.loja)]; if (!p) return; var i = diasISO.indexOf(String(x.data).slice(0, 10)); if (i >= 0) p.vendDia[i] = x.totais || {}; });
        (rows || []).forEach(function (x) {
          var p = porLoja[norm(x.loja)]; if (!p || !x.carnes) return;
          // A da segunda ganha; no empate, a mais recente (a consulta vem por updated_at desc).
          if (!p.carnesRow || (x.semana_inicio === iniISO && p.carnesRow.semana_inicio !== iniISO)) p.carnesRow = x;
        });
        var G = window.gnCarnesDiario, C = window.gnChoppControle;
        var inicioVend = (window.gnVendidos && window.gnVendidos.INICIO) || '2026-11-23';
        var cocaNomes = {}; (cad || []).forEach(function (c) { if (c.item_estoque && !cocaNomes[c.item_estoque]) cocaNomes[c.item_estoque] = String(c.nome || '').replace(/^Coca-Cola\s*/i, ''); });
        Object.keys(porLoja).forEach(function (k) {
          var p = porLoja[k], car = (p.carnesRow || {}).carnes;
          p.carnes = {};
          CARNES.forEach(function (c) {
            if (!G || !car) { p.carnes[c.key] = null; return; }
            var vendKg = p.vendDia.map(function (t, i) {
              if (!t) return null;
              var kg = Number(t[c.key]) || 0;
              if (c.key === 'carne_sol' && !p.foraDoBuffet && p.rodDia[i]) kg += p.rodDia[i] * CARNE_SOL_POR_RODIZIO_KG;
              return kg;
            });
            var lista = G.dias(c.key, car[c.key], vendKg, p.antesDaContagem[c.key]);
            p.carnes[c.key] = { dias: lista, resumo: G.resumo(lista), entradas: G.entradas(car[c.key]), contagens: G.contagens(car[c.key]), vendKg: vendKg };
          });
          p.chopp = C ? C.janelasLoja({ cont: (choppCont || []).filter(function (x) { return x.loja_slug === p.slug; }),
            ent: (choppEnt || []).filter(function (x) { return x.loja_slug === p.slug; }), tipoDe: tipoBarril,
            vend: (vendAll || []).filter(function (v) { return norm(v.loja) === k; }), W1: W1, W: W, QUI: QUI, inicio: inicioVend }) : null;
          p.coca = (coca.porLoja || {})[k] || {};
          delete p.carnesRow;
        });
        return { iniISO: iniISO, fimISO: fimISO, diasISO: diasISO, off: off, hojeIdx: iniISO === W ? (agora.getDay() + 6) % 7 : 99, W: W, W1: W1, QUI: QUI, porLoja: porLoja, cocaNomes: cocaNomes, erros: erros,
                 vigente: iniISO === W };
      });
    });
  }

  // ── Um quadradinho por loja × item ──────────────────────────────────────────────────
  // Devolve { status: ok|falta|sobra|sem_dado|futuro, valor (com sinal, na unidade), un, texto }.
  // Carnes: a semana inteira (soma das faltas e das sobras fora da margem; os pares que se
  // compensam — contagem um dia atrasada — não contam). Chopp: a janela fechada na semana
  // passada; na atual, o acompanhamento segunda → quinta. Coca: só fecha com a segunda
  // contagem (semana passada); na atual mostra o que deveria ter hoje.
  function celula(res, p, item) {
    if (!p) return { status: 'sem_dado', texto: '—' };
    if (item.tipo === 'carne') {
      var c = p.carnes[item.key];
      if (!c) return { status: 'sem_dado', texto: '—', motivo: 'sem contagem de carnes na semana' };
      // O número grande é o SALDO DA SEMANA: a soma das diferenças dos dias. Cada dia compara
      // com a contagem anterior, então a soma "telescopa" — sobra a última contagem contra a
      // primeira, com o que chegou e o vendido no meio (26/11, pedido do dono: "quando tem dois
      // números no mesmo item, − e +, como interpretar?"). Falta num dia e sobra no outro é,
      // quase sempre, carne contada um dia depois; os dias aparecem embaixo, pequenos.
      var sd = saldoSemana(c);
      if (!sd.dias) return { status: 'sem_dado', texto: '—', motivo: 'sem contagem ou vendidos pra comparar' };
      var mg = (window.gnCarnesDiario || {}).MARGEM_KG || 1;
      var dias = sd.falta && sd.sobra ? 'dias ' + '−' + fmt(sd.falta, 1) + ' · +' + fmt(sd.sobra, 1) : null;
      if (Math.abs(sd.saldo) <= mg) return { status: 'ok', valor: sd.saldo, un: 'kg', texto: '✓', texto2: dias, saldo: sd.saldo };
      return { status: sd.saldo < 0 ? 'falta' : 'sobra', valor: sd.saldo, un: 'kg', texto: (sd.saldo < 0 ? '−' : '+') + fmt(Math.abs(sd.saldo), 1) + ' kg', texto2: dias, saldo: sd.saldo };
    }
    if (item.tipo === 'chopp') {
      var j = p.chopp ? (res.vigente ? p.chopp.acomp : p.chopp.fechada) : null;
      if (!j || j.semContagem || j.antesDosVendidos) return { status: 'sem_dado', texto: '—', motivo: j && j.semContagem ? 'sem a contagem de barris de ' + br(j.semContagem) : 'sem dado' };
      var x = j[item.key];
      if (!x || x.status === 'parcial') return { status: 'sem_dado', texto: '—', motivo: 'vendidos incompletos' };
      if (x.status === 'sem_consumo') return { status: 'ok', valor: 0, un: 'barril', texto: '✓' };
      if (x.status === 'ok') return { status: 'ok', valor: 0, un: 'barril', texto: '✓' };
      // Em CANECAS (26/11, pedido do dono: "o número do barril é confuso, tem como
      // transformar em caneca?"): a diferença em barris × 128 canecas da meta.
      // perda: usou mais barril do que as vendas explicam = falta de chopp.
      var can = Math.round(Math.abs(x.dif) * CANECAS());
      return x.status === 'perda' ? { status: 'falta', valor: -can, un: 'caneca', texto: '−' + fmt(can, 0) + ' can.' }
                                  : { status: 'sobra', valor: can, un: 'caneca', texto: '+' + fmt(can, 0) + ' can.' };
    }
    if (item.tipo === 'coca') {
      var bases = Object.keys(p.coca || {});
      if (!bases.length) return { status: 'sem_dado', texto: '—', motivo: 'sem a contagem de segunda' };
      if (res.vigente) {
        var tem = bases.some(function (b) { return p.coca[b].ini !== null; });
        return { status: 'futuro', texto: tem ? 'em curso' : '—', motivo: 'fecha na segunda, com a contagem nova' };
      }
      var falta = 0, sobra = 0, ok = 0;
      bases.forEach(function (b) { var s = cocaStatus(p.coca[b]); if (s.status === 'falta') falta += s.dif; else if (s.status === 'sobra') sobra += s.dif; else if (s.status === 'ok') ok++; });
      if (falta) return { status: 'falta', valor: falta, un: 'un', texto: '−' + fmt(Math.abs(falta), 0) + ' un' };
      if (sobra) return { status: 'sobra', valor: sobra, un: 'un', texto: '+' + fmt(sobra, 0) + ' un' };
      if (ok) return { status: 'ok', valor: 0, un: 'un', texto: '✓' };
      return { status: 'sem_dado', texto: '—', motivo: 'sem as duas contagens ou vendidos incompletos' };
    }
    return { status: 'sem_dado', texto: '—' };
  }
  function CANECAS() { return (window.gnChoppControle || {}).CANECAS_META || 128; }
  // Soma das diferenças de cada dia da semana (kg): o saldo da semana. Também devolve quanto
  // foi falta e quanto foi sobra nos dias (fora da margem), pra mostrar quando oscilou.
  function saldoSemana(c) {
    var r = { saldo: 0, falta: 0, sobra: 0, dias: 0 };
    (c.dias || []).forEach(function (x) {
      if (x.dif === null || x.dif === undefined) return;
      r.dias++; r.saldo += x.dif;
      if (x.status === 'falta') r.falta += Math.abs(x.dif); else if (x.status === 'sobra') r.sobra += x.dif;
    });
    r.saldo = Math.round(r.saldo * 1000) / 1000;
    return r;
  }
  var ITENS = CARNES.map(function (c) { return { tipo: 'carne', key: c.key, label: c.label, curto: c.curto }; }).concat([
    { tipo: 'chopp', key: 'CLARO', label: 'Chopp claro', curto: 'Chopp' },
    { tipo: 'chopp', key: 'VINHO', label: 'Chopp de vinho', curto: 'Vinho' },
    { tipo: 'coca', key: 'coca', label: 'Coca-Cola', curto: 'Coca' },
  ]);
  function fmt(v, casas) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
  function br(s) { var p = String(s).split('-'); return p[2] + '/' + p[1]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }


  // ── Tela: grade "num olhar" + detalhe do quadradinho tocado ─────────────────────────
  // render(el, { lojas: [userKey] (vazio = as 11), titulo }) — só leitura, nos dois apps.
  var COR = {
    ok:       { bg: 'rgba(22,163,74,.14)',  fg: 'var(--txt-green,#15803d)' },
    falta:    { bg: 'rgba(220,38,38,.15)',  fg: 'var(--txt-red,#b91c1c)' },
    sobra:    { bg: 'rgba(37,99,235,.14)',  fg: 'var(--txt-blue,#1d4ed8)' },
    sem_dado: { bg: 'rgba(100,116,139,.08)', fg: 'var(--t3,#64748b)' },
    futuro:   { bg: 'rgba(100,116,139,.05)', fg: 'var(--t3,#64748b)' },
  };
  var _estado = new WeakMap();
  function render(el, opts) {
    if (!el) return Promise.resolve();
    var st = _estado.get(el) || { off: 0, sel: null };
    st.opts = opts || st.opts || {};
    _estado.set(el, st);
    el.innerHTML = '<div style="padding:16px;text-align:center;font-size:12px;color:var(--t3,#64748b)">Carregando o acompanhamento…</div>';
    return carregar({ off: st.off, lojas: st.opts.lojas }).then(function (res) { st.res = res; desenhar(el); return res; })
      .catch(function () { el.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--t3,#64748b)">Não deu pra carregar agora. Tente de novo em instantes.</div>'; });
  }
  function desenhar(el) {
    var st = _estado.get(el), res = st.res, so1 = Object.keys(res.porLoja).length === 1;
    var ks = Object.keys(res.porLoja).sort(function (a, b) { return res.porLoja[a].nome.localeCompare(res.porLoja[b].nome); });
    var th = 'padding:5px 3px;font-size:9.5px;font-weight:800;color:var(--t3,#64748b);text-align:center;white-space:nowrap';
    var cab = '<tr><th style="' + th + ';text-align:left;position:sticky;left:0;background:var(--s2,#fff);z-index:1">' + (so1 ? '' : 'Loja') + '</th>' +
      ITENS.map(function (it) { return '<th style="' + th + '">' + esc(it.curto) + '</th>'; }).join('') + '</tr>';
    var cont = { falta: 0, sobra: 0, ok: 0 };
    var linhas = ks.map(function (k) {
      var p = res.porLoja[k];
      return '<tr><td style="padding:4px 6px 4px 2px;font-size:11px;font-weight:800;color:var(--t1,#111);white-space:nowrap;position:sticky;left:0;background:var(--s2,#fff);z-index:1">' + esc(p.nome) + '</td>' +
        ITENS.map(function (it, i) {
          var c = celula(res, p, it), cor = COR[c.status] || COR.sem_dado;
          if (cont[c.status] != null) cont[c.status]++;
          var sel = st.sel && st.sel.k === k && st.sel.i === i;
          return '<td style="padding:2px"><button class="acomp-cel" data-k="' + esc(k) + '" data-i="' + i + '" data-status="' + c.status + '" title="' + esc(c.motivo || '') + '" ' +
            'style="width:100%;min-width:52px;border:' + (sel ? '2px solid var(--t1,#111)' : '1px solid rgba(0,0,0,.06)') + ';border-radius:8px;padding:7px 2px;background:' + cor.bg + ';color:' + cor.fg + ';font-size:11px;font-weight:800;font-family:inherit;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums;line-height:1.2">' + esc(c.texto) + (c.texto2 ? '<div class="acomp-t2" style="font-size:9px;font-weight:700;color:var(--t2,#334155)">' + esc(c.texto2) + '</div>' : '') + '</button></td>';
        }).join('') + '</tr>';
    }).join('');
    var periodo = res.vigente ? 'Semana atual · ' + br(res.iniISO) + ' a hoje (em curso)' : 'Semana fechada · ' + br(res.iniISO) + ' a ' + br(res.fimISO);
    var resumoTxt = cont.falta || cont.sobra
      ? '<b style="color:' + COR.falta.fg + '">' + cont.falta + ' com falta</b> · <b style="color:' + COR.sobra.fg + '">' + cont.sobra + ' com sobra</b> · ' + cont.ok + ' batendo'
      : (cont.ok ? '<b style="color:' + COR.ok.fg + '">tudo batendo</b>' : 'sem dado pra comparar ainda');
    var bt = function (off, rot) { var on = st.off === off; return '<button class="acomp-per" data-off="' + off + '" style="flex:1;border:1px solid ' + (on ? 'var(--t1,#111)' : 'rgba(0,0,0,.12)') + ';background:' + (on ? 'var(--t1,#111)' : 'transparent') + ';color:' + (on ? 'var(--s2,#fff)' : 'var(--t2,#334155)') + ';border-radius:9px;padding:7px;font-size:11.5px;font-weight:800;font-family:inherit;cursor:pointer">' + rot + '</button>'; };
    el.innerHTML =
      '<div class="acomp" style="background:var(--s2,#fff);border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:12px">' +
        '<div style="font-size:14px;font-weight:800;color:var(--t1,#111)">' + esc(st.opts.titulo || '📊 Acompanhamento diário — carnes e bebidas') + '</div>' +
        '<div style="font-size:10.5px;color:var(--t3,#64748b);margin:2px 0 8px;line-height:1.45">Só consulta. Contado × o que deveria ter (estoque inicial + entradas − vendidos). Toque num quadradinho pra ver o dia a dia.</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:8px">' + bt(0, 'Semana atual') + bt(-1, 'Semana passada') + '</div>' +
        '<div class="acomp-rel" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' +
          '<button class="acomp-rel-wpp" style="background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.3);border-radius:6px;padding:5px 10px;color:var(--txt-green,#15803d);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">📲 WhatsApp</button>' +
          '<button class="acomp-rel-pdf" style="background:rgba(192,57,43,.12);border:1px solid rgba(192,57,43,.3);border-radius:6px;padding:5px 10px;color:var(--txt-red,#b91c1c);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">📄 PDF</button>' +
          '<button class="acomp-rel-pdfwpp" title="Enviar PDF pelo WhatsApp" style="background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.3);border-radius:6px;padding:5px 10px;color:var(--txt-green,#15803d);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">📄📲 PDF no Whats</button>' +
        '</div>' +
        (so1 ? '' : '<details class="acomp-rel-filtro" style="margin-bottom:8px"' + ((st.filtro || []).length ? ' open' : '') + '><summary style="font-size:10.5px;color:var(--t3,#64748b);font-weight:700;cursor:pointer">Relatório de: ' + ((st.filtro || []).length ? esc((st.filtro || []).map(function (k) { return (res.porLoja[k] || {}).nome || k; }).join(', ')) : 'todas as lojas') + ' (marque 1+ pro individual)</summary>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px 14px;padding:8px 10px;margin-top:4px;border:1px solid rgba(0,0,0,.08);border-radius:8px">' +
          ks.map(function (k) { return '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--t2,#334155);cursor:pointer"><input type="checkbox" class="acomp-rel-loja" value="' + esc(k) + '"' + ((st.filtro || []).indexOf(k) >= 0 ? ' checked' : '') + '>' + esc(res.porLoja[k].nome) + '</label>'; }).join('') +
          '</div></details>') +
        '<div style="font-size:11px;color:var(--t2,#334155);margin-bottom:6px"><b>' + periodo + '</b> · <span class="acomp-resumo">' + resumoTxt + '</span></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:10px;color:var(--t3,#64748b);margin-bottom:6px">' +
          ['ok:✓ bate', 'falta:− falta', 'sobra:+ sobra', 'sem_dado:— sem dado'].map(function (x) { var q = x.split(':'); return '<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + COR[q[0]].bg + ';border:1px solid rgba(0,0,0,.1);vertical-align:-1px;margin-right:3px"></span>' + q[1] + '</span>'; }).join('') + '</div>' +
        (res.erros.length ? '<div style="font-size:10.5px;color:' + COR.falta.fg + ';margin-bottom:6px">Parte dos dados não carregou (' + esc(res.erros.join(', ')) + ') — o que falta aparece como "sem dado".</div>' : '') +
        (so1 ? gradeUmaLoja(res, ks[0], st) : '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table style="border-collapse:collapse;width:100%">' + cab + linhas + '</table></div>') +
        '<div class="acomp-detalhe" style="margin-top:10px;max-width:100%;overflow-x:auto">' + (st.sel ? detalhe(res, res.porLoja[st.sel.k], ITENS[st.sel.i]) : '') + '</div>' +
        '<div style="font-size:9.5px;color:var(--t3,#64748b);margin-top:8px;line-height:1.5">Carnes: o número grande é o saldo da semana (a soma das diferenças dos dias), com margem de ' + ((window.gnCarnesDiario || {}).MARGEM_KG || 1) + ' kg e entrada já sem a perda da salga; "dias −x · +y" embaixo = faltou num dia e sobrou no outro, quase sempre carne contada um dia depois. Chopp em canecas: canecas que os barris usados renderiam (' + CANECAS() + ' por barril) × canecas vendidas, tolerância de ¼ de barril (' + Math.round(CANECAS() / 4) + ' canecas). Coca: fecha na segunda, com a contagem nova (até 6 un ou 5% é "bate"). Os mesmos números das abas Carnes, Barris e Vendidos do Painel.</div>' +
      '</div>';
    var q = function (sel, fn) { var x = el.querySelector(sel); if (x) x.onclick = function () { fn(el); }; };
    q('.acomp-rel-wpp', relWpp); q('.acomp-rel-pdf', relPdf); q('.acomp-rel-pdfwpp', relPdfWpp);
    el.querySelectorAll('.acomp-rel-loja').forEach(function (c) { c.onchange = function () {
      st.filtro = (st.filtro || []).filter(function (k) { return k !== c.value; }); if (c.checked) st.filtro.push(c.value);
      var sm = el.querySelector('.acomp-rel-filtro summary');
      if (sm) sm.textContent = 'Relatório de: ' + (st.filtro.length ? st.filtro.map(function (k) { return (res.porLoja[k] || {}).nome || k; }).join(', ') : 'todas as lojas') + ' (marque 1+ pro individual)';
    }; });
    el.querySelectorAll('.acomp-per').forEach(function (b) { b.onclick = function () { st.off = +b.dataset.off; st.sel = null; render(el); }; });
    el.querySelectorAll('.acomp-cel').forEach(function (b) { b.onclick = function () {
      var k = b.dataset.k, i = +b.dataset.i;
      st.sel = st.sel && st.sel.k === k && st.sel.i === i ? null : { k: k, i: i };
      desenhar(el);
      var d = el.querySelector('.acomp-detalhe'); if (d && st.sel && d.scrollIntoView) try { d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
    }; });
  }

  // Uma loja só (Home do app Lojas): os 7 itens em quadrados que cabem na tela do celular,
  // sem rolar de lado — o "num olhar" na tela pequena.
  function gradeUmaLoja(res, k, st) {
    var p = res.porLoja[k];
    return '<div class="acomp-uma" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px">' + ITENS.map(function (it, i) {
      var c = celula(res, p, it), cor = COR[c.status] || COR.sem_dado, sel = st.sel && st.sel.k === k && st.sel.i === i;
      return '<button class="acomp-cel" data-k="' + esc(k) + '" data-i="' + i + '" data-status="' + c.status + '" title="' + esc(c.motivo || '') + '" ' +
        'style="min-width:0;border:' + (sel ? '2px solid var(--t1,#111)' : '1px solid rgba(0,0,0,.06)') + ';border-radius:10px;padding:7px 3px;background:' + cor.bg + ';color:' + cor.fg + ';font-family:inherit;cursor:pointer;line-height:1.25;font-variant-numeric:tabular-nums">' +
        '<div style="font-size:9.5px;font-weight:700;color:var(--t2,#334155);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(it.curto) + '</div>' +
        '<div style="font-size:12px;font-weight:800;white-space:nowrap">' + esc(c.texto) + '</div>' +
        (c.texto2 ? '<div class="acomp-t2" style="font-size:9px;font-weight:700;color:var(--t2,#334155)">' + esc(c.texto2) + '</div>' : '') + '</button>';
    }).join('') + '</div>';
  }

  // Dia a dia de um quadradinho: estoque inicial, entradas, saídas, teórico, físico, diferença.
  function detalhe(res, p, it) {
    if (!p || !it) return '';
    var tdS = 'padding:4px 5px;border-top:1px solid rgba(0,0,0,.06);font-size:11px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap';
    var thS = 'padding:4px 5px;font-size:9.5px;font-weight:800;color:var(--t3,#64748b);text-align:right;white-space:nowrap';
    var cab = '<div style="font-size:12.5px;font-weight:800;color:var(--t1,#111);margin-bottom:4px">' + esc(p.nome) + ' · ' + esc(it.label) + '</div>';
    var corDe = function (st) { return (COR[st] || COR.sem_dado).fg; };
    if (it.tipo === 'carne') {
      var c = p.carnes[it.key];
      if (!c) return cab + '<div style="font-size:11.5px;color:var(--t3,#64748b)">Sem contagem de carnes nesta semana.</div>';
      var kg = function (v) { return v === null || v === undefined ? '—' : fmt(v, 1); };
      var linhas = c.dias.map(function (x) {
        // Semana em curso: o dia que ainda não chegou fica em branco (não é "sem dado").
        if (x.i > res.hojeIdx) return '<tr data-status="futuro"><td style="' + tdS + ';text-align:left;font-weight:800;color:var(--t3,#64748b)">' + esc(x.label) + '</td><td colspan="6" style="' + tdS + ';text-align:center;color:var(--t3,#64748b)">·</td></tr>';
        var difTxt = x.dif === null ? (x.status === 'sem_contagem' ? 'sem contagem' : esc(x.motivo || '—')) : (x.status === 'ok' ? '✓ ' : '') + (x.dif > 0 ? '+' : x.dif < 0 ? '−' : '') + fmt(Math.abs(x.dif), 1) + (x.compensa ? ' ↔' : '');
        return '<tr data-status="' + x.status + '"><td style="' + tdS + ';text-align:left;font-weight:800">' + esc(x.label) + '</td>' +
          '<td style="' + tdS + '">' + kg(x.baseValor) + (x.base !== null && x.base !== x.i - 1 ? '<span style="font-size:9px;color:var(--t3,#64748b)"> (' + esc((window.gnCarnesDiario.DIAS_LABEL || [])[x.base]) + ')</span>' : '') + '</td>' +
          '<td style="' + tdS + ';color:var(--txt-green,#15803d)">' + (x.entLiq ? '+' + kg(x.entLiq) : '—') + '</td>' +
          '<td style="' + tdS + '">' + (x.esperado === null && !x.vend ? '—' : '−' + kg(x.vend)) + '</td>' +
          '<td style="' + tdS + ';font-weight:800">' + kg(x.esperado) + '</td>' +
          '<td style="' + tdS + ';font-weight:800">' + kg(x.contado) + '</td>' +
          '<td style="' + tdS + ';font-weight:800;color:' + corDe(x.compensa ? 'sem_dado' : x.status) + '">' + difTxt + '</td></tr>';
      }).join('');
      return cab + '<div style="font-size:10.5px;color:var(--t3,#64748b);margin-bottom:4px">Estoque inicial (contagem de segunda): <b>' + kg(c.contagens[0]) + ' kg</b>. Cada linha: contagem anterior + o que chegou − vendidos = o que deveria ter; contado; diferença.</div>' +
        (function () { var sd = saldoSemana(c); return sd.dias ? '<div class="acomp-saldo" style="font-size:12px;font-weight:800;color:' + corDe(Math.abs(sd.saldo) <= ((window.gnCarnesDiario || {}).MARGEM_KG || 1) ? 'ok' : sd.saldo < 0 ? 'falta' : 'sobra') + ';margin-bottom:6px">Saldo da semana: ' + (sd.saldo > 0 ? '+' : sd.saldo < 0 ? '−' : '') + fmt(Math.abs(sd.saldo), 1) + ' kg <span style="font-weight:400;color:var(--t3,#64748b);font-size:10.5px">(a soma da coluna Diferença' + (sd.falta && sd.sobra ? ' — falta num dia e sobra no outro costuma ser carne contada um dia depois' : '') + ')</span></div>' : ''; })() +
        '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:430px"><tr><th style="' + thS + ';text-align:left">Dia</th><th style="' + thS + '">Anterior</th><th style="' + thS + '">Entrou</th><th style="' + thS + '">Vendido</th><th style="' + thS + '">Teórico</th><th style="' + thS + '">Físico</th><th style="' + thS + '">Diferença</th></tr>' + linhas + '</table></div>' +
        '<div style="font-size:9.5px;color:var(--t3,#64748b);margin-top:4px">"Seg seg." é o fechamento: a contagem da segunda seguinte. ↔ falta e sobra do mesmo tamanho em dias seguidos: contagem atrasada, não é perda.</div>';
    }
    if (it.tipo === 'chopp') {
      var jan = function (j, rot, fimIni) {
        if (!j) return '';
        if (j.semContagem) return '<div style="font-size:11px;color:var(--t3,#64748b);margin-bottom:6px"><b>' + rot + ':</b> sem a contagem de barris de ' + br(j.semContagem) + '.</div>';
        if (j.antesDosVendidos) return '<div style="font-size:11px;color:var(--t3,#64748b);margin-bottom:6px"><b>' + rot + ':</b> antes dos vendidos (lançados desde 23/11).</div>';
        var x = j[it.key]; if (!x) return '';
        // Em canecas, dia a dia, igual à Coca (26/11/2026) — o mesmo detalhe do Painel › Barris
        // e do app Lojas (gnChoppControle.detalheHtml).
        if (!window.gnChoppControle.detalheHtml) return '';
        return '<div style="font-size:11px;font-weight:800;color:var(--t2,#334155);margin:2px 0">' + rot + '</div>' +
          '<div style="margin-bottom:8px">' + window.gnChoppControle.detalheHtml(x, { rotIni: 'Contagem de segunda (' + br(fimIni[0]) + ')', rotFim: fimIni[1] }) + '</div>';
      };
      var ch = p.chopp || {};
      return cab + jan(ch.fechada, 'Semana fechada ' + br(res.W1) + ' → ' + br(res.W), [res.W1, 'Contagem da segunda seguinte (' + br(res.W) + ')']) + jan(ch.acomp, 'Acompanhamento ' + br(res.W) + ' → ' + br(res.QUI) + ' (indicativo)', [res.W, 'Contagem de quinta (' + br(res.QUI) + ')']) +
        '<div style="font-size:9.5px;color:var(--t3,#64748b)">Cada barril vale ' + CANECAS() + ' canecas (meta). Barril pela contagem: cheio 1 · na linha cheio 1 · metade ½ · abaixo da metade ¼ · vazio 0 — o barril pela metade na linha não vira falta.</div>';
    }
    if (it.tipo === 'coca') {
      var bases = Object.keys(p.coca || {});
      if (!bases.length) return cab + '<div style="font-size:11.5px;color:var(--t3,#64748b)">Sem a contagem de Coca de segunda (Pedido).</div>';
      var un = function (v) { return v === null || v === undefined ? '—' : fmt(v, 0); };
      if (res.vigente) {
        return cab + '<table style="border-collapse:collapse;width:100%"><tr><th style="' + thS + ';text-align:left">Item</th><th style="' + thS + '">Inicial</th><th style="' + thS + '">Entrou</th><th style="' + thS + '">Vendido</th><th style="' + thS + '">Deve ter hoje</th></tr>' +
          bases.map(function (b) { var x = p.coca[b];
            return '<tr><td style="' + tdS + ';text-align:left;font-weight:800">' + esc(res.cocaNomes[b] || b) + '</td><td style="' + tdS + '">' + un(x.ini) + '</td><td style="' + tdS + ';color:var(--txt-green,#15803d)">+' + un(x.entAgora || 0) + '</td><td style="' + tdS + '">−' + un(x.vendido || 0) + '</td><td style="' + tdS + ';font-weight:800">' + (x.ini === null ? '—' : un(x.ini + (x.entAgora || 0) - (x.vendido || 0))) + '</td></tr>'; }).join('') +
          '</table><div style="font-size:9.5px;color:var(--t3,#64748b);margin-top:4px">A diferença de verdade (saída × vendido) sai na segunda, com a contagem nova.</div>';
      }
      return cab + '<table style="border-collapse:collapse;width:100%;min-width:380px"><tr><th style="' + thS + ';text-align:left">Item</th><th style="' + thS + '">Inicial</th><th style="' + thS + '">Entrou</th><th style="' + thS + '">Final</th><th style="' + thS + '">Saiu</th><th style="' + thS + '">Vendido</th><th style="' + thS + '">Diferença</th></tr>' +
        bases.map(function (b) { var x = p.coca[b], s2 = cocaStatus(x);
          return '<tr data-status="' + s2.status + '"><td style="' + tdS + ';text-align:left;font-weight:800">' + esc(res.cocaNomes[b] || b) + '</td><td style="' + tdS + '">' + un(x.ini) + '</td><td style="' + tdS + ';color:var(--txt-green,#15803d)">+' + un(x.ent) + '</td><td style="' + tdS + '">' + un(x.fim) + '</td><td style="' + tdS + ';font-weight:800">' + un(x.saida) + '</td><td style="' + tdS + '">' + un(x.vendido) + '</td>' +
            '<td style="' + tdS + ';font-weight:800;color:' + corDe(s2.status) + '">' + (s2.dif === undefined ? esc(s2.motivo || '—') : (s2.status === 'ok' ? '✓ ' : '') + (s2.dif > 0 ? '+' : s2.dif < 0 ? '−' : '') + fmt(Math.abs(s2.dif), 0)) + '</td></tr>'; }).join('') + '</table>';
    }
    return '';
  }

  // ── Relatórios: WhatsApp e PDF, da rede ou das lojas marcadas (26/11/2026) ──────────
  // "Preciso que tenha opção de gerar relatórios desse controle, por WhatsApp, PDF, mesmo
  // esquema por loja e todos." Mesmo padrão das outras abas do Painel (Avarias, Sem 10%):
  // nenhuma loja marcada = rede; marcadas = só elas. Na Home da loja sai só a loja dela.
  // Os números são os dos quadradinhos (celula) — nada recalculado de outro jeito.
  function periodoTxt(res) { return res.vigente ? 'Semana atual · ' + br(res.iniISO) + ' a hoje (em curso)' : 'Semana fechada · ' + br(res.iniISO) + ' a ' + br(res.fimISO); }
  function textoCelula(c) { return String(c.texto || '').replace(/ can\.$/, ' canecas'); }
  function lojasDoRelatorio(res, filtro) {
    var ks = Object.keys(res.porLoja).sort(function (a, b) { return res.porLoja[a].nome.localeCompare(res.porLoja[b].nome); });
    var f = (filtro || []).filter(function (k) { return ks.indexOf(k) >= 0; });
    return f.length ? ks.filter(function (k) { return f.indexOf(k) >= 0; }) : ks;
  }
  function relatorio(res, filtro, wpp) {
    var ks = lojasDoRelatorio(res, filtro), b = function (t) { return wpp ? '*' + t + '*' : t; };
    var todas = Object.keys(res.porLoja).length, nomes = ks.map(function (k) { return res.porLoja[k].nome; });
    var alvo = ks.length === todas && todas > 1 ? 'Rede' : nomes.join(', ');
    var cont = { falta: 0, sobra: 0, ok: 0 };
    var blocos = ks.map(function (k) {
      var p = res.porLoja[k], fal = [], sob = [], okk = [], sem = [];
      ITENS.forEach(function (it) {
        var c = celula(res, p, it), extra = c.texto2 ? ' (' + c.texto2 + ')' : '';
        if (c.status === 'falta') { cont.falta++; fal.push(it.label + ': ' + textoCelula(c) + extra); }
        else if (c.status === 'sobra') { cont.sobra++; sob.push(it.label + ': ' + textoCelula(c) + extra); }
        else if (c.status === 'ok') { cont.ok++; okk.push(it.label + (c.texto2 ? ' (' + c.texto2 + ')' : '')); }
        else sem.push(it.label + (c.status === 'futuro' ? ' (em curso)' : c.motivo ? ' (' + c.motivo + ')' : ''));
      });
      var t = '\n' + (wpp ? '🏪 ' : '') + b(p.nome) + '\n';
      fal.forEach(function (x) { t += '  ' + (wpp ? '🔴 ' : 'FALTA · ') + x + '\n'; });
      sob.forEach(function (x) { t += '  ' + (wpp ? '🔵 ' : 'SOBRA · ') + x + '\n'; });
      if (okk.length) t += '  ' + (wpp ? '✅ ' : 'Bate: ') + (wpp ? 'Bate: ' : '') + okk.join(' · ') + '\n';
      if (sem.length) t += '  ' + (wpp ? '⚪ ' : '') + 'Sem dado: ' + sem.join(' · ') + '\n';
      return t;
    }).join('');
    var msg = (wpp ? '📊 ' : '') + b('ACOMPANHAMENTO — CARNES E BEBIDAS — ' + alvo.toUpperCase()) + '\n' + periodoTxt(res) + '\n' +
      '\nResumo: ' + cont.falta + ' com falta · ' + cont.sobra + ' com sobra · ' + cont.ok + ' batendo\n' + blocos +
      '\nComo ler: carnes = saldo da semana em kg (dias = faltou num dia e sobrou no outro, quase sempre contagem atrasada); chopp em canecas (' + CANECAS() + ' por barril); Coca em unidades, fecha na segunda.\n';
    return { msg: msg, titulo: 'Acompanhamento — ' + alvo, cont: cont, ks: ks };
  }
  // A grade pro papel: as mesmas cores da tela, em hexa (o PDF não tem as variáveis do tema).
  var COR_PDF = { ok: ['#dcfce7', '#166534'], falta: ['#fee2e2', '#b91c1c'], sobra: ['#dbeafe', '#1d4ed8'], sem_dado: ['#f3f4f6', '#6b7280'], futuro: ['#f3f4f6', '#6b7280'] };
  function gradePdf(res, ks) {
    var th = 'padding:5px 4px;font-size:8pt;font-weight:800;color:#555;text-align:center;border-bottom:2px solid #c8a14a';
    return '<div><table style="border-collapse:separate;border-spacing:3px;width:100%"><tr><th style="' + th + ';text-align:left">Loja</th>' +
      ITENS.map(function (it) { return '<th style="' + th + '">' + esc(it.curto) + '</th>'; }).join('') + '</tr>' +
      ks.map(function (k) { var p = res.porLoja[k];
        return '<tr><td style="padding:5px 4px;font-size:9pt;font-weight:800;white-space:nowrap">' + esc(p.nome) + '</td>' + ITENS.map(function (it) {
          var c = celula(res, p, it), cor = COR_PDF[c.status] || COR_PDF.sem_dado;
          return '<td style="padding:5px 3px;text-align:center;border-radius:5px;background:' + cor[0] + ';color:' + cor[1] + ';font-size:8.5pt;font-weight:800;white-space:nowrap">' + esc(c.texto) +
            (c.texto2 ? '<div style="font-size:7pt;font-weight:700;color:#555">' + esc(c.texto2) + '</div>' : '') + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</table></div>';
  }
  function opcoesPdf(res, filtro) {
    var r = relatorio(res, filtro, false);
    // Sem a 1ª linha (o título): o PDF já tem o título no topo.
    return { titulo: r.titulo, tituloDoc: r.titulo + ' — ' + br(res.iniISO), texto: r.msg.split('\n').slice(1).join('\n'),
      kpis: [{ label: 'Período', valor: res.vigente ? 'Semana atual' : 'Semana fechada', sub: periodoTxt(res).replace(/^Semana (atual|fechada) · /, '') },
             { label: 'Com falta', valor: String(r.cont.falta), sub: r.ks.length + ' loja' + (r.ks.length === 1 ? '' : 's') },
             { label: 'Com sobra', valor: String(r.cont.sobra), sub: r.cont.ok + ' batendo' }],
      visual: '<div class="pdf-vis">' + gradePdf(res, r.ks) + '</div>' };
  }
  function relWpp(el) { var st = _estado.get(el); if (!st || !st.res) return; window.open('https://wa.me/?text=' + encodeURIComponent(relatorio(st.res, st.filtro, true).msg), '_blank'); }
  function relPdf(el) { var st = _estado.get(el); if (!st || !st.res || !window.gnRelatorioPDF) return; window.gnRelatorioPDF(opcoesPdf(st.res, st.filtro)); }
  function relPdfWpp(el) {
    var st = _estado.get(el); if (!st || !st.res) return;
    if (window.gnRelatorioPDFCompartilhar) return window.gnRelatorioPDFCompartilhar(opcoesPdf(st.res, st.filtro));
    relPdf(el);
  }
  window.gnAcomp = { carregar: carregar, celula: celula, cocaSemana: cocaSemana, cocaStatus: cocaStatus, tipoBarril: tipoBarril,
    ITENS: ITENS, CARNES: CARNES, render: render, detalhe: detalhe, relatorio: relatorio, opcoesPdf: opcoesPdf, segunda: segunda, isoMais: isoMais, norm: norm, fmt: fmt, br: br, esc: esc, r1: r1 };
})();
