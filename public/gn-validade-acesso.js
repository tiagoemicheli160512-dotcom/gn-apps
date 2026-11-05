// ─── BLOQUEIO DE ACESSO COM PRODUTO VENCIDO ──────────────────────────────────
// Combinado com o dono: se a loja tem produto vencido na lista de validades, o app fecha
// até resolver. A fonte é a mesma lista que a loja já preenche no Check-list, aba
// Check-list, nos itens de validade por setor — nada de cadastro paralelo.
//
// Carregado por todos os apps e se vira sozinho, igual ao gn-escala-acesso.js: lê a sessão
// do localStorage e cobre a tela quando é o caso. Nenhum app precisa chamar nada.
//
// ── O CHECK-LIST FICA DE FORA, E ISSO É A PARTE IMPORTANTE ───────────────────
// O lugar de corrigir a validade é o próprio Check-list. Se o bloqueio fechasse ele também,
// a loja ficaria trancada por dentro: sem como arrumar o que destrava. Então o Check-list
// é o único app que este guardião nunca cobre — é a porta de saída, e ela fica aberta de
// propósito. Mexer nisso tranca a rede inteira.
//
// ── FALHA ABERTO ────────────────────────────────────────────────────────────
// Qualquer dúvida libera: sem internet, sem lista cadastrada, sessão estranha, erro de
// qualquer natureza — passa. Travar a loja por um blip de rede é um estrago muito maior do
// que deixar passar um dia com item vencido. Só bloqueia quando a resposta é inequívoca:
// existe item com data anterior a hoje na lista daquela loja.
//
// ── O QUE DESTRAVA ──────────────────────────────────────────────────────────
// Não sobrar nenhum vencido. Vale corrigir a data OU excluir o item — produto vencido se
// descarta, não se re-data. Apagar tudo pra escapar não resolve: o Check-list exige um
// mínimo de itens por setor (10 no salão/copa/estoque, 20 na cozinha e nas câmaras) e
// bloqueia o visto do setor abaixo disso.
(function () {
  'use strict';

  var SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';

  // A porta de saída. Nunca cobrir este app — ver o bloco no topo.
  var APP_DA_CORRECAO = 'gn-checklist';
  // Quem supervisiona precisa entrar justamente pra cobrar a correção. Mesmo critério do
  // bloqueio de folga/férias que já está no ar.
  var CARGOS_LIVRES = ['mestre', 'supervisor'];
  // Maglia não entra: o pedido não citou a Maglia (ver CLAUDE.md), e ela não usa a lista de
  // validades. Fica explícito aqui em vez de depender de ela não ter linha no banco.
  var LOJAS_FORA = ['MAGLIA'];

  var CACHE_KEY = 'gn_validade_cache';
  var CACHE_MS = 5 * 60 * 1000;   // só o resultado LIBERADO é cacheado (ver _cacheLer)

  function _log(ctx, e) {
    try { if (window.gnLogError) window.gnLogError(ctx, e); else console.error('[GN:' + ctx + ']', e); }
    catch (_) {}
  }

  function _hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function _brData(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(iso || '');
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  // Rótulo de cada área, pra tela dizer ONDE está o vencido em vez de só dizer que existe.
  // Espelha VALIDADE_AREAS_DEF do Check-list; área desconhecida cai no próprio nome, então
  // criar uma área nova lá não quebra nada aqui.
  var AREA_LABEL = { salao: 'Salão', cozinha: 'Cozinha', copa: 'Copa / Bar',
                     estoque: 'Estoque', camaras: 'Câmaras frias' };

  // ── Leitura ────────────────────────────────────────────────────────────────
  // A chave da linha é VALIDADES_<comKey>_<area> (ver _valLinha no Check-list). Busca por
  // prefixo pra não precisar repetir aqui a lista de áreas — se o Check-list ganhar uma
  // área nova, ela entra sozinha. O filtro exato depois é porque o `_` do LIKE casa
  // qualquer caractere.
  function _comKey(sess) {
    try {
      if (window.gnLojaPorChave) {
        var l = window.gnLojaPorChave(sess.loja);
        if (l && l.comKey) return l.comKey;
      }
    } catch (_) {}
    return null;
  }

  function _buscarItens(comKey) {
    var prefixo = 'VALIDADES_' + comKey + '_';
    var url = SB_URL + '/rest/v1/gn_lojas?loja=like.' + encodeURIComponent(prefixo + '*') + '&select=loja,all_data';
    return fetch(url, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        var re = new RegExp('^' + prefixo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-z_]+$');
        var out = [];
        (rows || []).forEach(function (row) {
          if (!re.test(row.loja)) return;   // o `_` do LIKE casa qualquer caractere
          var area = row.loja.slice(prefixo.length);
          var itens = (row.all_data && row.all_data.itens) || [];
          if (!Array.isArray(itens)) return;
          itens.forEach(function (it) {
            if (it && it.nome && it.validade) out.push({ area: area, nome: it.nome, validade: it.validade });
          });
        });
        return out;
      });
  }

  // ── A regra ────────────────────────────────────────────────────────────────
  function _avaliar(itens, hojeISO) {
    var vencidos = (itens || []).filter(function (it) {
      return /^\d{4}-\d{2}-\d{2}$/.test(it.validade) && it.validade < hojeISO;
    });
    vencidos.sort(function (a, b) { return a.validade < b.validade ? -1 : a.validade > b.validade ? 1 : 0; });
    var porArea = {};
    vencidos.forEach(function (it) { (porArea[it.area] = porArea[it.area] || []).push(it); });
    return { bloqueado: vencidos.length > 0, vencidos: vencidos, porArea: porArea };
  }

  // ── Cache: só o liberado ───────────────────────────────────────────────────
  // Guardar o BLOQUEADO deixaria a loja travada depois de já ter corrigido, que é o pior
  // momento possível pra uma tela teimosa.
  function _cacheLer(comKey, hojeISO) {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || c.comKey !== comKey || c.dia !== hojeISO) return null;
      if (Date.now() - c.ts > CACHE_MS) return null;
      return { bloqueado: false, vencidos: [], porArea: {}, doCache: true };
    } catch (_) { return null; }
  }
  function _cacheGravar(comKey, hojeISO) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ comKey: comKey, dia: hojeISO, ts: Date.now() })); }
    catch (_) {}
  }
  function _cacheLimpar() { try { localStorage.removeItem(CACHE_KEY); } catch (_) {} }

  // ── Verificação ────────────────────────────────────────────────────────────
  function verificar(sess, opts) {
    opts = opts || {};
    var livre = { bloqueado: false, vencidos: [], porArea: {} };
    try {
      if (!sess || !sess.loja) return Promise.resolve(livre);
      // O Check-list é a porta de saída — nunca cobrir.
      if (!opts.ignorarApp && String(location.pathname).indexOf(APP_DA_CORRECAO) >= 0) return Promise.resolve(livre);
      var cargo = String(sess.cargo || '').toLowerCase();
      if (CARGOS_LIVRES.indexOf(cargo) >= 0) return Promise.resolve(livre);
      if (String(sess.loja).toUpperCase() === 'GERAL') return Promise.resolve(livre);
      var comKey = _comKey(sess);
      if (!comKey || LOJAS_FORA.indexOf(comKey) >= 0) return Promise.resolve(livre);

      var hoje = opts.hoje || _hojeISO();
      if (!opts.semCache) {
        var c = _cacheLer(comKey, hoje);
        if (c) return Promise.resolve(c);
      }
      return _buscarItens(comKey).then(function (itens) {
        var r = _avaliar(itens, hoje);
        if (!r.bloqueado) _cacheGravar(comKey, hoje); else _cacheLimpar();
        return r;
      }).catch(function (e) {
        _log('validadeAcesso:buscar', e);
        return livre;   // falha aberto
      });
    } catch (e) {
      _log('validadeAcesso:verificar', e);
      return Promise.resolve(livre);
    }
  }

  // ── A tela ─────────────────────────────────────────────────────────────────
  var _overlay = null;

  function _listaHtml(res) {
    var areas = Object.keys(res.porArea);
    return areas.map(function (a) {
      var itens = res.porArea[a];
      var linhas = itens.slice(0, 6).map(function (it) {
        return '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-size:12px">' +
               '<span style="flex:1;min-width:0;word-break:break-word">' + _esc(it.nome) + '</span>' +
               '<span style="flex-shrink:0;font-weight:700;color:#fca5a5">' + _esc(_brData(it.validade)) + '</span></div>';
      }).join('');
      var resto = itens.length > 6 ? '<div style="font-size:11px;opacity:.7;margin-top:2px">+ ' + (itens.length - 6) + ' no mesmo setor</div>' : '';
      return '<div style="margin-top:10px">' +
             '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;opacity:.8">' +
             _esc(AREA_LABEL[a] || a) + ' · ' + itens.length + '</div>' + linhas + resto + '</div>';
    }).join('');
  }

  function _montarTela(sess, res) {
    var el = document.createElement('div');
    el.id = 'gn-validade-bloqueio';
    el.setAttribute('style', 'position:fixed;inset:0;z-index:2147483646;background:#7f1d1d;color:#fff;' +
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-y:auto;padding:22px 18px;box-sizing:border-box');
    el.innerHTML =
      '<div style="max-width:520px;margin:0 auto">' +
        '<div style="font-size:40px;line-height:1">⛔</div>' +
        '<div style="font-size:19px;font-weight:800;margin-top:8px">Produto vencido na lista de validades</div>' +
        '<div style="font-size:13px;line-height:1.5;margin-top:8px;opacity:.95">' +
          'O acesso aos apps fica fechado enquanto houver item vencido. Abra o <b>Check-list</b>, ' +
          'na aba Check-list, e resolva cada um: <b>corrija a data</b> se estiver errada, ou ' +
          '<b>exclua o item</b> se o produto foi descartado.' +
        '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:12px;padding:12px 14px;margin-top:14px">' +
          '<div style="font-size:12px;font-weight:800">' + res.vencidos.length + ' item(ns) vencido(s)</div>' +
          _listaHtml(res) +
        '</div>' +
        '<button id="gn-val-ir" style="width:100%;margin-top:14px;background:#fff;color:#7f1d1d;border:none;' +
          'border-radius:12px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit">' +
          '📋 Abrir o Check-list e corrigir</button>' +
        '<button id="gn-val-revalidar" style="width:100%;margin-top:8px;background:transparent;color:#fff;' +
          'border:1px solid rgba(255,255,255,.5);border-radius:12px;padding:11px;font-size:13px;font-weight:700;' +
          'cursor:pointer;font-family:inherit">Já corrigi — verificar de novo</button>' +
        '<div style="font-size:11px;opacity:.75;margin-top:12px;line-height:1.5">' +
          'Se alguma data estiver errada no cadastro e não houver produto vencido de verdade, ' +
          'corrigir a data no Check-list libera na hora. Mestre e supervisão não são bloqueados.' +
        '</div>' +
      '</div>';
    return el;
  }

  function _ligarBotoes(el, sess) {
    var ir = el.querySelector('#gn-val-ir');
    if (ir) ir.onclick = function () { location.href = 'gn-checklist.html'; };
    var rev = el.querySelector('#gn-val-revalidar');
    if (rev) rev.onclick = function () {
      rev.disabled = true; rev.textContent = 'Verificando…';
      _cacheLimpar();
      verificar(sess, { semCache: true }).then(function (r) {
        if (!r.bloqueado) { fechar(); return; }
        rev.disabled = false; rev.textContent = 'Ainda há vencido — verificar de novo';
        var novo = _montarTela(sess, r);
        el.innerHTML = novo.innerHTML;
        _ligarBotoes(el, sess);
      });
    };
  }

  function mostrar(sess, res) {
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _overlay = _montarTela(sess, res);
    _ligarBotoes(_overlay, sess);
    document.body.appendChild(_overlay);
  }

  function fechar() {
    if (!_overlay) return;
    _overlay.remove();
    _overlay = null;
  }

  // ── O guardião ─────────────────────────────────────────────────────────────
  function _chaveSessao() {
    var s = document.currentScript && document.currentScript.getAttribute('data-sessao');
    return s || 'gn_session_v1';
  }
  var SESS_KEY = _chaveSessao();
  var TTL = 43200000;

  // O Comandas grava {user:{...}}; os outros gravam achatado. Sem normalizar, lá sess.loja
  // viria do topo (a loja escolhida ao entrar) em vez do usuário.
  function _normalizarSessao(s) {
    if (!s) return null;
    if (s.id) return s;
    if (s.user && s.user.id) {
      return { id: s.user.id, nome: s.user.nome, loja: s.user.loja,
               cargo: s.user.cargo, permissoes: s.user.permissoes || {}, ts: s.ts };
    }
    return null;
  }

  function _lerSessao() {
    try {
      var s = JSON.parse(localStorage.getItem(SESS_KEY) || 'null');
      if (!s || !s.ts || Date.now() - s.ts > TTL) return null;
      return _normalizarSessao(s);
    } catch (_) { return null; }
  }

  function _rodada(forcar) {
    var sess = _lerSessao();
    if (!sess) { fechar(); return; }
    verificar(sess, forcar ? { semCache: true } : {}).then(function (res) {
      if (res.bloqueado) mostrar(sess, res);
      else fechar();
    });
  }

  function _iniciar() {
    _rodada();
    // Voltar pra aba é exatamente o que acontece depois de corrigir no Check-list — é o
    // momento em que a releitura mais importa, então ela ignora o cache.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) _rodada(true);
    });
    setInterval(function () { _rodada(!!_overlay); }, 5 * 60 * 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _iniciar);
  else _iniciar();

  window.gnValidadeAcesso = {
    verificar: verificar,
    mostrar: mostrar,
    fechar: fechar,
    _avaliar: _avaliar,
    _hojeISO: _hojeISO,
    AREA_LABEL: AREA_LABEL,
    CARGOS_LIVRES: CARGOS_LIVRES,
    APP_DA_CORRECAO: APP_DA_CORRECAO
  };
})();
