// ─── ARMAZENAMENTO LOCAL QUE NÃO ESTOURA ─────────────────────────────────────
// `localStorage.setItem` lança exceção quando a cota do site enche, e a cota é de UM site
// só (uns 5 MB) compartilhada pelos 13 apps — todos moram no mesmo endereço. Onde a escrita
// estava sem try/catch, essa exceção subia e derrubava o fluxo no meio: no Check-list ela
// caía bem no login, antes de gravar a sessão e de mostrar o "bem-vindo", e a pessoa
// simplesmente não entrava. Nada na tela dizia o motivo.
//
// Aqui tem duas garantias:
//   1. gnGuardar() NUNCA estoura. Devolve true/false e segue a vida.
//   2. Quando falta espaço, abre espaço sozinho antes de desistir — por uma escada de
//      coisas seguras, da mais descartável pra menos.
//
// ── O QUE PODE SER APAGADO, E SÓ ISSO ────────────────────────────────────────
// A limpeza trabalha com lista fechada. O que não está nela não é tocado, nem que a cota
// esteja estourando. Fora da lista de propósito, porque apagar seria perder de verdade:
//   • gn_session_v1, gn_comandas_session_v1, gn_chk_user_*  → derrubaria todo mundo do app
//   • gn_entrega_fila_pendente, gn_ped_sync_fila_pendente   → é dado que AINDA NÃO subiu
//   • gn_manut_of_draft                                     → ordem de serviço em rascunho
//   • gn_cl_last_*                                          → é o diagnóstico de quem liga
//   • a cópia do dia da loja aberta agora                    → é a rede de segurança em uso
(function () {
  'use strict';

  function _log(tag, e) { try { window.gnLogError && window.gnLogError(tag, e); } catch (_) {} }

  function _ehCotaCheia(e) {
    if (!e) return false;
    // Cada navegador nomeia de um jeito, e o Safari antigo só dá o código 22.
    return e.name === 'QuotaExceededError' ||
           e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
           e.code === 22 || e.code === 1014;
  }

  function _chaves() {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)); } catch (_) {}
    return out.filter(Boolean);
  }

  function _tamanho(k) {
    try { var v = localStorage.getItem(k); return v ? (k.length + v.length) * 2 : 0; } catch (_) { return 0; }
  }

  function _remover(k) {
    var t = _tamanho(k);
    try { localStorage.removeItem(k); return t; } catch (_) { return 0; }
  }

  function _hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function _diasAtras(n) {
    var d = new Date(); d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function _sufixoLoja(loja) { return String(loja || '').replace(/\s+/g, '_'); }

  // Tira as fotos em base64 de uma cópia do dia, devolvendo o JSON enxuto — ou null quando
  // não havia foto nenhuma (aí não adianta regravar).
  function _semFotos(txt) {
    var st;
    try { st = JSON.parse(txt); } catch (_) { return null; }
    if (!st || typeof st !== 'object') return null;
    var achou = false;
    var limpar = function (it) { if (it && it.fotoBase64) { it.fotoBase64 = ''; achou = true; } };
    (st.manutencao || []).forEach(limpar);
    ['checklist', 'abertura', 'fechamento'].forEach(function (k) {
      var sec = st[k] || {};
      Object.keys(sec).forEach(function (s) {
        var setor = sec[s] || {};
        Object.keys(setor).forEach(function (i) { limpar(setor[i]); });
      });
    });
    if (!achou) return null;
    try { return JSON.stringify(st); } catch (_) { return null; }
  }

  function _dataDaCopia(txt) {
    try { var st = JSON.parse(txt); return (st && st.data) || ''; } catch (_) { return ''; }
  }

  // ── A escada ───────────────────────────────────────────────────────────────
  // Cada degrau devolve quantos bytes liberou. Para no primeiro que resolve, pra não
  // fazer faxina à toa.
  var DEGRAUS = [
    {
      nome: 'cache da Gorjetas Mestra',
      // Cache puro: o app tem botão "limpar cache e recarregar" e rebusca tudo do servidor
      // em toda abertura. É também o maior item de quem abre a Mestra — carrega as 11 lojas.
      roda: function () { return _remover('gn_mestra_allDataPorLoja'); }
    },
    {
      nome: 'fotos de dias passados',
      // Mesma regra que o Check-list já aplicava sozinho (limparFotosAntigas), agora
      // disponível pros outros apps que dividem a mesma cota.
      roda: function () {
        var limite = _diasAtras(7), liberou = 0;
        _chaves().forEach(function (k) {
          if (k.indexOf('gn_chk4_foto_') !== 0) return;
          var data = k.slice(-10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(data) && data < limite) liberou += _remover(k);
        });
        return liberou;
      }
    },
    {
      nome: 'fotos das cópias de outras lojas',
      // Tira só as FOTOS das cópias locais de outras lojas, mantendo itens, valores e
      // faltas. A cópia de uma loja no aparelho do mestre é uma segunda via — a gerência
      // dela tem a própria, e o dia já está no servidor. Nunca mexe na loja aberta agora.
      roda: function (opts) {
        var guardar = 'gn_chk4_day_' + _sufixoLoja(opts && opts.lojaAtual), liberou = 0;
        _chaves().forEach(function (k) {
          if (k.indexOf('gn_chk4_day_') !== 0 || k === guardar) return;
          var antes = _tamanho(k), txt = null;
          try { txt = localStorage.getItem(k); } catch (_) { return; }
          var enxuto = _semFotos(txt);
          if (!enxuto) return;
          try { localStorage.setItem(k, enxuto); liberou += antes - _tamanho(k); } catch (_) {}
        });
        return liberou;
      }
    },
    {
      nome: 'cópias de dias já passados',
      // Último degrau: a cópia local de um dia que já virou. O dia dela já foi salvo e
      // fechado; segurar isso no aparelho não protege mais nada. A loja aberta agora e
      // qualquer cópia de hoje continuam intocadas.
      roda: function (opts) {
        var guardar = 'gn_chk4_day_' + _sufixoLoja(opts && opts.lojaAtual);
        var hoje = _hojeISO(), liberou = 0;
        _chaves().forEach(function (k) {
          if (k.indexOf('gn_chk4_day_') !== 0 || k === guardar) return;
          var txt = null;
          try { txt = localStorage.getItem(k); } catch (_) { return; }
          var data = _dataDaCopia(txt);
          if (!data || data >= hoje) return;      // sem data conhecida: não arrisca
          liberou += _remover(k);
        });
        return liberou;
      }
    }
  ];

  function liberarEspaco(opts) {
    var total = 0, feitos = [];
    for (var i = 0; i < DEGRAUS.length; i++) {
      var ganho = 0;
      try { ganho = DEGRAUS[i].roda(opts || {}) || 0; } catch (e) { _log('armazenamento:' + DEGRAUS[i].nome, e); }
      if (ganho > 0) { total += ganho; feitos.push(DEGRAUS[i].nome); }
      if (total > 0 && opts && opts.pararNoPrimeiro) break;
    }
    return { bytes: total, degraus: feitos };
  }

  // ── A escrita ──────────────────────────────────────────────────────────────
  // Devolve 'ok' | 'ok-apos-limpeza' | 'sem-espaco' | 'indisponivel'. Nunca estoura.
  // `indisponivel` é a aba anônima e o navegador com dados do site bloqueados, onde o
  // localStorage existe mas recusa tudo — não é falta de espaço e não adianta limpar.
  function guardar(chave, valor, opts) {
    try {
      localStorage.setItem(chave, valor);
      return 'ok';
    } catch (e) {
      if (!_ehCotaCheia(e)) { _log('armazenamento:guardar', e); return 'indisponivel'; }
      liberarEspaco(opts);
      try {
        localStorage.setItem(chave, valor);
        return 'ok-apos-limpeza';
      } catch (e2) {
        return _ehCotaCheia(e2) ? 'sem-espaco' : 'indisponivel';
      }
    }
  }

  // Versão simples pra quem só quer que não estoure e não vai olhar o motivo.
  function guardarSimples(chave, valor) {
    var r = guardar(chave, valor);
    return r === 'ok' || r === 'ok-apos-limpeza';
  }

  // Diagnóstico: quanto cada família de chave está ocupando. Serve pra responder "por que
  // encheu?" sem precisar do aparelho na mão.
  function espacoUsado() {
    var fam = {}, total = 0;
    _chaves().forEach(function (k) {
      var t = _tamanho(k);
      total += t;
      var familia = k.replace(/[0-9]{4}-[0-9]{2}-[0-9]{2}$/, '<data>')
                     .replace(/_(BANGU|CAXIAS|SAO_GONCALO|SÃO_GONÇALO|NORTE|NORTE_SHOPPING|BOULEVARD|RANCHO|PEDREIRA|NOVA_AMERICA|NOVA_AMÉRICA|CAMPO_GRANDE|ITAQUERA|GUARULHOS|MAGLIA)_?/i, '_<loja>_');
      fam[familia] = (fam[familia] || 0) + t;
    });
    var lista = Object.keys(fam).map(function (k) { return { chave: k, bytes: fam[k] }; });
    lista.sort(function (a, b) { return b.bytes - a.bytes; });
    return { total: total, familias: lista };
  }

  window.gnGuardar = guardar;
  window.gnGuardarSimples = guardarSimples;
  window.gnLiberarEspaco = liberarEspaco;
  window.gnEspacoUsado = espacoUsado;
  window.gnCotaCheia = _ehCotaCheia;
})();
