// ─── BLOQUEIO: MÍNIMO DE 20 UTENSÍLIOS CADASTRADOS ──────────────────────────────────────
// "Temos pelo menos que ter 20 itens cadastrados nessa aba de utensílios no app Check-list;
//  loja que não tiver, bloquear o gerente e o sub, a partir de amanhã, e abrir somente essa
//  aba pra ser preenchida." (22/11/2026)
//
// Fonte: gn_lojas.all_data.utensilios_saldo, na linha DA LOJA (comKey) — o controle que a aba
// Utensílios do Check-list grava (📋 Contar ou o primeiro lançamento de quebra/falta). Cada
// chave é uma peça. Medido em 22/11: Bangu 10, Guarulhos 14, São Gonçalo 17, Campo Grande 0
// e Itaquera 0; as outras seis já passam de 20.
//
// Mesmo desenho do gn-validade-acesso.js:
//   · só gerente e sub-gerente da loja (pedido do dono); supervisão e mestre passam;
//   · o Check-list NUNCA é coberto aqui — lá a trava é dele (pendência essencial que só
//     deixa a aba Utensílios aberta). Fechar o Check-list trancaria a loja por dentro;
//   · falha aberto: sem rede, sem sessão, qualquer dúvida → passa;
//   · Maglia fora (o pedido não a citou).
(function () {
  'use strict';

  var SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';

  var MINIMO = 20;
  var DESDE = '2026-11-23';                       // "a partir de amanhã"
  var CARGOS_COBRADOS = ['gerente', 'sub_gerente'];
  var APP_DA_CORRECAO = 'gn-checklist';
  var LOJAS_FORA = ['MAGLIA'];
  var LINK = 'gn-checklist.html?tab=utensilios&contar=1';
  var CACHE_KEY = 'gn_utens_min_cache';
  var CACHE_MS = 5 * 60 * 1000;                   // só o LIBERADO é cacheado

  function _log(ctx, e) {
    try { if (window.gnLogError) window.gnLogError(ctx, e); else console.error('[GN:' + ctx + ']', e); } catch (_) {}
  }
  function _hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function _comKey(loja) {
    try {
      if (window.gnLojaPorChave) { var l = window.gnLojaPorChave(loja); if (l && l.comKey) return l.comKey; }
    } catch (_) {}
    return null;
  }

  function contarItens(comKey) {
    var url = SB_URL + '/rest/v1/gn_lojas?loja=eq.' + encodeURIComponent(comKey) + '&select=all_data';
    return fetch(url, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) {
        var ad = rows && rows[0] && rows[0].all_data;
        var s = ad && ad.utensilios_saldo;
        return (s && typeof s === 'object') ? Object.keys(s).length : 0;
      });
  }

  function _cacheLer(comKey, hoje) {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || c.comKey !== comKey || c.dia !== hoje || Date.now() - c.ts > CACHE_MS) return null;
      return { bloqueado: false, n: c.n, doCache: true };
    } catch (_) { return null; }
  }
  function _cacheGravar(comKey, hoje, n) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ comKey: comKey, dia: hoje, n: n, ts: Date.now() })); } catch (_) {}
  }
  function _cacheLimpar() { try { localStorage.removeItem(CACHE_KEY); } catch (_) {} }

  function verificar(sess, opts) {
    opts = opts || {};
    var livre = { bloqueado: false };
    try {
      if (!sess || !sess.loja) return Promise.resolve(livre);
      if (!opts.ignorarApp && String(location.pathname).indexOf(APP_DA_CORRECAO) >= 0) return Promise.resolve(livre);
      if (CARGOS_COBRADOS.indexOf(String(sess.cargo || '').toLowerCase()) < 0) return Promise.resolve(livre);
      if (String(sess.loja).toUpperCase() === 'GERAL' || LOJAS_FORA.indexOf(String(sess.loja).toUpperCase()) >= 0) return Promise.resolve(livre);
      var hoje = opts.hoje || _hojeISO();
      if (hoje < DESDE) return Promise.resolve(livre);
      var comKey = _comKey(sess.loja);
      if (!comKey || LOJAS_FORA.indexOf(comKey) >= 0) return Promise.resolve(livre);
      if (!opts.semCache) { var c = _cacheLer(comKey, hoje); if (c) return Promise.resolve(c); }
      return contarItens(comKey).then(function (n) {
        var r = { bloqueado: n < MINIMO, n: n };
        if (!r.bloqueado) _cacheGravar(comKey, hoje, n); else _cacheLimpar();
        return r;
      }).catch(function (e) { _log('utensMinimo:buscar', e); return livre; });
    } catch (e) { _log('utensMinimo:verificar', e); return Promise.resolve(livre); }
  }

  var _overlay = null;
  function _montar(res) {
    var el = document.createElement('div');
    el.id = 'gn-utens-minimo-bloqueio';
    el.setAttribute('style', 'position:fixed;inset:0;z-index:2147483644;background:#7c2d12;color:#fff;' +
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-y:auto;padding:22px 18px;box-sizing:border-box');
    var falta = Math.max(0, MINIMO - (res.n || 0));
    el.innerHTML =
      '<div style="max-width:520px;margin:0 auto">' +
        '<div style="font-size:40px;line-height:1">🍽️</div>' +
        '<div style="font-size:19px;font-weight:800;margin-top:8px">Cadastre os utensílios da loja</div>' +
        '<div style="font-size:13px;line-height:1.5;margin-top:8px;opacity:.95">' +
          'A loja precisa ter pelo menos <b>' + MINIMO + ' peças</b> cadastradas no controle de utensílios do ' +
          '<b>Check-list</b>. Hoje tem <b>' + (res.n || 0) + '</b> — faltam <b>' + falta + '</b>. ' +
          'Até completar, os apps ficam fechados para gerente e sub; só a aba Utensílios do Check-list abre.' +
        '</div>' +
        '<div style="background:rgba(0,0,0,.22);border-radius:12px;padding:12px 14px;margin-top:14px;font-size:12.5px;line-height:1.55">' +
          'No Check-list › Utensílios, toque em <b>📋 Contar</b> e informe quantas a loja tem de cada peça ' +
          '(copo, prato, talher, panela, travessa…). Cada peça contada conta uma vez.' +
        '</div>' +
        '<button id="gn-utens-ir" style="width:100%;margin-top:14px;background:#fff;color:#7c2d12;border:none;' +
          'border-radius:12px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit">' +
          '🍽️ Abrir Utensílios no Check-list</button>' +
        '<button id="gn-utens-rever" style="width:100%;margin-top:8px;background:transparent;color:#fff;' +
          'border:1px solid rgba(255,255,255,.5);border-radius:12px;padding:11px;font-size:13px;font-weight:700;' +
          'cursor:pointer;font-family:inherit">Já cadastrei — verificar de novo</button>' +
        '<div style="font-size:11px;opacity:.75;margin-top:12px;line-height:1.5">Supervisão e Master não são bloqueados.</div>' +
      '</div>';
    return el;
  }
  function mostrar(sess, res) {
    fechar();
    _overlay = _montar(res);
    _overlay.querySelector('#gn-utens-ir').onclick = function () { location.href = LINK; };
    var rev = _overlay.querySelector('#gn-utens-rever');
    rev.onclick = function () {
      rev.disabled = true; rev.textContent = 'Verificando…';
      _cacheLimpar();
      verificar(sess, { semCache: true }).then(function (r) {
        if (!r.bloqueado) { fechar(); return; }
        mostrar(sess, r);
      });
    };
    document.body.appendChild(_overlay);
  }
  function fechar() { if (_overlay) { _overlay.remove(); _overlay = null; } }

  // Sessão: mesma normalização do gn-validade-acesso (o Comandas grava {user:{...}}).
  var _ss = document.currentScript && document.currentScript.getAttribute('data-sessao');
  var SESS_KEY = _ss || 'gn_session_v1', TTL = 43200000;
  function _lerSessao() {
    try {
      var s = JSON.parse(localStorage.getItem(SESS_KEY) || 'null');
      if (!s || !s.ts || Date.now() - s.ts > TTL) return null;
      if (s.id) return s;
      if (s.user && s.user.id) return { id: s.user.id, nome: s.user.nome, loja: s.user.loja, cargo: s.user.cargo, ts: s.ts };
      return null;
    } catch (_) { return null; }
  }
  function _rodada(forcar) {
    var sess = _lerSessao();
    if (!sess) { fechar(); return; }
    verificar(sess, forcar ? { semCache: true } : {}).then(function (r) { if (r.bloqueado) mostrar(sess, r); else fechar(); });
  }
  function _iniciar() {
    _rodada();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) _rodada(true); });
    setInterval(function () { _rodada(!!_overlay); }, 5 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _iniciar);
  else _iniciar();

  window.gnUtensiliosMinimo = { MINIMO: MINIMO, DESDE: DESDE, verificar: verificar, contarItens: contarItens, mostrar: mostrar, fechar: fechar };
})();
