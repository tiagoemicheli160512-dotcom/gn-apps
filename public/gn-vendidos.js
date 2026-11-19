// ─── VENDIDOS DO DIA: CARNES (PELOS PRATOS), COCA-COLA E CHOPP ──────────────
// Pedido do dono (19/11/2026): "completar o controle das carnes e controlar Coca-Cola e
// chopp em vendas — a quantidade vendida por dia. Uma aba obrigatória pro lançamento do
// gerente ou do sub, até 11h do dia seguinte; depois trava. Nas carnes e no camarão, os
// pratos e a gramatura, pra fazer a multiplicação ao colocar a quantidade." Decidido com ele:
//   · a aba fica no Check-list, junto de Carnes (e este script cobra em qualquer app que a
//     gerência estiver usando, como o do desperdício);
//   · pratos e gramaturas num cadastro do Painel de Gestão (master), com sugestão das fichas;
//   · Coca e chopp por item vendido (lata, KS, chopp 350 ml…); o chopp vira litros;
//   · passou das 11h do dia seguinte sem lançar, trava; a supervisão libera.
//   · 11 lojas; Maglia fora (regra do projeto — e ela nem usa a aba Carnes).
//
// Regra do prazo: a venda do dia D se lança até 11h de D+1. A cobrança começa na virada
// (02h de D+1 — até lá o dia D ainda está operando); entre 02h e 11h dá pra adiar; às 11h
// o dia vira "em atraso" e os apps da gerência ficam fechados até a supervisão liberar.
// Depois do prazo o lançamento não muda mais — só um lançamento atrasado, com liberação.
//
// Falha aberto como as outras travas: sem rede ou erro, não bloqueia ninguém.
(function () {
  'use strict';

  var SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';

  var INICIO = '2026-11-23';          // primeiro dia de venda cobrado (dias antes nunca ficam em atraso)
  var JANELA_DIAS = 7;
  var PRAZO_H = 11;                   // até 11h do dia seguinte
  var VIRADA_H = 2;                   // antes das 02h o dia ainda está operando
  var CARGOS_COBRADOS = ['gerente', 'sub_gerente'];
  var CARGOS_LIBERAM = ['supervisor', 'mestre'];
  var LOJAS_FORA = ['MAGLIA'];
  var ADIA_MIN = 30;

  var CARNES = [
    { key: 'carne_sol',  label: 'Carne de Sol', icon: '🥩' },
    { key: 'picanha',    label: 'Picanha',      icon: '🥩' },
    { key: 'carne_seca', label: 'Carne Seca',   icon: '🥩' },
    { key: 'camarao',    label: 'Camarão',      icon: '🦐' },
  ];
  var GRUPOS = [
    { key: 'prato', label: '🍽️ Pratos com carne ou camarão' },
    { key: 'coca',  label: '🥤 Coca-Cola' },
    { key: 'chopp', label: '🍺 Chopp' },
  ];

  function _log(t, e) { try { window.gnLogError && window.gnLogError(t, e); } catch (_) {} }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function _iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function _dataDe(iso) { return new Date(iso + 'T12:00:00'); }
  function _addDias(iso, n) { var d = _dataDe(iso); d.setDate(d.getDate() + n); return _iso(d); }
  function _br(iso) { var p = String(iso).split('-'); return p[2] + '/' + p[1]; }
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function _brDia(iso) { return DIAS[_dataDe(iso).getDay()] + ' ' + _br(iso); }
  function _num(v, casas) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 }); }
  function _kg(v) { return _num(v, 1) + ' kg'; }

  // Prazo do dia D: 11h de D+1 (hora local).
  function prazoDe(dataISO) { var d = _dataDe(_addDias(dataISO, 1)); d.setHours(PRAZO_H, 0, 0, 0); return d; }
  function dentroDoPrazo(dataISO, agora) { return (agora || new Date()) < prazoDe(dataISO); }

  // Dias que a loja deve lançar e ainda não lançou: [{data, atrasado}].
  // lancados: linhas de gn_vendidos_diario (só `data` importa).
  function calcularPendencias(lojaKey, agora, lancados) {
    if (!lojaKey || LOJAS_FORA.indexOf(lojaKey) >= 0) return [];
    agora = agora || new Date();
    var feito = {};
    (lancados || []).forEach(function (r) { feito[String(r.data).slice(0, 10)] = true; });
    var hoje = _iso(agora), out = [];
    for (var k = JANELA_DIAS; k >= 1; k--) {
      var d = _addDias(hoje, -k);
      if (d < INICIO || feito[d]) continue;
      // O dia de ontem só passa a ser cobrado depois da virada (02h de hoje).
      if (k === 1 && agora.getHours() < VIRADA_H) continue;
      out.push({ data: d, atrasado: agora >= prazoDe(d) });
    }
    return out;
  }

  // A conta: quantidades × cadastro (foto gravada no lançamento).
  function calcTotais(itens) {
    var t = { carne_sol: 0, picanha: 0, carne_seca: 0, camarao: 0, coca_un: 0, chopp_l_claro: 0, chopp_l_vinho: 0 };
    Object.keys(itens || {}).forEach(function (id) {
      var it = itens[id] || {}, q = Number(it.q) || 0;
      if (!q) return;
      if (it.grupo === 'prato') {
        CARNES.forEach(function (c) { t[c.key] += q * (Number((it.gramas || {})[c.key]) || 0) / 1000; });
      } else if (it.grupo === 'coca') {
        t.coca_un += q;
      } else if (it.grupo === 'chopp') {
        var l = q * (Number(it.ml) || 0) / 1000;
        if (it.chopp_tipo === 'VINHO') t.chopp_l_vinho += l; else t.chopp_l_claro += l;
      }
    });
    Object.keys(t).forEach(function (k) { t[k] = Math.round(t[k] * 1000) / 1000; });
    return t;
  }
  // Foto do cadastro com as quantidades digitadas.
  function montarItens(cadastro, qtds) {
    var out = {};
    (cadastro || []).forEach(function (c) {
      var q = Number((qtds || {})[c.id]) || 0;
      out[c.id] = { q: q, nome: c.nome, grupo: c.grupo, gramas: c.gramas || {}, ml: c.ml == null ? null : Number(c.ml), chopp_tipo: c.chopp_tipo || null };
    });
    return out;
  }

  function _fetch(url, opt) {
    opt = opt || {};
    var h = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
    Object.keys(opt.headers || {}).forEach(function (k) { h[k] = opt.headers[k]; });
    return fetch(url, { method: opt.method || 'GET', headers: h, body: opt.body });
  }
  function _json(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }

  function buscarCadastro(todos) {
    return _fetch(SB_URL + '/rest/v1/gn_vendidos_itens?select=*' + (todos ? '' : '&ativo=eq.true') + '&order=grupo.asc,ordem.asc,nome.asc').then(_json);
  }
  function buscarLancamentos(lojaKey, desde, ate) {
    return _fetch(SB_URL + '/rest/v1/gn_vendidos_diario?select=*&data=gte.' + desde + '&data=lte.' + ate +
      (lojaKey ? '&loja=eq.' + encodeURIComponent(lojaKey) : '') + '&order=data.desc').then(_json);
  }
  function salvar(lojaKey, dataISO, itens, u, extra) {
    extra = extra || {};
    var corpo = { loja: lojaKey, data: dataISO, itens: itens, totais: calcTotais(itens),
                  lancado_por: u.nome, lancado_cargo: u.cargo || null, aparelho: extra.aparelho || null,
                  atrasado: !!extra.atrasado, liberado_por: extra.liberado_por || null,
                  atualizado_em: new Date().toISOString() };
    return _fetch(SB_URL + '/rest/v1/gn_vendidos_diario?on_conflict=loja,data', { method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify(corpo) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return corpo; });
  }

  // ── Sessão (mesma normalização do gn-escala-acesso / gn-desperdicio-acesso) ─
  var SESS_KEY = (document.currentScript && document.currentScript.getAttribute('data-sessao')) || 'gn_session_v1', TTL = 43200000;
  function _lerSessao() {
    try {
      var s = JSON.parse(localStorage.getItem(SESS_KEY) || 'null');
      if (!s || !s.ts || Date.now() - s.ts > TTL) return null;
      if (!s.id && s.user && s.user.id) s = { id: s.user.id, nome: s.user.nome, loja: s.user.loja, cargo: s.user.cargo, permissoes: s.user.permissoes || {}, ts: s.ts };
      return s.id ? s : null;
    } catch (_) { return null; }
  }
  function _cobrado(sess) {
    return !!sess && !!sess.loja && sess.loja !== 'GERAL' && LOJAS_FORA.indexOf(sess.loja) < 0 &&
           CARGOS_COBRADOS.indexOf(String(sess.cargo || '').toLowerCase()) >= 0;
  }

  var LIB_KEY = 'gn_vend_liberacao', ADIA_KEY = 'gn_vend_adiado';
  function _liberado(sess, hoje) {
    try { var l = JSON.parse(localStorage.getItem(LIB_KEY) || 'null'); return !!l && l.dia === hoje && String(l.uid) === String(sess.id); } catch (_) { return false; }
  }
  function _adiado() { try { return Number(localStorage.getItem(ADIA_KEY) || 0) > Date.now(); } catch (_) { return false; } }

  // Gerente/sub da própria loja, ou supervisor/mestre.
  function _verificar(nome, senha, lojaKey, cargosOk) {
    return _fetch(SB_URL + '/rest/v1/rpc/verificar_login', { method: 'POST',
      body: JSON.stringify({ p_nome: nome, p_senha: senha, p_app: 'vendidos-dia' }) })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        rows = rows || [];
        if (!rows.length) return { erro: 'Nome ou senha incorretos.' };
        var u = rows.find(function (x) {
          var c = String(x.cargo || '').toLowerCase();
          return (cargosOk.indexOf(c) >= 0 && x.loja === lojaKey) || (CARGOS_LIBERAM.indexOf(c) >= 0);
        });
        if (!u) return { erro: 'Quem lança é gerente ou sub-gerente da loja (ou supervisão). ' + _esc(rows[0].nome) + ' está como ' + _esc(rows[0].cargo || 'sem cargo') + '.' };
        return { u: u };
      });
  }

  // ── Tela ───────────────────────────────────────────────────────────────────
  var _overlay = null, _estado = null;
  var CSS_BTN = 'width:100%;border:none;border-radius:11px;padding:12px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit';
  var CSS_IN = 'width:100%;box-sizing:border-box;background:#0f1115;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;color:#e8eaed;font-size:13px;font-family:inherit';
  var CSS_BTN2 = CSS_BTN + ';background:rgba(255,255,255,.07);color:#e8eaed';

  function fechar() { if (_overlay) { _overlay.remove(); _overlay = null; document.body.style.overflow = ''; } }
  function _montar(html) {
    if (!_overlay) {
      _overlay = document.createElement('div');
      _overlay.id = 'gn-vend-overlay';
      _overlay.setAttribute('role', 'dialog');
      // Um degrau abaixo do desperdício: se os dois aparecem juntos, o do desperdício (prazo
      // das 02h) fica por cima.
      _overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483400;background:#0f1115;display:flex;align-items:flex-start;justify-content:center;padding:18px;overflow:auto;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
      document.body.appendChild(_overlay);
      document.body.style.overflow = 'hidden';
    }
    _overlay.innerHTML = '<div style="max-width:460px;width:100%;margin:auto;background:#171a21;border:1px solid rgba(255,255,255,.09);border-radius:20px;padding:22px 18px;color:#e8eaed">' + html + '</div>';
    _overlay.scrollTop = 0;
  }

  // Tela 1 (guardião): o que está pendente.
  function _telaLista() {
    var st = _estado, atrasado = st.pend.some(function (p) { return p.atrasado; });
    var linhas = st.pend.map(function (p, i) {
      return '<div style="border:1px solid ' + (p.atrasado ? 'rgba(248,113,113,.45)' : 'rgba(255,255,255,.12)') + ';border-radius:12px;padding:11px;margin-bottom:9px">' +
        '<div style="font-size:13px;font-weight:800">🧾 Vendidos de ' + _esc(_brDia(p.data)) + '</div>' +
        '<div style="font-size:11.5px;margin-top:2px;color:' + (p.atrasado ? '#f87171' : 'rgba(232,234,237,.6)') + '">' +
          (p.atrasado ? 'em atraso — o prazo era ' + _br(_addDias(p.data, 1)) + ' às ' + PRAZO_H + 'h' : 'prazo: hoje até ' + PRAZO_H + 'h') + '</div>' +
        (p.atrasado ? '' : '<button class="gn-vend-lancar" data-i="' + i + '" style="' + CSS_BTN + ';background:#facc15;color:#1a1d23;padding:10px;margin-top:9px">Lançar agora</button>') +
      '</div>';
    }).join('');
    _montar(
      '<div style="font-size:38px;line-height:1;margin-bottom:10px">🧾</div>' +
      '<div style="font-size:18px;font-weight:800;margin-bottom:4px">' + (atrasado ? 'Vendidos não lançados' : 'Lance os vendidos de ontem') + '</div>' +
      '<div style="font-size:12px;color:rgba(232,234,237,.55);margin-bottom:12px">' + _esc(st.sess.nome || '') + ' · ' + _esc(st.sess.loja || '') + '</div>' +
      '<div style="font-size:12.5px;line-height:1.55;color:rgba(232,234,237,.82);margin-bottom:14px">' +
        (atrasado
          ? 'Passou das ' + PRAZO_H + 'h sem o lançamento dos vendidos (pratos com carne, Coca-Cola e chopp). O acesso aos apps fica fechado até a <b>supervisão</b> liberar.'
          : 'Todo dia a gerência lança quanto vendeu no dia anterior de cada prato com carne ou camarão, de Coca-Cola e de chopp. Prazo: <b>até ' + PRAZO_H + 'h</b> — depois trava.') +
      '</div>' + linhas +
      (atrasado
        ? '<button id="gn-vend-sup" style="' + CSS_BTN2 + ';border:1px solid rgba(255,255,255,.12);margin-top:4px">🔑 Supervisão</button>'
        : '<button id="gn-vend-depois" style="' + CSS_BTN + ';background:none;color:rgba(232,234,237,.55);margin-top:2px">Lembrar daqui a ' + ADIA_MIN + ' min</button>'));
    _overlay.querySelectorAll('.gn-vend-lancar').forEach(function (b) {
      b.onclick = function () { _abrirForm(st.pend[+b.dataset.i].data, {}); };
    });
    var dep = _overlay.querySelector('#gn-vend-depois');
    if (dep) dep.onclick = function () { try { localStorage.setItem(ADIA_KEY, String(Date.now() + ADIA_MIN * 60000)); } catch (_) {} fechar(); };
    var sup = _overlay.querySelector('#gn-vend-sup');
    if (sup) sup.onclick = function () { _telaSupervisao(st.pend.filter(function (p) { return p.atrasado; })); };
  }

  // Supervisão: libera o lançamento atrasado (fica marcado) ou só o acesso de hoje.
  function _telaSupervisao(atrasados, voltar) {
    _montar(
      '<div style="font-size:17px;font-weight:800;margin-bottom:4px">🔑 Supervisão</div>' +
      '<div style="font-size:12px;color:rgba(232,234,237,.55);margin-bottom:12px">' + atrasados.map(function (p) { return _esc(_brDia(p.data)); }).join(' · ') + '</div>' +
      '<input id="gv-nome" autocomplete="off" placeholder="Nome (supervisor ou mestre)" style="' + CSS_IN + ';margin-bottom:8px">' +
      '<input id="gv-senha" type="password" autocomplete="off" placeholder="Senha" style="' + CSS_IN + '">' +
      '<div id="gv-err" style="font-size:11.5px;color:#f87171;min-height:14px;margin:8px 0 6px"></div>' +
      '<button id="gv-lancar" style="' + CSS_BTN + ';background:#facc15;color:#1a1d23;margin-bottom:8px">Liberar o lançamento atrasado</button>' +
      (voltar ? '' : '<button id="gv-acesso" style="' + CSS_BTN2 + ';margin-bottom:8px">Só liberar o acesso hoje</button>') +
      '<div style="font-size:10.5px;color:rgba(232,234,237,.4);margin-bottom:10px">O lançamento atrasado fica marcado no Painel com o nome de quem liberou. "Só o acesso" deixa o dia pendente.</div>' +
      '<button id="gv-voltar" style="' + CSS_BTN2 + '">Voltar</button>');
    _overlay.querySelector('#gv-voltar').onclick = voltar || _telaLista;
    var err = _overlay.querySelector('#gv-err');
    var checar = function () {
      var nome = _overlay.querySelector('#gv-nome').value.trim(), senha = _overlay.querySelector('#gv-senha').value;
      if (!nome || !senha) { err.textContent = 'Preencha nome e senha.'; return Promise.resolve(null); }
      return _verificar(nome, senha, '__nenhuma__', []).then(function (v) {
        if (v.erro) { err.textContent = 'Só supervisor ou mestre pode liberar.'; return null; }
        return v.u;
      }).catch(function () { err.textContent = 'Erro de conexão.'; return null; });
    };
    _overlay.querySelector('#gv-lancar').onclick = function () {
      checar().then(function (u) { if (u) _abrirForm(atrasados[0].data, { atrasado: true, liberado_por: u.nome }); });
    };
    var ac = _overlay.querySelector('#gv-acesso');
    if (ac) ac.onclick = function () {
      checar().then(function (u) {
        if (!u) return;
        try { localStorage.setItem(LIB_KEY, JSON.stringify({ uid: _estado.sess.id, dia: _iso(new Date()), por: u.nome, ts: Date.now() })); } catch (_) {}
        fechar();
      });
    };
  }

  // Formulário: carrega cadastro e o que já foi lançado no dia.
  function _abrirForm(dataISO, libera) {
    _montar('<div style="padding:30px;text-align:center;color:rgba(232,234,237,.6);font-size:13px">Carregando…</div>');
    return Promise.all([buscarCadastro(false), buscarLancamentos(_estado.loja, dataISO, dataISO)]).then(function (r) {
      var cad = r[0] || [], lanc = (r[1] || [])[0] || null;
      var qtds = {};
      if (lanc) Object.keys(lanc.itens || {}).forEach(function (id) { qtds[id] = lanc.itens[id].q; });
      _telaForm(dataISO, cad, qtds, libera || {}, lanc);
    }).catch(function (e) {
      _log('vendidos:form', e);
      _montar('<div style="font-size:14px;font-weight:800;margin-bottom:8px">Sem conexão</div><div style="font-size:12.5px;color:rgba(232,234,237,.7);margin-bottom:12px">Não deu pra carregar o cadastro dos itens. Tente de novo.</div><button id="gv-voltar" style="' + CSS_BTN2 + '">Voltar</button>');
      _overlay.querySelector('#gv-voltar').onclick = function () { _voltarOrigem(); };
    });
  }
  function _voltarOrigem() { if (_estado && _estado.origem === 'guardiao' && _estado.pend.length) _telaLista(); else fechar(); }

  function _telaForm(dataISO, cad, qtds, libera, lanc) {
    var porGrupo = {};
    cad.forEach(function (c) { (porGrupo[c.grupo] = porGrupo[c.grupo] || []).push(c); });
    var desc = function (c) {
      if (c.grupo === 'prato') {
        var g = CARNES.filter(function (k) { return Number((c.gramas || {})[k.key]) > 0; })
          .map(function (k) { return _num(c.gramas[k.key]) + ' g ' + k.label.toLowerCase(); });
        return g.join(' + ') || 'sem gramatura cadastrada';
      }
      if (c.grupo === 'chopp') return (c.ml ? _num(c.ml) + ' ml' : '') + (c.chopp_tipo ? ' · barril ' + c.chopp_tipo.toLowerCase() : '');
      return 'unidade';
    };
    var secoes = GRUPOS.map(function (g) {
      var arr = porGrupo[g.key] || [];
      if (!arr.length) return '';
      return '<div style="font-size:11px;font-weight:800;color:rgba(232,234,237,.6);letter-spacing:.4px;margin:14px 0 6px">' + g.label + '</div>' +
        arr.map(function (c) {
          var v = qtds[c.id];
          return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid rgba(255,255,255,.06)">' +
            '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:700">' + _esc(c.nome) + '</div>' +
            '<div style="font-size:10.5px;color:rgba(232,234,237,.5)">' + _esc(desc(c)) + '</div></div>' +
            '<input class="gv-q" data-id="' + _esc(c.id) + '" inputmode="numeric" placeholder="0" value="' + (v ? _esc(v) : '') + '" style="' + CSS_IN + ';width:72px;text-align:center;font-weight:800;padding:9px 6px">' +
          '</div>';
        }).join('');
    }).join('');
    var aviso = libera.atrasado
      ? '<div style="background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.35);border-radius:10px;padding:9px 11px;font-size:11.5px;margin-bottom:10px">Lançamento atrasado, liberado por <b>' + _esc(libera.liberado_por) + '</b>. Fica marcado no Painel.</div>'
      : (lanc ? '<div style="background:rgba(250,204,21,.10);border:1px solid rgba(250,204,21,.3);border-radius:10px;padding:9px 11px;font-size:11.5px;margin-bottom:10px">Já lançado por <b>' + _esc(lanc.lancado_por) + '</b>. Dá pra corrigir até ' + _br(_addDias(dataISO, 1)) + ' às ' + PRAZO_H + 'h.</div>' : '');
    _montar(
      '<div style="font-size:17px;font-weight:800;margin-bottom:2px">🧾 Vendidos — ' + _esc(_brDia(dataISO)) + '</div>' +
      '<div style="font-size:12px;color:rgba(232,234,237,.55);margin-bottom:10px">' + _esc(_estado.loja) + ' · quantidade vendida no dia (do relatório do caixa). Em branco conta como zero.</div>' +
      aviso +
      (cad.length ? secoes : '<div style="font-size:12.5px;color:#fbbf24;margin:10px 0">Nenhum item cadastrado ainda — o cadastro fica no Painel de Gestão › Vendidos.</div>') +
      '<div id="gv-tot" style="background:rgba(255,255,255,.05);border-radius:10px;padding:9px 11px;font-size:11.5px;line-height:1.6;margin:14px 0 10px"></div>' +
      '<div id="gv-err" style="font-size:11.5px;color:#f87171;min-height:14px;margin-bottom:6px"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1.4fr;gap:8px">' +
        '<button id="gv-voltar" style="' + CSS_BTN2 + '">Voltar</button>' +
        '<button id="gv-seguir" style="' + CSS_BTN + ';background:#facc15;color:#1a1d23">Assinar</button></div>');
    var ler = function () {
      var out = {}, ruim = null;
      _overlay.querySelectorAll('.gv-q').forEach(function (i) {
        var t = String(i.value || '').replace(/\s/g, '');
        if (t === '') return;
        if (!/^\d+$/.test(t)) { ruim = ruim || i; return; }
        out[i.dataset.id] = parseInt(t, 10);
      });
      return { qtds: out, ruim: ruim };
    };
    var resumoTot = function (t) {
      var carnes = CARNES.filter(function (c) { return t[c.key] > 0; }).map(function (c) { return c.icon + ' ' + c.label + ': <b>' + _kg(t[c.key]) + '</b>'; });
      var outros = [];
      if (t.coca_un) outros.push('🥤 Coca-Cola: <b>' + _num(t.coca_un) + ' un</b>');
      if (t.chopp_l_claro) outros.push('🍺 Chopp claro: <b>' + _num(t.chopp_l_claro, 1) + ' L</b>');
      if (t.chopp_l_vinho) outros.push('🍷 Chopp de vinho: <b>' + _num(t.chopp_l_vinho, 1) + ' L</b>');
      var tudo = carnes.concat(outros);
      return tudo.length ? tudo.join('<br>') : 'Nada vendido (tudo zero).';
    };
    var atualizar = function () {
      var l = ler();
      _overlay.querySelector('#gv-tot').innerHTML = '<div style="font-size:10.5px;font-weight:800;color:rgba(232,234,237,.55);margin-bottom:2px">PELA GRAMATURA</div>' + resumoTot(calcTotais(montarItens(cad, l.qtds)));
    };
    _overlay.querySelectorAll('.gv-q').forEach(function (i) { i.oninput = atualizar; });
    atualizar();
    _overlay.querySelector('#gv-voltar').onclick = function () { _voltarOrigem(); };
    _overlay.querySelector('#gv-seguir').onclick = function () {
      var l = ler();
      if (l.ruim) { _overlay.querySelector('#gv-err').textContent = 'Só números inteiros (quantidade vendida).'; l.ruim.focus(); return; }
      if (!libera.atrasado && !dentroDoPrazo(dataISO)) { _overlay.querySelector('#gv-err').textContent = 'O prazo deste dia já passou (' + PRAZO_H + 'h). Precisa da liberação da supervisão.'; return; }
      _telaAssinar(dataISO, cad, l.qtds, libera, lanc);
    };
  }

  function _telaAssinar(dataISO, cad, qtds, libera, lanc) {
    var itens = montarItens(cad, qtds), t = calcTotais(itens);
    var nItens = Object.keys(qtds).filter(function (k) { return qtds[k] > 0; }).length;
    _montar(
      '<div style="font-size:17px;font-weight:800;margin-bottom:2px">✍️ Assinar</div>' +
      '<div style="font-size:12px;color:rgba(232,234,237,.55);margin-bottom:10px">Vendidos de ' + _esc(_brDia(dataISO)) + ' · ' + nItens + ' ite' + (nItens === 1 ? 'm' : 'ns') + ' com venda</div>' +
      '<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:9px 11px;font-size:12px;line-height:1.6;margin-bottom:12px">' +
        (CARNES.filter(function (c) { return t[c.key] > 0; }).map(function (c) { return c.label + ' ' + _kg(t[c.key]); }).concat(
          t.coca_un ? ['Coca ' + _num(t.coca_un) + ' un'] : [], t.chopp_l_claro ? ['Chopp claro ' + _num(t.chopp_l_claro, 1) + ' L'] : [], t.chopp_l_vinho ? ['Chopp vinho ' + _num(t.chopp_l_vinho, 1) + ' L'] : []
        ).join(' · ') || 'Nada vendido (tudo zero)') + '</div>' +
      '<div style="font-size:11px;font-weight:800;color:rgba(232,234,237,.6);margin-bottom:7px">GERENTE OU SUB-GERENTE</div>' +
      '<input id="gv-nome" autocomplete="off" placeholder="Nome" style="' + CSS_IN + ';margin-bottom:8px">' +
      '<input id="gv-senha" type="password" autocomplete="off" placeholder="Senha" style="' + CSS_IN + '">' +
      '<div id="gv-err" style="font-size:11.5px;color:#f87171;min-height:14px;margin:8px 0 6px"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1.4fr;gap:8px">' +
        '<button id="gv-voltar" style="' + CSS_BTN2 + '">Voltar</button>' +
        '<button id="gv-ok" style="' + CSS_BTN + ';background:#facc15;color:#1a1d23">Confirmar</button></div>');
    _overlay.querySelector('#gv-voltar').onclick = function () { _telaForm(dataISO, cad, qtds, libera, lanc); };
    var ok = _overlay.querySelector('#gv-ok'), err = _overlay.querySelector('#gv-err');
    _overlay.querySelector('#gv-senha').onkeydown = function (e) { if (e.key === 'Enter') ok.click(); };
    ok.onclick = function () {
      var nome = _overlay.querySelector('#gv-nome').value.trim(), senha = _overlay.querySelector('#gv-senha').value;
      if (!nome || !senha) { err.textContent = 'Preencha nome e senha.'; return; }
      if (!libera.atrasado && !dentroDoPrazo(dataISO)) { err.textContent = 'O prazo deste dia passou enquanto você preenchia. Precisa da liberação da supervisão.'; return; }
      ok.disabled = true; ok.textContent = 'Salvando...'; err.textContent = '';
      _verificar(nome, senha, _estado.loja, CARGOS_COBRADOS).then(function (v) {
        if (v.erro) { err.innerHTML = v.erro; ok.disabled = false; ok.textContent = 'Confirmar'; return null; }
        // Um lançamento atrasado continua atrasado mesmo se corrigido depois.
        var atrasado = !!libera.atrasado || !!(lanc && lanc.atrasado);
        return salvar(_estado.loja, dataISO, itens, v.u, { atrasado: atrasado, liberado_por: libera.liberado_por || (lanc && lanc.liberado_por) || null,
          aparelho: (_estado.sess && _estado.sess.nome) || null }).then(function () {
          _estado.pend = (_estado.pend || []).filter(function (x) { return x.data !== dataISO; });
          if (typeof _estado.aoSalvar === 'function') { try { _estado.aoSalvar(); } catch (_) {} }
          if (_estado.origem === 'guardiao' && _estado.pend.length) _telaLista(); else fechar();
        });
      }).catch(function (e) { _log('vendidos:salvar', e); err.textContent = 'Erro de conexão — tente de novo.'; ok.disabled = false; ok.textContent = 'Confirmar'; });
    };
  }

  // Abre o formulário à mão (aba Vendidos do Check-list). libera: {atrasado, liberado_por}.
  function abrirLancamento(lojaKey, dataISO, sess, aoSalvar) {
    _estado = { sess: sess || { nome: '', loja: lojaKey }, loja: lojaKey, origem: 'manual', aoSalvar: aoSalvar, pend: [] };
    if (!dentroDoPrazo(dataISO)) {
      _telaSupervisao([{ data: dataISO, atrasado: true }], fechar);
      return;
    }
    return _abrirForm(dataISO, {});
  }

  // ── Aba do Check-list: os últimos dias, com status de cada um ──────────────
  function renderAba(el, lojaKey, sess) {
    if (!el) return Promise.resolve();
    if (!lojaKey || LOJAS_FORA.indexOf(lojaKey) >= 0) { el.innerHTML = '<div style="padding:20px;font-size:12px;color:var(--t2)">Esta loja não lança vendidos.</div>'; return Promise.resolve(); }
    var agora = new Date(), hoje = _iso(agora);
    var desde = _addDias(hoje, -JANELA_DIAS);
    el.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--t2)">Carregando…</div>';
    return buscarLancamentos(lojaKey, desde, hoje).then(function (rows) {
      var por = {}; (rows || []).forEach(function (r) { por[String(r.data).slice(0, 10)] = r; });
      var pend = calcularPendencias(lojaKey, agora, rows);
      var dias = [];
      for (var k = 0; k <= JANELA_DIAS; k++) { var d = _addDias(hoje, -k); if (d >= INICIO || por[d]) dias.push(d); }
      var linha = function (d) {
        var r = por[d], dentro = dentroDoPrazo(d, agora), t = (r && r.totais) || {};
        var status, cor, btn = '';
        if (r) {
          status = '✅ ' + _esc(r.lancado_por) + (r.atrasado ? ' · <span style="color:var(--txt-red,#dc2626)">atrasado</span>' : '');
          cor = 'rgba(22,163,74,.25)';
          if (dentro) btn = '<button class="gv-aba-btn" data-d="' + d + '" style="border:1px solid rgba(0,0,0,.15);background:none;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;color:var(--t1)">Corrigir</button>';
        } else if (d === hoje) {
          status = 'dia em andamento — lance amanhã até ' + PRAZO_H + 'h'; cor = 'rgba(0,0,0,.08)';
          btn = '<button class="gv-aba-btn" data-d="' + d + '" style="border:1px solid rgba(0,0,0,.15);background:none;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;color:var(--t1)">Lançar</button>';
        } else if (dentro) {
          status = '<span style="color:var(--txt-amber,#b45309);font-weight:700">⏳ pendente — prazo hoje às ' + PRAZO_H + 'h</span>'; cor = 'rgba(245,158,11,.35)';
          btn = '<button class="gv-aba-btn" data-d="' + d + '" style="border:none;background:var(--gn,#e8580a);color:#fff;border-radius:8px;padding:7px 12px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit">Lançar</button>';
        } else {
          status = '<span style="color:var(--txt-red,#dc2626);font-weight:700">🔒 não lançado — prazo encerrou</span>'; cor = 'rgba(239,68,68,.3)';
          btn = '<button class="gv-aba-btn" data-d="' + d + '" style="border:1px solid rgba(239,68,68,.4);background:none;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;color:var(--txt-red,#dc2626)">🔑 Supervisão</button>';
        }
        var resumo = r ? CARNES.filter(function (c) { return t[c.key] > 0; }).map(function (c) { return c.label + ' ' + _kg(t[c.key]); })
          .concat(t.coca_un ? ['Coca ' + _num(t.coca_un) + ' un'] : [], (t.chopp_l_claro || t.chopp_l_vinho) ? ['Chopp ' + _num((t.chopp_l_claro || 0) + (t.chopp_l_vinho || 0), 1) + ' L'] : []).join(' · ') : '';
        return '<div style="display:flex;align-items:center;gap:10px;border:1px solid ' + cor + ';border-radius:12px;padding:10px 12px;margin-bottom:8px;background:var(--s2,#fff)">' +
          '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:800;color:var(--t1)">' + _esc(_brDia(d)) + '</div>' +
          '<div style="font-size:11px;color:var(--t2)">' + status + '</div>' +
          (resumo ? '<div style="font-size:10.5px;color:var(--t3);margin-top:2px">' + _esc(resumo) + '</div>' : '') + '</div>' + btn + '</div>';
      };
      el.innerHTML =
        '<div style="font-size:14px;font-weight:800;color:var(--t1);margin-bottom:2px">🧾 Vendidos do dia</div>' +
        '<div style="font-size:11px;color:var(--t2);line-height:1.5;margin-bottom:12px">Quantidade vendida de cada prato com carne ou camarão, de Coca-Cola e de chopp — do relatório do caixa. ' +
          'Gerente ou sub lança <b>até ' + PRAZO_H + 'h do dia seguinte</b>; depois trava e só a supervisão libera. A gramatura de cada prato vem do cadastro do Painel de Gestão.</div>' +
        (pend.length ? '<div style="font-size:11.5px;font-weight:800;color:var(--txt-amber,#b45309);margin-bottom:8px">' + pend.length + ' dia' + (pend.length > 1 ? 's' : '') + ' sem lançamento</div>' : '') +
        (dias.length ? dias.map(linha).join('') : '<div class="gv-aba-inicio" style="background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:10px 12px;font-size:12px;color:var(--t1);line-height:1.5;margin-bottom:10px">⏳ Começa com as vendas de <b>' + _brDia(INICIO) + '</b> — o primeiro lançamento é até <b>' + _br(_addDias(INICIO, 1)) + ' às ' + PRAZO_H + 'h</b>. Abaixo, o que vai ser pedido.</div><div class="gv-aba-itens" style="font-size:12px;color:var(--t2)">Carregando os itens…</div>');
      el.querySelectorAll('.gv-aba-btn').forEach(function (b) {
        b.onclick = function () { abrirLancamento(lojaKey, b.dataset.d, sess, function () { renderAba(el, lojaKey, sess); }); };
      });
      // Antes do início, a aba ficava só com o texto e parecia quebrada (print do dono,
      // 19/11). Mostra o que a gerência vai lançar, pra ela já conhecer o formulário.
      var boxItens = el.querySelector('.gv-aba-itens');
      if (boxItens) buscarCadastro(false).then(function (cad) {
        var porG = {}; (cad || []).forEach(function (c) { (porG[c.grupo] = porG[c.grupo] || []).push(c); });
        boxItens.innerHTML = GRUPOS.map(function (g) {
          var arr = porG[g.key] || []; if (!arr.length) return '';
          return '<div style="background:var(--s2,#fff);border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:9px 12px;margin-bottom:8px">' +
            '<div style="font-size:11.5px;font-weight:800;color:var(--t1);margin-bottom:4px">' + g.label + ' (' + arr.length + ')</div>' +
            '<div style="font-size:11px;color:var(--t2);line-height:1.6">' + arr.map(function (c) { return _esc(c.nome); }).join(' · ') + '</div></div>';
        }).join('') || 'Nenhum item cadastrado ainda.';
      }).catch(function () { boxItens.textContent = 'Não deu pra carregar os itens agora.'; });
    }).catch(function (e) {
      _log('vendidos:aba', e);
      el.innerHTML = '<div style="padding:20px;font-size:12px;color:var(--t2)">Não deu pra carregar os lançamentos agora. Troque de aba e volte.</div>';
    });
  }

  // ── O guardião ─────────────────────────────────────────────────────────────
  var _rodando = false;
  function verificarAgora(opts) {
    opts = opts || {};
    var sess = _lerSessao();
    if (_overlay && _estado && _estado.origem === 'manual') return Promise.resolve([]);
    if (!_cobrado(sess)) { if (_estado && _estado.origem === 'guardiao') fechar(); return Promise.resolve([]); }
    var agora = opts.agora ? new Date(opts.agora) : new Date();
    var hoje = _iso(agora);
    if (_addDias(hoje, -1) < INICIO) return Promise.resolve([]);
    if (_rodando) return Promise.resolve([]);
    _rodando = true;
    return buscarLancamentos(sess.loja, _addDias(hoje, -JANELA_DIAS), hoje).then(function (rows) {
      var pend = calcularPendencias(sess.loja, agora, rows);
      var atrasado = pend.some(function (p) { return p.atrasado; });
      if (!pend.length) { if (_estado && _estado.origem === 'guardiao') fechar(); return pend; }
      if (atrasado && _liberado(sess, hoje)) return pend;
      if (!atrasado && _adiado()) return pend;
      if (_overlay) return pend;   // já aberto (não atropela quem está preenchendo)
      _estado = { sess: sess, loja: sess.loja, pend: pend, origem: 'guardiao' };
      _telaLista();
      return pend;
    }).catch(function (e) { _log('vendidos:verificar', e); return []; })
      .then(function (r) { _rodando = false; return r; });
  }

  function _iniciar() {
    setTimeout(verificarAgora, 1800);
    setInterval(verificarAgora, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) verificarAgora(); });
  }
  if (!window.__GN_VENDIDOS_SEM_GUARDIAO) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _iniciar);
    else _iniciar();
  }

  window.gnVendidos = {
    INICIO: INICIO, PRAZO_H: PRAZO_H, CARNES: CARNES, GRUPOS: GRUPOS,
    prazoDe: prazoDe, dentroDoPrazo: dentroDoPrazo, calcularPendencias: calcularPendencias,
    calcTotais: calcTotais, montarItens: montarItens,
    buscarCadastro: buscarCadastro, buscarLancamentos: buscarLancamentos, salvar: salvar,
    abrirLancamento: abrirLancamento, renderAba: renderAba, verificarAgora: verificarAgora, fechar: fechar,
  };
})();
