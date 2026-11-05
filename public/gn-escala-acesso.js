// ─── BLOQUEIO DE ACESSO NA FOLGA E NAS FÉRIAS ────────────────────────────────
// Combinado com o dono: quem está de férias ou de folga não entra no app. A fonte é a
// mesma escala que a loja já preenche no Check-list (aba Escala e aba Dados) — nada de
// cadastro paralelo, pra não existir duas verdades sobre quem está trabalhando hoje.
//
// Este arquivo é carregado por todos os apps e se vira sozinho: lê a sessão salva no
// localStorage (a mesma `gn_session_v1` que todos usam) e, se a pessoa não deveria estar
// entrando hoje, cobre a tela. Não precisa de chamada nenhuma dentro do app — foi de
// propósito: encaixar isso em 13 telas de login diferentes era 26 pontos de falha.
//
// ── A REGRA QUE NÃO SE QUEBRA: ISTO FALHA ABERTO ─────────────────────────────
// Qualquer dúvida libera. Sem internet, sem escala cadastrada, sem vínculo, erro de
// qualquer natureza: passa. Um gerente trancado na porta da loja por causa de um blip de
// rede é um estrago muito maior do que alguém abrir o app na folga. Só bloqueia quando a
// resposta é inequívoca: a pessoa está vinculada a uma linha da escala, e aquela linha diz
// folga ou férias hoje.
//
// ── POR QUE PRECISA DE VÍNCULO ───────────────────────────────────────────────
// O nome do login e o nome da escala não são a mesma coisa, e não dá pra adivinhar. Em
// Caxias o login é `Renata` e a escala diz `Renata SANTOS - gerente`; o login `Marquinhos`
// é o `Marcos VINICIUS - gerente`; e existe um `Kelven SOUZA- garçom` que não é o
// `Kelvin` sub-gerente. Casar por primeiro nome acertaria a maioria e erraria algumas — e
// errar aqui é trancar a pessoa errada. Então o vínculo é explícito, gravado em
// `permissoes.escala_nome` pelo app Usuários (que sugere o nome quando bate, mas só vale
// depois de salvo). Sem vínculo, não bloqueia.
(function () {
  'use strict';

  var SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';

  // ── Quem passa mesmo de folga ou de férias ─────────────────────────────────
  // Por ID, nunca por nome: existem três Renatas no cadastro (Renata de Caxias, Renata
  // Soares de Nova América e Renata rh do administrativo). Casar por nome trancaria ou
  // liberaria a pessoa errada.
  var EXCECOES_FIXAS = [
    { id: 1, ref: 'Renata — gerente de Caxias' }
  ];

  // Cargos que podem liberar o acesso de outra pessoa na hora, com senha.
  var CARGOS_LIBERAM = ['supervisor', 'mestre'];

  // Status da escala que fecham a porta. AFASTAMENTO ficou de fora de propósito: o pedido
  // foi férias e folga. (O período da aba Dados é outra história — ver _periodoDados.)
  var DIA_BLOQUEIA = { 'FOLGA': 'folga', 'FÉRIAS': 'ferias' };

  var CACHE_MS = 5 * 60 * 1000;   // só o resultado LIBERADO é cacheado (ver _cacheLer)
  var LIB_KEY = 'gn_escala_liberacao';
  var CACHE_KEY = 'gn_escala_cache';

  // ── Semana do calendário ───────────────────────────────────────────────────
  // O índice da semana é a chave de gn_comissoes.all_data e não guarda ano (ver CLAUDE.md).
  // Quando o app carregou gn-comissoes-calendario.js, usamos ele — é a fonte canônica.
  // Quando não carregou (a maioria dos apps não carrega, e o arquivo tem 74 KB), caímos na
  // mesma âncora que o _buildCAL() do app de Comissões usa: 05/01/2026 é o índice 0 e cada
  // semana anda 7 dias. As duas contas TÊM que dar o mesmo número; quando o calendário está
  // presente e discorda, a conta por âncora é descartada e fica o registro do erro.
  var ANCORA = Date.UTC(2026, 0, 5);  // segunda-feira do índice 0

  function _semIdxAncora(dt) {
    var seg = Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate() - ((dt.getDay() + 6) % 7));
    var idx = Math.round((seg - ANCORA) / 604800000);
    return idx >= 0 ? idx : null;
  }
  function _semIdxCalendario(dt) {
    if (typeof COMISSOES_CAL === 'undefined' || !Array.isArray(COMISSOES_CAL)) return undefined;
    var d = dt.getDate(), m = dt.getMonth() + 1, y = dt.getFullYear();
    var i = COMISSOES_CAL.findIndex(function (w) {
      return w.days.some(function (x) { return x.d === d && x.m === m && x.y === y; });
    });
    return i >= 0 ? i : null;
  }
  function _semIdx(dt) {
    var doCal = _semIdxCalendario(dt);
    if (doCal === undefined) return _semIdxAncora(dt);   // app sem calendário carregado
    var daAncora = _semIdxAncora(dt);
    if (doCal !== null && daAncora !== null && doCal !== daAncora) {
      _log('escalaAcesso:semana', new Error(
        'Calendário e âncora discordam da semana (' + doCal + ' vs ' + daAncora + '). ' +
        'Alguém mexeu na ordem de gn-comissoes-calendario.js?'));
    }
    return doCal;
  }
  function _diaIdx(dt) { return (dt.getDay() + 6) % 7; }   // Seg=0 … Dom=6

  // ── Utilidades ─────────────────────────────────────────────────────────────
  function _log(tag, e) { try { window.gnLogError && window.gnLogError(tag, e); } catch (_) {} }
  function _hojeISO(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' +
           String(dt.getDate()).padStart(2, '0');
  }
  function _brData(iso) {
    if (!iso || iso.length < 10) return '';
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _norm(s) {
    return String(s || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  // Primeiro nome, ignorando o que vem depois do hífen (a escala escreve
  // "Renata SANTOS - gerente", com o setor colado no nome).
  function _primeiroNome(s) {
    var limpo = String(s || '').split('-')[0];
    return _norm(limpo).split(/\s+/).filter(Boolean)[0] || '';
  }

  // gnLojaPorChave (gn-lojas-config.js) é a fonte única: aceita a chave em qualquer formato
  // e devolve a loja. É ela que sabe que NORTE SHOPPING vira NORTE em gn_comissoes.
  function _comKey(lojaDoLogin) {
    try {
      var l = window.gnLojaPorChave && window.gnLojaPorChave(lojaDoLogin);
      if (l && l.comKey) return l.comKey;
    } catch (_) {}
    return null;
  }

  function _fetchJson(url) {
    return fetch(url, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // ── Cache ──────────────────────────────────────────────────────────────────
  // Só guarda o LIBERADO, e por pouco tempo. O bloqueado nunca é cacheado de propósito:
  // quem está olhando pra parede quer que ela caia no instante em que a escala for
  // corrigida, não daqui a cinco minutos.
  function _cacheLer(chave) {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || c.chave !== chave || Date.now() - c.ts > CACHE_MS) return null;
      return c.res;
    } catch (_) { return null; }
  }
  function _cacheGravar(chave, res) {
    if (res && res.bloqueado) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ chave: chave, ts: Date.now(), res: res })); } catch (_) {}
  }

  // ── Liberação por senha de supervisão ──────────────────────────────────────
  // Vale pro dia, pra aquela pessoa, e atravessa os apps (mesmo domínio, mesmo
  // localStorage) — quem foi chamado às pressas não vai digitar senha em cada tela.
  function _liberacaoAtiva(sess, hojeISO) {
    try {
      var l = JSON.parse(localStorage.getItem(LIB_KEY) || 'null');
      if (!l || l.dia !== hojeISO) return null;
      if (String(l.uid) !== String(sess.id)) return null;
      return l;
    } catch (_) { return null; }
  }

  // ── A verificação ──────────────────────────────────────────────────────────
  // Resolve com {bloqueado:false} em QUALQUER dúvida. Ver o cabeçalho do arquivo.
  function verificar(sess, opts) {
    opts = opts || {};
    var vazio = { bloqueado: false };
    try {
      if (!sess || !sess.id) return Promise.resolve(vazio);

      // Quem não tem loja não tem escala: supervisor, mestre, RH, compras, administrador e
      // manutenção são cadastrados como GERAL e nunca entram nessa conta.
      if (!sess.loja || sess.loja === 'GERAL') return Promise.resolve(vazio);

      for (var i = 0; i < EXCECOES_FIXAS.length; i++) {
        if (String(EXCECOES_FIXAS[i].id) === String(sess.id)) return Promise.resolve(vazio);
      }

      var vinculo = (sess.permissoes || {}).escala_nome;
      if (!vinculo || !String(vinculo).trim()) return Promise.resolve(vazio);

      var agora = opts.hoje ? new Date(opts.hoje + 'T12:00:00') : new Date();
      var hojeISO = _hojeISO(agora);

      var lib = _liberacaoAtiva(sess, hojeISO);
      if (lib) return Promise.resolve(vazio);

      var comKey = _comKey(sess.loja);
      if (!comKey) return Promise.resolve(vazio);

      var idx = _semIdx(agora);
      if (idx === null || idx === undefined) return Promise.resolve(vazio);
      var dia = _diaIdx(agora);

      var chave = [sess.id, comKey, hojeISO, _norm(vinculo)].join('|');
      if (!opts.semCache) {
        var doCache = _cacheLer(chave);
        if (doCache) return Promise.resolve(doCache);
      }

      // Três semanas numa tacada: a escala vale por herança quando a semana atual ainda não
      // tem registro próprio (a loja só gera o registro ao abrir e salvar a aba Escala), e
      // é assim que o Check-list e a Home já leem. Puxar all_data inteiro seria meio mega
      // em São Gonçalo; por chave dá ~30 KB por semana.
      var sel = ['"' + idx + '"', '"' + (idx - 1) + '"', '"' + (idx - 2) + '"']
        .map(function (k) { return 'all_data->' + k; }).join(',');
      var url = SB_URL + '/rest/v1/gn_comissoes?loja=eq.' + encodeURIComponent(comKey) +
                '&select=' + encodeURIComponent(sel);

      return _fetchJson(url).then(function (rows) {
        if (!rows || !rows.length) return vazio;
        var linha = rows[0] || {};
        var func = null;
        for (var k = 0; k < 3; k++) {
          var sem = linha[String(idx - k)];
          var achado = _acharFunc(sem, vinculo);
          if (achado) { func = achado; break; }
        }
        if (!func) return vazio;

        var res = _avaliar(func, dia, hojeISO, vinculo);
        _cacheGravar(chave, res);
        return res;
      }).catch(function (e) { _log('escalaAcesso:verificar', e); return vazio; });
    } catch (e) {
      _log('escalaAcesso:verificar', e);
      return Promise.resolve(vazio);
    }
  }

  function _acharFunc(semana, vinculo) {
    if (!semana || !Array.isArray(semana.funcs)) return null;
    var alvo = _norm(vinculo);
    for (var i = 0; i < semana.funcs.length; i++) {
      var f = semana.funcs[i];
      if (!f || !f.nome) continue;
      if (f.arquivado) continue;          // desligado por fim de contrato
      if (_norm(f.nome) === alvo) return f;
    }
    return null;
  }

  // O período da aba Dados é um par só, e o rótulo dele na tela é "Início/Fim férias ou
  // afastamento" — o campo não separa os dois. Quem está dentro desse período não deveria
  // estar no app de qualquer forma, então vale pros dois casos, e o texto da tela fala em
  // "férias ou afastamento" pra não afirmar o que o dado não diz.
  function _periodoDados(func, hojeISO) {
    var ini = (func.ferias_ini || '').slice(0, 10);
    var fim = (func.ferias_fim || '').slice(0, 10);
    if (!ini || !fim) return null;
    if (hojeISO >= ini && hojeISO <= fim) return { ini: ini, fim: fim };
    return null;
  }

  function _avaliar(func, dia, hojeISO, vinculo) {
    var periodo = _periodoDados(func, hojeISO);
    if (periodo) {
      return { bloqueado: true, motivo: 'ferias', vinculo: vinculo,
               ate: periodo.fim, desde: periodo.ini, origem: 'cadastro' };
    }
    var st = (Array.isArray(func.dias) ? func.dias[dia] : '') || '';
    var motivo = DIA_BLOQUEIA[String(st).trim().toUpperCase()];
    if (motivo) {
      return { bloqueado: true, motivo: motivo, vinculo: vinculo, origem: 'escala' };
    }
    return { bloqueado: false };
  }

  // ── Liberar com senha de supervisão ────────────────────────────────────────
  function liberar(sess, nome, senha) {
    return fetch(SB_URL + '/rest/v1/rpc/verificar_login', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_nome: nome, p_senha: senha, p_app: 'escala:liberar' })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rows) {
      if (!rows || !rows.length) return { ok: false, erro: 'Nome ou senha incorretos.' };
      var u = rows[0];
      // verificar_login é genérico e não filtra cargo — a trava de cargo é aqui, explícita.
      var cargo = String(u.cargo || '').toLowerCase();
      if (CARGOS_LIBERAM.indexOf(cargo) < 0) {
        return { ok: false, erro: 'Só supervisor ou mestre pode liberar. ' +
                 _esc(u.nome) + ' está como ' + _esc(u.cargo || 'sem cargo') + '.' };
      }
      var hojeISO = _hojeISO(new Date());
      var reg = { uid: sess.id, dia: hojeISO, por: u.nome, porCargo: cargo, ts: Date.now() };
      try { localStorage.setItem(LIB_KEY, JSON.stringify(reg)); } catch (_) {}
      _registrarLiberacao(sess, u, hojeISO);
      return { ok: true, por: u.nome };
    }).catch(function (e) {
      _log('escalaAcesso:liberar', e);
      return { ok: false, erro: 'Erro de conexão. Tente de novo.' };
    });
  }

  // Deixa rastro de quem liberou quem, e quando. Vai pra linha de configuração
  // ESCALA_LIBERACOES de gn_lojas (mesmo padrão de URGENCIA_CONFIG e DRE_CONFIG): não há
  // coluna livre em gn_acessos e criar tabela depende de migration. Lê, acrescenta e grava
  // — guardando só os últimos 300 pra linha não crescer pra sempre.
  function _registrarLiberacao(sess, lib, hojeISO) {
    var LINHA = 'ESCALA_LIBERACOES';
    var base = SB_URL + '/rest/v1/gn_lojas';
    var H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
    _fetchJson(base + '?loja=eq.' + LINHA + '&select=all_data').then(function (rows) {
      var atual = (rows && rows[0] && rows[0].all_data) || {};
      var lista = Array.isArray(atual.liberacoes) ? atual.liberacoes : [];
      lista.push({
        dia: hojeISO, quando: new Date().toISOString(),
        quem: sess.nome, quemId: sess.id, loja: sess.loja,
        por: lib.nome, porCargo: lib.cargo
      });
      atual.liberacoes = lista.slice(-300);
      var temLinha = rows && rows.length;
      // Lê-altera-grava sem trava: duas liberações no mesmo segundo podem fazer uma
      // sobrescrever a outra no histórico. É um registro, não um controle — o acesso em si
      // já foi concedido no localStorage —, então não vale uma trava pra isso.
      var corpo = { all_data: atual, updated_by: lib.nome };
      if (!temLinha) corpo.loja = LINHA;
      return fetch(temLinha ? base + '?loja=eq.' + LINHA : base, {
        method: temLinha ? 'PATCH' : 'POST',
        headers: Object.assign({ Prefer: 'return=minimal' }, H),
        body: JSON.stringify(corpo)
      });
    }).catch(function (e) { _log('escalaAcesso:registrar', e); });
  }

  // ── A tela ─────────────────────────────────────────────────────────────────
  var _overlay = null;

  function _texto(res) {
    if (res.motivo === 'folga') {
      return {
        icone: '🌴', titulo: 'Hoje é seu dia de folga',
        corpo: 'A escala da sua loja marca <b>folga</b> pra você hoje, então o acesso ao app ' +
               'fica fechado até amanhã. Se a escala estiver errada, quem resolve é a sua ' +
               'gerência — é só corrigir no Check-list, aba Escala, que a tela libera sozinha.'
      };
    }
    if (res.origem === 'cadastro') {
      return {
        icone: '🏖', titulo: 'Você está de férias',
        corpo: 'O cadastro da sua loja marca férias ou afastamento de <b>' + _esc(_brData(res.desde)) +
               '</b> até <b>' + _esc(_brData(res.ate)) + '</b>. O acesso ao app fica fechado nesse ' +
               'período. Se a data estiver errada, a gerência corrige no Check-list, aba Dados.'
      };
    }
    return {
      icone: '🏖', titulo: 'Você está de férias',
      corpo: 'A escala da sua loja marca <b>férias</b> pra você hoje, então o acesso ao app ' +
             'fica fechado. Se estiver errado, a gerência corrige no Check-list, aba Escala.'
    };
  }

  function _montarTela(sess, res) {
    var t = _texto(res);
    var el = document.createElement('div');
    el.id = 'gn-escala-bloqueio';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#0f1115;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:auto';
    el.innerHTML =
      '<div style="max-width:420px;width:100%;background:#171a21;border:1px solid rgba(255,255,255,.09);' +
            'border-radius:20px;padding:26px 22px;color:#e8eaed;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
        '<div style="font-size:42px;line-height:1;margin-bottom:12px">' + t.icone + '</div>' +
        '<div style="font-size:19px;font-weight:800;letter-spacing:-.3px;margin-bottom:4px">' + t.titulo + '</div>' +
        '<div style="font-size:12px;color:rgba(232,234,237,.55);margin-bottom:14px">' +
          _esc(sess.nome || '') + ' · ' + _esc(sess.loja || '') + '</div>' +
        '<div style="font-size:13px;line-height:1.6;color:rgba(232,234,237,.82)">' + t.corpo + '</div>' +

        '<div id="gn-eb-acoes" style="margin-top:20px;display:flex;flex-direction:column;gap:8px">' +
          '<button id="gn-eb-abrir" style="width:100%;background:#facc15;border:none;border-radius:11px;' +
            'padding:12px;font-size:13px;font-weight:800;color:#1a1d23;cursor:pointer;font-family:inherit">' +
            '🔑 Liberar com senha de supervisão</button>' +
          '<button id="gn-eb-retry" style="width:100%;background:rgba(255,255,255,.07);' +
            'border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:11px;font-size:12px;' +
            'font-weight:700;color:#e8eaed;cursor:pointer;font-family:inherit">' +
            '↻ Já corrigiram a escala — verificar de novo</button>' +
          '<button id="gn-eb-sair" style="width:100%;background:none;border:none;padding:8px;' +
            'font-size:12px;font-weight:700;color:rgba(232,234,237,.45);cursor:pointer;font-family:inherit">' +
            'Sair da conta</button>' +
        '</div>' +

        '<div id="gn-eb-form" style="display:none;margin-top:18px;border-top:1px solid rgba(255,255,255,.09);padding-top:16px">' +
          '<div style="font-size:11px;font-weight:800;color:rgba(232,234,237,.6);margin-bottom:9px">' +
            'SUPERVISOR OU MESTRE</div>' +
          '<input id="gn-eb-nome" type="text" autocomplete="off" placeholder="Nome" ' +
            'style="width:100%;box-sizing:border-box;background:#0f1115;border:1px solid rgba(255,255,255,.14);' +
            'border-radius:10px;padding:11px;color:#e8eaed;font-size:13px;margin-bottom:8px;font-family:inherit">' +
          '<input id="gn-eb-senha" type="password" autocomplete="off" placeholder="Senha" ' +
            'style="width:100%;box-sizing:border-box;background:#0f1115;border:1px solid rgba(255,255,255,.14);' +
            'border-radius:10px;padding:11px;color:#e8eaed;font-size:13px;font-family:inherit">' +
          '<div id="gn-eb-err" style="font-size:11.5px;color:#f87171;margin-top:8px;min-height:14px"></div>' +
          '<button id="gn-eb-ok" style="width:100%;margin-top:6px;background:#facc15;border:none;' +
            'border-radius:11px;padding:12px;font-size:13px;font-weight:800;color:#1a1d23;cursor:pointer;' +
            'font-family:inherit">Liberar acesso de hoje</button>' +
          '<div style="font-size:10.5px;color:rgba(232,234,237,.4);margin-top:9px;line-height:1.5">' +
            'A liberação vale só pra hoje e fica registrada com o nome de quem liberou.</div>' +
        '</div>' +
      '</div>';
    return el;
  }

  function _ligarBotoes(el, sess, res) {
    var form = el.querySelector('#gn-eb-form');
    var err = el.querySelector('#gn-eb-err');
    var btnOk = el.querySelector('#gn-eb-ok');

    el.querySelector('#gn-eb-abrir').onclick = function () {
      form.style.display = 'block';
      el.querySelector('#gn-eb-abrir').style.display = 'none';
      el.querySelector('#gn-eb-nome').focus();
    };

    el.querySelector('#gn-eb-sair').onclick = function () {
      try {
        localStorage.removeItem('gn_session_v1');
        localStorage.removeItem('gn_comandas_session_v1');
        localStorage.removeItem(CACHE_KEY);
      } catch (_) {}
      location.reload();
    };

    el.querySelector('#gn-eb-retry').onclick = function () {
      var b = el.querySelector('#gn-eb-retry');
      b.textContent = 'Verificando...'; b.disabled = true;
      verificar(sess, { semCache: true }).then(function (r) {
        if (!r.bloqueado) { fechar(); return; }
        b.textContent = 'Continua marcado. Verificar de novo'; b.disabled = false;
      });
    };

    btnOk.onclick = function () {
      var nome = el.querySelector('#gn-eb-nome').value.trim();
      var senha = el.querySelector('#gn-eb-senha').value;
      err.textContent = '';
      if (!nome || !senha) { err.textContent = 'Preencha nome e senha.'; return; }
      btnOk.textContent = 'Verificando...'; btnOk.disabled = true;
      liberar(sess, nome, senha).then(function (r) {
        btnOk.textContent = 'Liberar acesso de hoje'; btnOk.disabled = false;
        if (!r.ok) { err.textContent = r.erro; return; }
        fechar();
      });
    };

    el.querySelector('#gn-eb-senha').onkeydown = function (ev) {
      if (ev.key === 'Enter') btnOk.click();
    };
  }

  function mostrar(sess, res) {
    if (_overlay) return;
    _overlay = _montarTela(sess, res);
    _ligarBotoes(_overlay, sess, res);
    document.body.appendChild(_overlay);
    document.body.style.overflow = 'hidden';
  }

  function fechar() {
    if (!_overlay) return;
    _overlay.remove();
    _overlay = null;
    document.body.style.overflow = '';
  }

  // ── Vínculo: ajuda pro cadastro (app Usuários) ─────────────────────────────
  // Lista os nomes da escala de uma loja, pra montar o seletor do cadastro.
  function funcionariosDaLoja(lojaDoLogin) {
    var comKey = _comKey(lojaDoLogin);
    if (!comKey) return Promise.resolve([]);
    var idx = _semIdx(new Date());
    if (idx === null || idx === undefined) return Promise.resolve([]);
    var sel = [];
    for (var k = 0; k < 4; k++) sel.push('all_data->"' + (idx - k) + '"');
    var url = SB_URL + '/rest/v1/gn_comissoes?loja=eq.' + encodeURIComponent(comKey) +
              '&select=' + encodeURIComponent(sel.join(','));
    return _fetchJson(url).then(function (rows) {
      if (!rows || !rows.length) return [];
      var linha = rows[0] || {}, vistos = {}, out = [];
      for (var k = 0; k < 4; k++) {
        var sem = linha[String(idx - k)];
        if (!sem || !Array.isArray(sem.funcs)) continue;
        sem.funcs.forEach(function (f) {
          if (!f || !f.nome || !String(f.nome).trim() || f.arquivado) return;
          var nome = String(f.nome).trim();
          var chave = _norm(nome);
          if (vistos[chave]) return;
          vistos[chave] = true;
          out.push({ nome: nome, setor: (f.setor || '').trim() });
        });
      }
      out.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
      return out;
    }).catch(function (e) { _log('escalaAcesso:funcionarios', e); return []; });
  }

  // Sugere a linha da escala pro login. Só devolve quando existe UMA candidata com o mesmo
  // primeiro nome — duas Patrícias na mesma loja não viram chute. A sugestão é só pra
  // preencher o campo do cadastro; nada bloqueia enquanto ninguém salvar.
  function sugerirVinculo(lista, nomeDoLogin) {
    var alvo = _primeiroNome(nomeDoLogin);
    if (!alvo) return null;
    var cand = (lista || []).filter(function (f) { return _primeiroNome(f.nome) === alvo; });
    return cand.length === 1 ? cand[0].nome : null;
  }

  // ── O guardião ─────────────────────────────────────────────────────────────
  // Lê a sessão sozinho e fica de olho: a sessão aparece depois do login, e o app não avisa
  // ninguém quando isso acontece. Comparar a string crua a cada 3s é barato e não depende
  // de encaixar código em 13 telas de login diferentes.
  function _chaveSessao() {
    var s = document.currentScript && document.currentScript.getAttribute('data-sessao');
    return s || 'gn_session_v1';
  }
  var SESS_KEY = _chaveSessao();
  var TTL = 43200000;   // 12h, igual ao resto dos apps

  // Doze apps gravam a sessão achatada ({id, nome, loja, cargo, permissoes, ts}); o
  // Comandas grava {user:{...}, loja, ts}. Sem normalizar, lá o `sess.id` vinha undefined
  // e a verificação liberava todo mundo sem dizer nada — o pior tipo de falha pra isto.
  // A loja usada é SEMPRE a do usuário, não a do topo: no Comandas quem é GERAL escolhe
  // uma loja ao entrar, e essa escolha não quer dizer que ele esteja na escala dela.
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

  var _ultimaBruta = null;
  function _rodada() {
    var bruta = null;
    try { bruta = localStorage.getItem(SESS_KEY); } catch (_) {}
    if (bruta === _ultimaBruta) return;
    _ultimaBruta = bruta;
    var sess = _lerSessao();
    if (!sess) { fechar(); return; }
    verificar(sess).then(function (res) {
      if (res.bloqueado) mostrar(sess, res);
      else fechar();
    });
  }

  function _iniciar() {
    _rodada();
    setInterval(_rodada, 3000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { _ultimaBruta = null; _rodada(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _iniciar);
  else _iniciar();

  window.gnEscalaAcesso = {
    verificar: verificar,
    liberar: liberar,
    mostrar: mostrar,
    fechar: fechar,
    funcionariosDaLoja: funcionariosDaLoja,
    sugerirVinculo: sugerirVinculo,
    EXCECOES_FIXAS: EXCECOES_FIXAS,
    CARGOS_LIBERAM: CARGOS_LIBERAM,
    _semIdx: _semIdx,
    _diaIdx: _diaIdx,
    _avaliar: _avaliar,
    _primeiroNome: _primeiroNome
  };
})();
