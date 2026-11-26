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
// existe item com data anterior a hoje na lista daquela loja. O que vence HOJE não trava até
// passou da meia-noite. Das 22h à meia-noite, o que vence hoje só AVISA (HORA_AVISO_HOJE).
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

  // ── O QUE VENCE HOJE: LISTA ÀS 22H, TRAVA À MEIA-NOITE (22/11/2026) ─────────
  // "Aconteceu em Bangu que o caixa não foi fechado porque as etiquetas vencendo na data de
  // ontem travaram o app após 00h. O que podemos fazer é trocar a regra de travamento até
  // 20h do dia que tá vencendo. Até porque não pode ficar data vencida pro dia seguinte,
  // nunca." Antes a trava só vinha à meia-noite, no meio do fechamento do caixa. Depois o
  // dono ajustou: "mudar pras 10h e, ao invés de travar, pois não virou vencida ainda, abrir
  // a lista pra ser trocada antes de travar", e por fim fixou: a lista às 22h e a trava à
  // meia-noite. Então, no dia do vencimento:
  //   · das 22h à meia-noite abre a lista do que vence hoje, SEM travar (dá pra fechar;
  //     volta em 1h);
  //   · à meia-noite o item vira vencido e trava, como sempre foi.
  // HORA_TRAVA_HOJE = 24 quer dizer "o próprio dia nunca trava" — a trava é a do vencido.
  var HORA_AVISO_HOJE = 22;
  var HORA_TRAVA_HOJE = 24;
  var AVISO_ADIA_MS = 60 * 60 * 1000;
  var AVISO_KEY = 'gn_validade_aviso_adiado';

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
  // `hora`: a hora de agora (0–23). Sem ela, só o vencido de dias anteriores conta.
  function _avaliar(itens, hojeISO, hora) {
    var travaHoje = typeof hora === 'number' && hora >= HORA_TRAVA_HOJE;
    var vencidos = (itens || []).filter(function (it) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(it.validade)) return false;
      return it.validade < hojeISO || (travaHoje && it.validade === hojeISO);
    });
    vencidos.sort(function (a, b) { return a.validade < b.validade ? -1 : a.validade > b.validade ? 1 : 0; });
    var porArea = {};
    vencidos.forEach(function (it) { (porArea[it.area] = porArea[it.area] || []).push(it); });
    // Vence hoje e ainda não é hora de travar: só a lista pra trocar.
    var avisoHoje = typeof hora === 'number' && hora >= HORA_AVISO_HOJE && !travaHoje;
    var avisos = avisoHoje ? (itens || []).filter(function (it) { return it.validade === hojeISO; }) : [];
    var porAreaAviso = {};
    avisos.forEach(function (it) { (porAreaAviso[it.area] = porAreaAviso[it.area] || []).push(it); });
    return { bloqueado: vencidos.length > 0, vencidos: vencidos, porArea: porArea,
             avisos: avisos, porAreaAviso: porAreaAviso };
  }

  // ── Cache: só o liberado ───────────────────────────────────────────────────
  // Guardar o BLOQUEADO deixaria a loja travada depois de já ter corrigido, que é o pior
  // momento possível pra uma tela teimosa.
  function _faixa(h) { return h < HORA_AVISO_HOJE ? 0 : h < HORA_TRAVA_HOJE ? 1 : 2; }
  function _cacheLer(comKey, hojeISO) {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || c.comKey !== comKey || c.dia !== hojeISO) return null;
      // O liberado das 19h59 não vale às 20h: é a hora em que o que vence hoje passa a travar.
      // Mudou de faixa (antes das 10h / aviso / depois das 22h): o liberado de antes não vale.
      if (c.faixa !== _faixa(new Date().getHours())) return null;
      if (Date.now() - c.ts > CACHE_MS) return null;
      return { bloqueado: false, vencidos: [], porArea: {}, avisos: [], porAreaAviso: {}, doCache: true };
    } catch (_) { return null; }
  }
  function _cacheGravar(comKey, hojeISO) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ comKey: comKey, dia: hojeISO, ts: Date.now(), faixa: _faixa(new Date().getHours()) })); }
    catch (_) {}
  }
  function _cacheLimpar() { try { localStorage.removeItem(CACHE_KEY); } catch (_) {} }

  // ── Verificação ────────────────────────────────────────────────────────────
  function verificar(sess, opts) {
    opts = opts || {};
    var livre = { bloqueado: false, vencidos: [], porArea: {}, avisos: [], porAreaAviso: {} };
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
      var hora = typeof opts.hora === 'number' ? opts.hora : (opts.hoje ? null : new Date().getHours());
      if (!opts.semCache) {
        var c = _cacheLer(comKey, hoje);
        if (c) return Promise.resolve(c);
      }
      return _buscarItens(comKey).then(function (itens) {
        var r = _avaliar(itens, hoje, hora);
        r.hoje = hoje;
        // Só o "nada a fazer" vai pro cache: com aviso, a lista tem que poder voltar.
        if (!r.bloqueado && !r.avisos.length) _cacheGravar(comKey, hoje); else _cacheLimpar();
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

  function _listaHtml(res, porArea) {
    porArea = porArea || res.porArea;
    var areas = Object.keys(porArea);
    return areas.map(function (a) {
      var itens = porArea[a];
      var linhas = itens.slice(0, 6).map(function (it) {
        return '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-size:12px">' +
               '<span style="flex:1;min-width:0;word-break:break-word">' + _esc(it.nome) + '</span>' +
               '<span style="flex-shrink:0;font-weight:700;color:#fca5a5">' + (it.validade === res.hoje ? 'vence hoje' : _esc(_brData(it.validade))) + '</span></div>';
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
        '<div style="font-size:19px;font-weight:800;margin-top:8px">' +
          (res.vencidos.some(function (it) { return it.validade < res.hoje; }) ? 'Produto vencido na lista de validades' : 'Produto vencendo hoje na lista de validades') + '</div>' +
        '<div style="font-size:13px;line-height:1.5;margin-top:8px;opacity:.95">' +
          'O acesso aos apps fica fechado enquanto houver item vencido. Abra o <b>Check-list</b>, ' +
          'na aba Check-list, e resolva cada um: <b>corrija a data</b> se estiver errada, ou ' +
          '<b>exclua o item</b> se o produto foi descartado. A lista do que vence no dia abre às ' +
          HORA_AVISO_HOJE + 'h, pra trocar antes da meia-noite.' +
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

  // ── O aviso (10h–22h): a mesma lista, mas dá pra fechar ─────────────────────
  var _aviso = null;
  function _avisoAdiado() { try { return Number(localStorage.getItem(AVISO_KEY) || 0) > Date.now(); } catch (_) { return false; } }
  function fecharAviso() { if (_aviso) { _aviso.remove(); _aviso = null; } }
  function mostrarAviso(sess, res) {
    fecharAviso();
    var el = document.createElement('div');
    el.id = 'gn-validade-aviso';
    el.setAttribute('style', 'position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.55);' +
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-y:auto;padding:22px 16px;box-sizing:border-box');
    el.innerHTML =
      '<div style="max-width:520px;margin:0 auto;background:#78350f;color:#fff;border-radius:16px;padding:18px 16px">' +
        '<div style="font-size:32px;line-height:1">⏳</div>' +
        '<div style="font-size:18px;font-weight:800;margin-top:6px">' + res.avisos.length + ' item(ns) vencendo hoje</div>' +
        '<div style="font-size:13px;line-height:1.5;margin-top:6px;opacity:.95">' +
          'Troque agora, no <b>Check-list</b> (aba Check-list): <b>corrija a data</b> da etiqueta nova ou ' +
          '<b>exclua o item</b> se foi descartado. Se à <b>meia-noite</b> ainda houver item ' +
          'vencido, os apps travam — inclusive o fechamento do caixa.' +
        '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:12px;padding:10px 14px;margin-top:12px">' +
          _listaHtml({ hoje: res.hoje }, res.porAreaAviso) + '</div>' +
        '<button id="gn-val-aviso-ir" style="width:100%;margin-top:14px;background:#fff;color:#78350f;border:none;' +
          'border-radius:12px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit">' +
          '📋 Abrir o Check-list e trocar</button>' +
        '<button id="gn-val-aviso-depois" style="width:100%;margin-top:8px;background:transparent;color:#fff;' +
          'border:1px solid rgba(255,255,255,.5);border-radius:12px;padding:11px;font-size:13px;font-weight:700;' +
          'cursor:pointer;font-family:inherit">Lembrar em 1 hora</button>' +
      '</div>';
    el.querySelector('#gn-val-aviso-ir').onclick = function () { location.href = 'gn-checklist.html'; };
    el.querySelector('#gn-val-aviso-depois').onclick = function () {
      try { localStorage.setItem(AVISO_KEY, String(Date.now() + AVISO_ADIA_MS)); } catch (_) {}
      fecharAviso();
    };
    _aviso = el;
    document.body.appendChild(el);
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
      // Registro dos bloqueios (Painel, 26/11/2026): só avaliação de verdade (com `hoje`, ou o
      // cache do "nada a fazer") — o "livre" de cargo não cobrado/erro não pode dar baixa.
      if (window.gnTravasRegistro && res && (res.hoje || res.doCache)) window.gnTravasRegistro('validade', sess.loja, ['validade'],
        res.bloqueado ? [{ tipo: 'validade', detalhe: (res.vencidos || []).length + ' item(ns) vencido(s)' }] : []);
      if (res.bloqueado) { fecharAviso(); mostrar(sess, res); return; }
      fechar();
      if (res.avisos && res.avisos.length && !_avisoAdiado()) { if (!_aviso) mostrarAviso(sess, res); }
      else fecharAviso();
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
    HORA_TRAVA_HOJE: HORA_TRAVA_HOJE,
    HORA_AVISO_HOJE: HORA_AVISO_HOJE,
    mostrarAviso: mostrarAviso,
    fecharAviso: fecharAviso,
    AREA_LABEL: AREA_LABEL,
    CARGOS_LIVRES: CARGOS_LIVRES,
    APP_DA_CORRECAO: APP_DA_CORRECAO
  };
})();
