// ─── DESPERDÍCIO DO RODÍZIO E DO BUFFET DE FEIJOADA ─────────────────────────
// Pedido do dono (19/11/2026): "nos dias da feijoada, obrigatoriedade de informar se teve
// desperdício, assim como o rodízio. Feijoada sexta e sábado (11h às 16h) — às 18h pedir a
// informação; rodízio todos os dias, até 2h depois da meia-noite do dia vigente. Se não teve
// nada, o gerente ou sub informa que não teve. Vai pra aba Avarias do app Pedido, separado
// por rodízio e buffet." Decidido com ele:
//   · a cobrança aparece em qualquer app que a gerência (gerente/sub) estiver usando;
//   · feijoada a partir das 18h (sex/sáb); rodízio a partir das 22h (lojas de GN_BUFFET_RODIZIO);
//   · até 02h da madrugada conta o dia anterior (mesma virada do gn-escala-acesso/gn-presenca);
//   · dentro do prazo dá pra adiar ("lembrar em 30 min"); passou das 02h sem resposta, o dia
//     fica em atraso e TRAVA os apps da gerência até informar (ou liberação de supervisor);
//   · é só controle/relatório — não passa por valor do Compras nem Financeiro;
//   · 11 lojas; Maglia fora (regra do projeto).
// Falha aberto como as outras travas: sem rede ou erro, não bloqueia ninguém.
(function () {
  'use strict';

  var SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';
  var TABELA = 'gn_desperdicio_buffet';

  var INICIO = '2026-11-20';          // primeiro dia cobrado (dias antes disso nunca ficam em atraso)
  var JANELA_DIAS = 7;                // olha no máximo 7 dias pra trás
  var HORA = { feijoada: 18, rodizio: 22 };
  var VIRADA_H = 2;
  var CARGOS_COBRADOS = ['gerente', 'sub_gerente'];
  var CARGOS_LIBERAM = ['supervisor', 'mestre'];
  var LOJAS_FORA = ['MAGLIA'];
  var ADIA_MIN = 30;
  var ROTULO = { feijoada: '🍲 Buffet de feijoada', rodizio: '🍖 Rodízio' };

  function _log(t, e) { try { window.gnLogError && window.gnLogError(t, e); } catch (_) {} }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function _iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function _dataDe(iso) { return new Date(iso + 'T12:00:00'); }
  function _addDias(iso, n) { var d = _dataDe(iso); d.setDate(d.getDate() + n); return _iso(d); }
  function _br(iso) { var p = String(iso).split('-'); return p[2] + '/' + p[1]; }
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function _brDia(iso) { return DIAS[_dataDe(iso).getDay()] + ' ' + _br(iso); }

  // Dia operacional: até 02h ainda é o dia anterior.
  function diaOperacional(agora) {
    var d = agora || new Date();
    if (d.getHours() < VIRADA_H) return _iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12));
    return _iso(d);
  }
  // O que a loja deve informar num dia (independe de horário).
  function esperados(lojaKey, dataISO) {
    if (!lojaKey || LOJAS_FORA.indexOf(lojaKey) >= 0) return [];
    if (window.GN_BUFFET_FORA && window.GN_BUFFET_FORA.indexOf(lojaKey) >= 0) return [];
    var out = [], dow = _dataDe(dataISO).getDay();
    if (dow === 5 || dow === 6) out.push('feijoada');
    if (window.gnBuffetTemRodizio && window.gnBuffetTemRodizio(lojaKey)) out.push('rodizio');
    return out;
  }
  // Já está na hora de cobrar esse tipo no dia operacional de hoje?
  function _janelaAberta(tipo, agora) {
    var h = agora.getHours();
    return h < VIRADA_H || h >= HORA[tipo];
  }

  // Lista do que está pendente: [{data, tipo, atrasado}]. declarados: linhas da tabela.
  function calcularPendencias(lojaKey, agora, declarados) {
    var hoje = diaOperacional(agora);
    var feito = {};
    (declarados || []).forEach(function (r) { feito[r.data + '|' + r.tipo] = true; });
    var out = [];
    for (var k = JANELA_DIAS; k >= 0; k--) {
      var d = _addDias(hoje, -k);
      if (d < INICIO) continue;
      esperados(lojaKey, d).forEach(function (t) {
        if (feito[d + '|' + t]) return;
        if (d < hoje) out.push({ data: d, tipo: t, atrasado: true });
        else if (_janelaAberta(t, agora)) out.push({ data: d, tipo: t, atrasado: false });
      });
    }
    return out;
  }

  function _fetch(url, opt) {
    opt = opt || {};
    var h = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
    Object.keys(opt.headers || {}).forEach(function (k) { h[k] = opt.headers[k]; });
    return fetch(url, { method: opt.method || 'GET', headers: h, body: opt.body });
  }
  function buscarDeclarados(lojaKey, desde, ate) {
    var url = SB_URL + '/rest/v1/' + TABELA + '?select=*&data=gte.' + desde + '&data=lte.' + ate +
              (lojaKey ? '&loja=eq.' + encodeURIComponent(lojaKey) : '') + '&order=data.desc';
    return _fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  // ── Sessão (mesma normalização do gn-escala-acesso) ────────────────────────
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

  var LIB_KEY = 'gn_desp_liberacao', ADIA_KEY = 'gn_desp_adiado';
  function _liberado(sess, hoje) {
    try { var l = JSON.parse(localStorage.getItem(LIB_KEY) || 'null'); return !!l && l.dia === hoje && String(l.uid) === String(sess.id); } catch (_) { return false; }
  }
  function _adiado() {
    try { return Number(localStorage.getItem(ADIA_KEY) || 0) > Date.now(); } catch (_) { return false; }
  }

  // ── Assinatura: gerente/sub da própria loja, ou supervisor/mestre (GERAL) ───
  function _verificar(nome, senha, lojaKey, cargosOk) {
    return _fetch(SB_URL + '/rest/v1/rpc/verificar_login', { method: 'POST',
      body: JSON.stringify({ p_nome: nome, p_senha: senha, p_app: 'desperdicio-buffet' }) })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        rows = rows || [];
        if (!rows.length) return { erro: 'Nome ou senha incorretos.' };
        var u = rows.find(function (x) {
          var c = String(x.cargo || '').toLowerCase();
          return (cargosOk.indexOf(c) >= 0 && x.loja === lojaKey) || (CARGOS_LIBERAM.indexOf(c) >= 0);
        });
        if (!u) return { erro: 'Quem assina é gerente ou sub-gerente da loja (ou supervisão). ' + _esc(rows[0].nome) + ' está como ' + _esc(rows[0].cargo || 'sem cargo') + '.' };
        return { u: u };
      });
  }

  function salvar(lojaKey, dataISO, tipo, teve, itens, obs, u, aparelho) {
    var corpo = { loja: lojaKey, data: dataISO, tipo: tipo, teve: !!teve, itens: teve ? itens : [], obs: obs || null,
                  assinado_por: u.nome, assinado_cargo: u.cargo || null, aparelho: aparelho || null };
    return _fetch(SB_URL + '/rest/v1/' + TABELA + '?on_conflict=loja,data,tipo', { method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' }, body: JSON.stringify(corpo) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return true; });
  }

  // ── Tela ───────────────────────────────────────────────────────────────────
  var _overlay = null, _estado = null;
  var CSS_BTN = 'width:100%;border:none;border-radius:11px;padding:12px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit';
  var CSS_IN = 'width:100%;box-sizing:border-box;background:#0f1115;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;color:#e8eaed;font-size:13px;font-family:inherit';

  function fechar() { if (_overlay) { _overlay.remove(); _overlay = null; document.body.style.overflow = ''; } }

  function _montar(html) {
    if (!_overlay) {
      _overlay = document.createElement('div');
      _overlay.id = 'gn-desp-overlay';
      _overlay.setAttribute('role', 'dialog');
      _overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483500;background:#0f1115;display:flex;align-items:flex-start;justify-content:center;padding:18px;overflow:auto;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
      document.body.appendChild(_overlay);
      document.body.style.overflow = 'hidden';
    }
    _overlay.innerHTML = '<div style="max-width:440px;width:100%;margin:auto;background:#171a21;border:1px solid rgba(255,255,255,.09);border-radius:20px;padding:22px 18px;color:#e8eaed">' + html + '</div>';
  }

  // Tela 1: o que está pendente.
  function _telaLista() {
    var st = _estado, atrasado = st.pend.some(function (p) { return p.atrasado; });
    var linhas = st.pend.map(function (p, i) {
      return '<div class="gn-desp-pend" data-i="' + i + '" style="border:1px solid ' + (p.atrasado ? 'rgba(248,113,113,.45)' : 'rgba(255,255,255,.12)') + ';border-radius:12px;padding:11px;margin-bottom:9px">' +
        '<div style="font-size:13px;font-weight:800">' + ROTULO[p.tipo] + ' — ' + _esc(_brDia(p.data)) + (p.atrasado ? ' <span style="color:#f87171">· em atraso</span>' : '') + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px">' +
          '<button class="gn-desp-nao" data-i="' + i + '" style="' + CSS_BTN + ';background:#22c55e;color:#06240f;padding:10px">✅ Não teve</button>' +
          '<button class="gn-desp-sim" data-i="' + i + '" style="' + CSS_BTN + ';background:#f59e0b;color:#2a1600;padding:10px">⚠️ Teve desperdício</button>' +
        '</div></div>';
    }).join('');
    _montar(
      '<div style="font-size:38px;line-height:1;margin-bottom:10px">🍽️</div>' +
      '<div style="font-size:18px;font-weight:800;margin-bottom:4px">' + (atrasado ? 'Desperdício não informado' : 'Teve desperdício hoje?') + '</div>' +
      '<div style="font-size:12px;color:rgba(232,234,237,.55);margin-bottom:12px">' + _esc(st.sess.nome || '') + ' · ' + _esc(st.sess.loja || '') + '</div>' +
      '<div style="font-size:12.5px;line-height:1.55;color:rgba(232,234,237,.82);margin-bottom:14px">' +
        (atrasado
          ? 'Passou do prazo (02h) sem a informação do desperdício. O acesso aos apps fica fechado até a gerência informar — se não teve nada, é só tocar em <b>Não teve</b>.'
          : 'A gerência informa todo dia se teve desperdício no rodízio (a partir das 22h) e no buffet de feijoada (sexta e sábado, a partir das 18h). Prazo: <b>até 02h</b>.') +
      '</div>' + linhas +
      (atrasado
        ? '<button id="gn-desp-lib" style="' + CSS_BTN + ';background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#e8eaed;margin-top:4px">🔑 Liberar com senha de supervisão</button>'
        : '<button id="gn-desp-depois" style="' + CSS_BTN + ';background:none;color:rgba(232,234,237,.55);margin-top:2px">Lembrar daqui a ' + ADIA_MIN + ' min</button>'));
    _overlay.querySelectorAll('.gn-desp-nao').forEach(function (b) { b.onclick = function () { _telaAssinar(st.pend[+b.dataset.i], false, []); }; });
    _overlay.querySelectorAll('.gn-desp-sim').forEach(function (b) { b.onclick = function () { _telaItens(st.pend[+b.dataset.i]); }; });
    var dep = _overlay.querySelector('#gn-desp-depois');
    if (dep) dep.onclick = function () { try { localStorage.setItem(ADIA_KEY, String(Date.now() + ADIA_MIN * 60000)); } catch (_) {} fechar(); };
    var lib = _overlay.querySelector('#gn-desp-lib');
    if (lib) lib.onclick = _telaLiberar;
  }

  // Tela 2: itens do desperdício.
  function _telaItens(p, itens) {
    itens = itens || [{ insumo: '', qtd: '', unidade: 'KG' }];
    var linha = function (it, i) {
      return '<div class="gn-desp-item" style="display:grid;grid-template-columns:1fr 70px 76px 26px;gap:6px;margin-bottom:7px">' +
        '<input class="gd-ins" placeholder="Item (ex.: feijoada, picanha)" value="' + _esc(it.insumo) + '" style="' + CSS_IN + '">' +
        '<input class="gd-qtd" inputmode="decimal" placeholder="Qtd" value="' + _esc(it.qtd) + '" style="' + CSS_IN + '">' +
        '<select class="gd-un" style="' + CSS_IN + ';padding:10px 4px">' + ['KG', 'UN', 'PORÇÃO', 'L'].map(function (u) { return '<option' + (it.unidade === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select>' +
        '<button class="gd-del" data-i="' + i + '" style="background:none;border:none;color:#f87171;font-size:18px;cursor:pointer">×</button></div>';
    };
    _montar(
      '<div style="font-size:17px;font-weight:800;margin-bottom:2px">⚠️ ' + ROTULO[p.tipo] + '</div>' +
      '<div style="font-size:12px;color:rgba(232,234,237,.55);margin-bottom:12px">' + _esc(_brDia(p.data)) + ' · o que foi desperdiçado</div>' +
      '<div id="gd-itens">' + itens.map(linha).join('') + '</div>' +
      '<button id="gd-add" style="' + CSS_BTN + ';background:rgba(255,255,255,.07);border:1px dashed rgba(255,255,255,.2);color:#e8eaed;padding:9px;margin-bottom:10px">+ Adicionar item</button>' +
      '<textarea id="gd-obs" placeholder="Observação (opcional)" rows="2" style="' + CSS_IN + ';resize:vertical;margin-bottom:8px"></textarea>' +
      '<div id="gd-err" style="font-size:11.5px;color:#f87171;min-height:14px;margin-bottom:6px"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1.4fr;gap:8px">' +
        '<button id="gd-voltar" style="' + CSS_BTN + ';background:rgba(255,255,255,.07);color:#e8eaed">Voltar</button>' +
        '<button id="gd-seguir" style="' + CSS_BTN + ';background:#facc15;color:#1a1d23">Assinar</button></div>');
    var ler = function () {
      return Array.prototype.map.call(_overlay.querySelectorAll('.gn-desp-item'), function (r) {
        return { insumo: r.querySelector('.gd-ins').value.trim(), qtd: r.querySelector('.gd-qtd').value.trim(), unidade: r.querySelector('.gd-un').value };
      });
    };
    _overlay.querySelector('#gd-add').onclick = function () { var l = ler(); l.push({ insumo: '', qtd: '', unidade: 'KG' }); _telaItens(p, l); };
    _overlay.querySelectorAll('.gd-del').forEach(function (b) { b.onclick = function () { var l = ler(); l.splice(+b.dataset.i, 1); _telaItens(p, l.length ? l : undefined); }; });
    _overlay.querySelector('#gd-voltar').onclick = function () { _telaLista(); };
    _overlay.querySelector('#gd-seguir').onclick = function () {
      var num = function (v) { var t = String(v || '').replace(/\s/g, ''); if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.'); var n = parseFloat(t); return isFinite(n) && n > 0 ? n : 0; };
      var l = ler().filter(function (x) { return x.insumo || x.qtd; });
      if (!l.length) { _overlay.querySelector('#gd-err').textContent = 'Lance pelo menos 1 item — ou volte e toque em "Não teve".'; return; }
      var ruim = l.find(function (x) { return !x.insumo || !num(x.qtd); });
      if (ruim) { _overlay.querySelector('#gd-err').textContent = 'Cada item precisa do nome e da quantidade.'; return; }
      _telaAssinar(p, true, l.map(function (x) { return { insumo: x.insumo.toUpperCase(), qtd: num(x.qtd), unidade: x.unidade }; }), _overlay.querySelector('#gd-obs').value.trim());
    };
  }

  // Tela 3: assinatura (gerente/sub).
  function _telaAssinar(p, teve, itens, obs) {
    var resumo = teve ? itens.map(function (x) { return _esc(x.insumo) + ' ' + String(x.qtd).replace('.', ',') + ' ' + x.unidade; }).join(' · ') : 'Não teve desperdício';
    _montar(
      '<div style="font-size:17px;font-weight:800;margin-bottom:2px">✍️ Assinar</div>' +
      '<div style="font-size:12px;color:rgba(232,234,237,.55);margin-bottom:10px">' + ROTULO[p.tipo] + ' — ' + _esc(_brDia(p.data)) + '</div>' +
      '<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:9px 11px;font-size:12.5px;margin-bottom:12px">' + resumo + '</div>' +
      '<div style="font-size:11px;font-weight:800;color:rgba(232,234,237,.6);margin-bottom:7px">GERENTE OU SUB-GERENTE</div>' +
      '<input id="gd-nome" autocomplete="off" placeholder="Nome" style="' + CSS_IN + ';margin-bottom:8px">' +
      '<input id="gd-senha" type="password" autocomplete="off" placeholder="Senha" style="' + CSS_IN + '">' +
      '<div id="gd-err" style="font-size:11.5px;color:#f87171;min-height:14px;margin:8px 0 6px"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1.4fr;gap:8px">' +
        '<button id="gd-voltar" style="' + CSS_BTN + ';background:rgba(255,255,255,.07);color:#e8eaed">Voltar</button>' +
        '<button id="gd-ok" style="' + CSS_BTN + ';background:#facc15;color:#1a1d23">Confirmar</button></div>');
    _overlay.querySelector('#gd-voltar').onclick = function () { teve ? _telaItens(p, itens.map(function (x) { return { insumo: x.insumo, qtd: String(x.qtd).replace('.', ','), unidade: x.unidade }; })) : (_telaLista()); };
    var ok = _overlay.querySelector('#gd-ok'), err = _overlay.querySelector('#gd-err');
    _overlay.querySelector('#gd-senha').onkeydown = function (e) { if (e.key === 'Enter') ok.click(); };
    ok.onclick = function () {
      var nome = _overlay.querySelector('#gd-nome').value.trim(), senha = _overlay.querySelector('#gd-senha').value;
      if (!nome || !senha) { err.textContent = 'Preencha nome e senha.'; return; }
      ok.disabled = true; ok.textContent = 'Salvando...'; err.textContent = '';
      _verificar(nome, senha, _estado.loja, CARGOS_COBRADOS).then(function (v) {
        if (v.erro) { err.innerHTML = v.erro; ok.disabled = false; ok.textContent = 'Confirmar'; return null; }
        return salvar(_estado.loja, p.data, p.tipo, teve, itens, obs, v.u, (_estado.sess && _estado.sess.nome) || null).then(function () {
          _estado.pend = _estado.pend.filter(function (x) { return !(x.data === p.data && x.tipo === p.tipo); });
          if (typeof _estado.aoSalvar === 'function') { try { _estado.aoSalvar(); } catch (_) {} }
          if (!_estado.pend.length) fechar(); else _telaLista();
        });
      }).catch(function (e) { _log('desperdicio:salvar', e); err.textContent = 'Erro de conexão — tente de novo.'; ok.disabled = false; ok.textContent = 'Confirmar'; });
    };
  }

  function _telaLiberar() {
    _montar(
      '<div style="font-size:17px;font-weight:800;margin-bottom:10px">🔑 Liberar com senha de supervisão</div>' +
      '<input id="gd-nome" autocomplete="off" placeholder="Nome (supervisor ou mestre)" style="' + CSS_IN + ';margin-bottom:8px">' +
      '<input id="gd-senha" type="password" autocomplete="off" placeholder="Senha" style="' + CSS_IN + '">' +
      '<div id="gd-err" style="font-size:11.5px;color:#f87171;min-height:14px;margin:8px 0 6px"></div>' +
      '<div style="font-size:10.5px;color:rgba(232,234,237,.4);margin-bottom:10px">Libera o acesso só hoje. O desperdício continua pendente até alguém informar.</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1.4fr;gap:8px">' +
        '<button id="gd-voltar" style="' + CSS_BTN + ';background:rgba(255,255,255,.07);color:#e8eaed">Voltar</button>' +
        '<button id="gd-ok" style="' + CSS_BTN + ';background:#facc15;color:#1a1d23">Liberar hoje</button></div>');
    _overlay.querySelector('#gd-voltar').onclick = _telaLista;
    var ok = _overlay.querySelector('#gd-ok'), err = _overlay.querySelector('#gd-err');
    ok.onclick = function () {
      var nome = _overlay.querySelector('#gd-nome').value.trim(), senha = _overlay.querySelector('#gd-senha').value;
      if (!nome || !senha) { err.textContent = 'Preencha nome e senha.'; return; }
      _verificar(nome, senha, '__nenhuma__', []).then(function (v) {
        if (v.erro) { err.innerHTML = 'Só supervisor ou mestre pode liberar.'; return; }
        try { localStorage.setItem(LIB_KEY, JSON.stringify({ uid: _estado.sess.id, dia: diaOperacional(new Date()), por: v.u.nome, ts: Date.now() })); } catch (_) {}
        fechar();
      }).catch(function () { err.textContent = 'Erro de conexão.'; });
    };
  }

  // Abre o formulário à mão (botão na aba Avarias do app Lojas). tipos: os que valem hoje.
  function abrirManual(lojaKey, sess, aoSalvar) {
    var hoje = diaOperacional(new Date());
    var tipos = esperados(lojaKey, hoje);
    _estado = { sess: sess || { nome: '', loja: lojaKey }, loja: lojaKey, origem: 'manual', aoSalvar: aoSalvar,
                pend: tipos.map(function (t) { return { data: hoje, tipo: t, atrasado: false }; }) };
    if (!_estado.pend.length) { alert('Hoje esta loja não tem rodízio nem buffet de feijoada pra informar.'); return; }
    return buscarDeclarados(lojaKey, hoje, hoje).then(function (rows) {
      var feito = {}; (rows || []).forEach(function (r) { feito[r.tipo] = true; });
      _estado.pend = _estado.pend.filter(function (p) { return !feito[p.tipo]; });
      if (!_estado.pend.length) { alert('O desperdício de hoje já foi informado.'); return; }
      _telaLista();
      var dep = _overlay && _overlay.querySelector('#gn-desp-depois'); if (dep) { dep.textContent = 'Fechar'; dep.onclick = fechar; }
    }).catch(function () { _telaLista(); });
  }

  // ── O guardião ─────────────────────────────────────────────────────────────
  var _rodando = false;
  function verificarAgora(opts) {
    opts = opts || {};
    var sess = _lerSessao();
    if (_overlay && _estado && _estado.origem === 'manual') return Promise.resolve([]);
    if (!_cobrado(sess)) { fechar(); return Promise.resolve([]); }
    var agora = opts.agora ? new Date(opts.agora) : new Date();
    var hoje = diaOperacional(agora);
    if (!esperados(sess.loja, hoje).length && hoje <= INICIO) return Promise.resolve([]);
    if (_rodando) return Promise.resolve([]);
    _rodando = true;
    return buscarDeclarados(sess.loja, _addDias(hoje, -JANELA_DIAS), hoje).then(function (rows) {
      var pend = calcularPendencias(sess.loja, agora, rows);
      var atrasado = pend.some(function (p) { return p.atrasado; });
      // Registro dos bloqueios (ranking do Painel, 26/11/2026): trava = atrasado sem liberação.
      if (window.gnTravasRegistro) window.gnTravasRegistro('desperdicio', sess.loja, ['desperdicio'],
        atrasado && !_liberado(sess, hoje) ? [{ tipo: 'desperdicio', detalhe: pend.filter(function (p) { return p.atrasado; }).map(function (p) { return p.data + ' ' + (ROTULO[p.tipo] || p.tipo); }).join(', ') }] : []);
      if (!pend.length) { fechar(); return pend; }
      if (atrasado && _liberado(sess, hoje)) return pend;
      if (!atrasado && _adiado()) return pend;
      if (_overlay) return pend;   // já aberto (não atropela quem está preenchendo)
      _estado = { sess: sess, loja: sess.loja, pend: pend, origem: 'guardiao' };
      _telaLista();
      return pend;
    }).catch(function (e) { _log('desperdicio:verificar', e); return []; })
      .then(function (r) { _rodando = false; return r; });
  }

  function _iniciar() {
    // Espera o gn-lojas-config (rodízio por loja) e a sessão aparecerem.
    setTimeout(verificarAgora, 1500);
    setInterval(verificarAgora, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) verificarAgora(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _iniciar);
  else _iniciar();

  window.gnDesperdicio = {
    INICIO: INICIO, ROTULO: ROTULO, HORA: HORA,
    diaOperacional: diaOperacional, esperados: esperados, calcularPendencias: calcularPendencias,
    buscarDeclarados: buscarDeclarados, verificarAgora: verificarAgora, abrirManual: abrirManual, fechar: fechar,
  };
})();
