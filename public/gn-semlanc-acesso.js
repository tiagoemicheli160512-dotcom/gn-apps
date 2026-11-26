// ─── VALIDAÇÃO DA SEMANA (AVARIAS E UTENSÍLIOS) — REGRA E TRAVA EM TODOS OS APPS ──────────
// Regra criada em 16/11/2026 (Página Inicial): semana fechada sem nenhuma avaria / quebra de
// utensílio lançada → a gerência lança, ou confirma com a senha que "não houve". Sem resposta,
// da terça em diante o app trava pra gerente e sub.
//
// 23/11/2026 — "Pode corrigir" (os dois furos):
//  1. A trava só existia na Página Inicial: abrindo Check-list, Lojas, Caixa… direto, a
//     gerência passava. Este arquivo é carregado por todos os apps e trava os OUTROS (a Página
//     Inicial continua com a trava dela, que tem o formulário da senha). Mesmo desenho de
//     gn-utensilios-acesso.js e gn-validade-acesso.js.
//  2. A cobrança valia só pra ÚLTIMA semana fechada: na segunda seguinte a semana sem resposta
//     saía da cobrança e ficava pra sempre como "—" no Painel. Agora a semana pendente mais
//     ANTIGA (desde DESDE) é a cobrada até ser respondida — e semana atrasada (anterior à
//     última fechada) trava em qualquer dia, inclusive segunda.
//
// Onde NÃO trava (senão a loja fica presa sem ter como resolver): no app onde se resolve o
// que está pendente — Lojas (aba Avarias) quando falta avaria, Check-list (aba Utensílios)
// quando falta utensílio. E nunca na Página Inicial (lá é a trava dela).
//
// Falha aberto: sem sessão, sem rede, qualquer dúvida → passa. Maglia fora (não citada).
(function () {
  'use strict';

  var SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';

  // Primeira semana cobrada: a regra nasceu em 16/11, cobrando a semana 09–15/11.
  var DESDE = '2026-11-09';
  var JANELA_SEMANAS = 8;                 // olha no máximo 8 semanas pra trás
  var CARGOS = ['gerente', 'sub_gerente', 'subgerente'];
  var LOJAS_FORA = ['MAGLIA'];
  var TRAVA_DOW = 2;                      // terça (e domingo) — o mesmo calendário dos barris
  var CACHE_KEY = 'gn_semlanc_cache';
  var CACHE_MS = 5 * 60 * 1000;           // só o LIBERADO é cacheado

  var TIPOS = {
    avarias:    { linha: 'AVARIAS_SEM_SEMANA',    nome: 'Avarias',    nada: 'nenhuma avaria lançada',
                  lancar: '⚠️ Lançar avaria', url: 'gn-lojas.html?tab=avarias', app: 'gn-lojas' },
    utensilios: { linha: 'UTENSILIOS_SEM_SEMANA', nome: 'Utensílios', nada: 'nenhuma quebra de utensílio lançada',
                  lancar: '🍴 Lançar quebra', url: 'gn-checklist.html?tab=utensilios&novo=1', app: 'gn-checklist' },
  };

  function _log(ctx, e) { try { if (window.gnLogError) window.gnLogError(ctx, e); else console.error('[GN:' + ctx + ']', e); } catch (_) {} }
  function _iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function _addDias(iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return _iso(d); }
  // Segunda da última semana FECHADA (seg–dom anteriores a hoje).
  function _ultimaFechada(hoje) {
    var d = new Date(hoje || new Date()); d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
    return _iso(d);
  }
  function _semanas(hoje) {
    var ult = _ultimaFechada(hoje), out = [];
    for (var s = ult, n = 0; s >= DESDE && n < JANELA_SEMANAS; s = _addDias(s, -7), n++) out.unshift({ ini: s, fim: _addDias(s, 6) });
    return out;
  }
  function _contaAvaria(a) { return a && a.status !== 'cancelado' && a.tipo !== 'transferencia_dinheiro' && a.tipo !== 'saida_terceiro'; }
  function _diaLocal(ts) { var d = new Date(ts); return isNaN(d) ? '' : _iso(d); }
  function _contar(tipo, avariasAll, diasChk, ini, fim) {
    if (tipo === 'avarias') {
      if (!avariasAll) return null;
      var tudo = []; Object.keys(avariasAll).forEach(function (k) { if (Array.isArray(avariasAll[k])) tudo = tudo.concat(avariasAll[k]); });
      return tudo.filter(function (a) { return _contaAvaria(a) && (a.semana ? a.semana === ini : (_diaLocal(a.ts) >= ini && _diaLocal(a.ts) <= fim)); }).length;
    }
    if (!diasChk) return null;
    var n = 0;
    diasChk.forEach(function (d) {
      if (!(d.data_operacao >= ini && d.data_operacao <= fim) || !Array.isArray(d.manutencao)) return;
      d.manutencao.forEach(function (m) { if (m && m.tipo === 'Utensílio / Louça') n++; });
    });
    return n;
  }
  function _get(url) {
    return fetch(url, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function _lojaInfo(loja) {
    try { return window.gnLojaPorChave ? window.gnLojaPorChave(loja) : null; } catch (_) { return null; }
  }

  // Situação da loja: pra cada tipo, a semana pendente MAIS ANTIGA (ou, sem pendência, a
  // última fechada com o que a loja fez). null num tipo = não deu pra ler (não cobra).
  // Resolve null inteiro se as confirmações não carregarem (falha aberto).
  function calcular(lojaUserKey, opts) {
    opts = opts || {};
    try {
      var info = _lojaInfo(lojaUserKey);
      var uk = info && info.userKey ? info.userKey : lojaUserKey;
      var chk = info && info.chkKey ? info.chkKey : lojaUserKey;
      var sems = _semanas(opts.hoje);
      if (!sems.length) return Promise.resolve(null);
      var ultima = sems[sems.length - 1];
      var de = sems[0].ini, ate = ultima.fim;
      return Promise.all([
        _get(SB_URL + '/rest/v1/gn_lojas?loja=eq.' + encodeURIComponent(uk) + '&select=all_data'),
        _get(SB_URL + '/rest/v1/checklist_diario?loja=eq.' + encodeURIComponent(chk) + '&data_operacao=gte.' + de + '&data_operacao=lte.' + ate + '&select=data_operacao,manutencao'),
        _get(SB_URL + '/rest/v1/gn_lojas?loja=in.(' + TIPOS.avarias.linha + ',' + TIPOS.utensilios.linha + ')&select=loja,all_data'),
      ]).then(function (r) {
        var lojaRows = r[0], diasChk = r[1], confRows = r[2];
        if (confRows === null) return null;
        var avariasAll = lojaRows === null ? null : (((lojaRows[0] && lojaRows[0].all_data) || {}).avariasAll || {});
        var porTipo = {};
        Object.keys(TIPOS).forEach(function (tipo) {
          var conf = ((confRows.filter(function (x) { return x.loja === TIPOS[tipo].linha; })[0] || {}).all_data) || {};
          var achou = null, ultimaInfo = null, falhou = false;
          sems.forEach(function (w) {
            if (achou || falhou) return;
            var q = _contar(tipo, avariasAll, diasChk, w.ini, w.fim);
            if (q === null) { falhou = true; return; }
            var c = (conf[w.ini] || {})[uk] || null;
            var item = { loja: uk, semIni: w.ini, semFim: w.fim, qtd: q, conf: c, atrasada: w.ini < ultima.ini };
            if (q === 0 && !c) achou = item; else ultimaInfo = item;
          });
          porTipo[tipo] = falhou ? null : (achou || ultimaInfo);
        });
        return { ultimaIni: ultima.ini, porTipo: porTipo };
      }).catch(function (e) { _log('semLanc:calcular', e); return null; });
    } catch (e) { _log('semLanc:calcular', e); return Promise.resolve(null); }
  }
  function pendente(st) { return !!(st && st.qtd === 0 && !st.conf); }
  function pendentes(res) {
    if (!res || !res.porTipo) return [];
    return Object.keys(TIPOS).filter(function (t) { return pendente(res.porTipo[t]); });
  }
  // Trava: semana atrasada trava em qualquer dia; a última fechada, de terça (e domingo) em diante.
  function deveTravar(res, cargo, agora) {
    if (CARGOS.indexOf(String(cargo || '').toLowerCase()) < 0) return false;
    var p = pendentes(res); if (!p.length) return false;
    if (p.some(function (t) { return res.porTipo[t].atrasada; })) return true;
    var dow = (agora || new Date()).getDay();
    return dow === 0 || dow >= TRAVA_DOW;
  }

  window.gnSemLanc = { DESDE: DESDE, TIPOS: TIPOS, CARGOS: CARGOS, calcular: calcular, pendente: pendente,
                       pendentes: pendentes, deveTravar: deveTravar, _semanas: _semanas };

  // ── A trava dos outros apps ───────────────────────────────────────────────────────────
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
  function _app() { return String(location.pathname || ''); }
  function _cacheOk(chave) {
    try { var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return !!(c && c.chave === chave && Date.now() - c.ts < CACHE_MS); } catch (_) { return false; }
  }
  function _cacheGravar(chave) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ chave: chave, ts: Date.now() })); } catch (_) {} }
  function _cacheLimpar() { try { localStorage.removeItem(CACHE_KEY); } catch (_) {} }

  // Resolve {bloqueado, pend, res} — bloqueado só quando a resposta é inequívoca.
  function verificar(sess, opts) {
    opts = opts || {};
    var livre = { bloqueado: false };
    try {
      if (!sess || !sess.loja) return Promise.resolve(livre);
      var app = opts.app != null ? opts.app : _app();
      if (app.indexOf('gn-home') >= 0) return Promise.resolve(livre);           // a Página Inicial tem a trava dela
      if (CARGOS.indexOf(String(sess.cargo || '').toLowerCase()) < 0) return Promise.resolve(livre);
      var loja = String(sess.loja).toUpperCase();
      if (loja === 'GERAL' || LOJAS_FORA.indexOf(loja) >= 0) return Promise.resolve(livre);
      var hoje = opts.hoje || new Date();
      var chave = [sess.id, loja, _iso(hoje)].join('|');
      if (!opts.semCache && _cacheOk(chave)) return Promise.resolve(livre);
      return calcular(sess.loja, { hoje: hoje }).then(function (res) {
        if (!res) return livre;
        var pend = pendentes(res);
        var bloq = deveTravar(res, sess.cargo, hoje);
        // Registro dos bloqueios (Painel, 26/11/2026): a decisão ANTES da exceção abaixo — no
        // app onde se resolve a tela abre, mas a loja continua travada nos outros.
        if (window.gnTravasRegistro) window.gnTravasRegistro('semlanc', sess.loja, ['semlanc'],
          bloq ? [{ tipo: 'semlanc', detalhe: pend.map(function (t) { return TIPOS[t].nome; }).join(', ') }] : []);
        // No app onde se resolve uma das pendências, não trava: senão não há como lançar.
        if (bloq && pend.some(function (t) { return app.indexOf(TIPOS[t].app) >= 0; })) bloq = false;
        if (!bloq) _cacheGravar(chave); else _cacheLimpar();
        return { bloqueado: bloq, pend: pend, res: res };
      }).catch(function (e) { _log('semLanc:verificar', e); return livre; });
    } catch (e) { _log('semLanc:verificar', e); return Promise.resolve(livre); }
  }

  var _overlay = null;
  function _dm(i) { return String(i).slice(8, 10) + '/' + String(i).slice(5, 7); }
  function mostrar(sess, r) {
    fechar();
    var el = document.createElement('div');
    el.id = 'gn-semlanc-bloqueio';
    el.setAttribute('style', 'position:fixed;inset:0;z-index:2147483643;background:#7f1d1d;color:#fff;' +
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-y:auto;padding:22px 18px;box-sizing:border-box');
    var linhas = r.pend.map(function (t) {
      var st = r.res.porTipo[t], T = TIPOS[t];
      return '<div style="background:rgba(0,0,0,.22);border-radius:12px;padding:11px 13px;margin-top:10px">' +
        '<div style="font-size:13px;font-weight:800">' + T.nome + ' da semana ' + _dm(st.semIni) + ' a ' + _dm(st.semFim) + (st.atrasada ? ' · <span style="color:#fecaca">atrasada</span>' : '') + '</div>' +
        '<div style="font-size:12px;opacity:.9;margin-top:2px">' + T.nada + '. Lance o que houve, ou a gerência/sub confirma que não houve.</div>' +
        '<button data-ir="' + T.url + '" style="width:100%;margin-top:8px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,.55);border-radius:10px;padding:9px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit">' + T.lancar + '</button>' +
      '</div>';
    }).join('');
    el.innerHTML = '<div style="max-width:520px;margin:0 auto">' +
      '<div style="font-size:40px;line-height:1">📋</div>' +
      '<div style="font-size:19px;font-weight:800;margin-top:8px">Validação da semana pendente</div>' +
      '<div style="font-size:13px;line-height:1.5;margin-top:8px;opacity:.95">Até responder, os apps ficam fechados pra gerente e sub. ' +
        'A confirmação de "não houve" (com a senha) é na <b>Página Inicial</b>.</div>' +
      linhas +
      '<button id="gn-semlanc-home" style="width:100%;margin-top:14px;background:#fff;color:#7f1d1d;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit">Abrir a Página Inicial pra confirmar</button>' +
      '<button id="gn-semlanc-rever" style="width:100%;margin-top:8px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:12px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Já resolvi — verificar de novo</button>' +
      '<div style="font-size:11px;opacity:.75;margin-top:12px;line-height:1.5">Supervisão e Master não são bloqueados.</div>' +
    '</div>';
    [].forEach.call(el.querySelectorAll('[data-ir]'), function (b) { b.onclick = function () { location.href = b.getAttribute('data-ir'); }; });
    el.querySelector('#gn-semlanc-home').onclick = function () { location.href = 'gn-home.html'; };
    var rev = el.querySelector('#gn-semlanc-rever');
    rev.onclick = function () {
      rev.disabled = true; rev.textContent = 'Verificando…';
      _cacheLimpar();
      verificar(sess, { semCache: true }).then(function (x) { if (!x.bloqueado) fechar(); else mostrar(sess, x); });
    };
    document.body.appendChild(el);
    _overlay = el;
  }
  function fechar() { if (_overlay) { _overlay.remove(); _overlay = null; } }
  window.gnSemLanc.verificar = verificar;
  window.gnSemLanc.mostrar = mostrar;
  window.gnSemLanc.fechar = fechar;

  function _rodada(forcar) {
    var sess = _lerSessao();
    if (!sess) { fechar(); return; }
    verificar(sess, forcar ? { semCache: true } : {}).then(function (r) { if (r.bloqueado) mostrar(sess, r); else fechar(); });
  }
  function _iniciar() {
    if (_app().indexOf('gn-home') >= 0) return;   // a Página Inicial usa só a regra (window.gnSemLanc)
    _rodada();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) _rodada(true); });
    setInterval(function () { _rodada(!!_overlay); }, 5 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _iniciar);
  else _iniciar();
})();
