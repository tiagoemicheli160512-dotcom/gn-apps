/* ── Registro dos bloqueios (26/11/2026) ──────────────────────────────────────────────
   "Quero uma aba no Painel com o ranking das lojas com mais caso de bloqueio — dia,
    semana, mensal e trimestral — isso mostra o quanto a loja faz e os que só fazem por
    obrigação, sem respeitar os prazos."

   Até aqui nenhuma trava deixava rastro. Cada app, ao decidir quais travas estão ativas
   pra uma loja, chama gnTravasRegistro(app, loja, tiposQueEsteAppAvalia, ativas):
     · ativas: [{ tipo, hard, detalhe }] — o que está travando agora;
     · tipos: TODOS os tipos que esse app sabe avaliar (o que não estiver em `ativas` é dado
       como resolvido — por isso cada app só mexe nos tipos dele).
   No banco (rpc gn_travas_sync): 1 linha por loja × tipo × dia, com a hora em que um app viu
   a trava pela 1ª vez e a hora em que viu que ela saiu. Decisões do dono: registrar daqui
   pra frente; 1 caso = 1 tipo de trava num dia, mais o tempo travada.

   Nunca atrapalha o app: só envia quando o conjunto muda (ou a cada 10 min, pra registrar
   que continua), e qualquer erro é engolido. Maglia e GERAL fora (o banco também barra). */
(function () {
  'use strict';
  var SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';
  var REENVIO_MS = 10 * 60 * 1000;
  var _ult = {};   // app|loja → { sig, em }

  // Nomes que aparecem no ranking. Um tipo por regra de trava (nunca o mesmo tipo em dois
  // apps com regras diferentes — um fecharia o caso do outro).
  var ROTULOS = {
    // Fora de propósito: a escala-acesso (trava a PESSOA de folga/férias/fora do horário) e a
    // presença (confirmação diária que aparece pra toda loja todo dia) — não são prazo perdido.
    vendidos: '🧾 Vendidos do dia', desperdicio: '🗑 Desperdício', utensilios: '🍴 Utensílios (mínimo cadastrado)',
    validade: '⏳ Validade vencida', semlanc: '✅ Avarias/utensílios da semana', caixa: '💵 Caixa de ontem não fechado',
    nota_fiscal: '🧾 Nota fiscal', entrega: '📦 Confirmação de entrega', barris_contagem: '🍺 Contagem de barris',
    carnes: '🥩 Contagem de carnes', abertura: '☀️ Check-list de abertura', operacional: '⚙️ Check-list operacional',
    banda: '🎵 Banda', escala_chk: '📅 Escala (Check-list)', banco_horas: '⏱ Banco de horas', salario: '💰 Salário',
    cadastro: '🪪 Cadastro de funcionário',
  };

  function userKey(loja) {
    if (!loja) return null;
    var i = window.gnLojaPorChave ? window.gnLojaPorChave(loja) : null;
    var k = i ? i.userKey : String(loja).toUpperCase();
    if (k === 'SAO_GONCALO') k = 'SÃO GONÇALO';
    return String(k).toUpperCase().replace('AMÉRICA', 'AMERICA');
  }

  function registrar(app, loja, tipos, ativas) {
    try {
      var k = userKey(loja);
      if (!k || k === 'GERAL' || k === 'MAGLIA' || !tipos || !tipos.length) return Promise.resolve(false);
      var lista = (ativas || []).filter(function (a) { return a && a.tipo && tipos.indexOf(a.tipo) >= 0; })
        .map(function (a) { return { tipo: a.tipo, hard: !!a.hard, detalhe: a.detalhe ? String(a.detalhe).slice(0, 300) : null }; });
      var chave = app + '|' + k;
      var sig = JSON.stringify([tipos.slice().sort(), lista.map(function (a) { return a.tipo + (a.hard ? '!' : ''); }).sort()]);
      var u = _ult[chave], agora = Date.now();
      if (u && u.sig === sig && agora - u.em < REENVIO_MS) return Promise.resolve(false);
      _ult[chave] = { sig: sig, em: agora };
      return fetch(SB_URL + '/rest/v1/rpc/gn_travas_sync', {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_loja: k, p_app: app, p_tipos: tipos, p_ativas: lista }),
      }).then(function (r) { if (!r.ok) { delete _ult[chave]; } return r.ok; })
        .catch(function () { delete _ult[chave]; return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  window.gnTravasRegistro = registrar;
  window.GN_TRAVAS_ROTULOS = ROTULOS;
})();
