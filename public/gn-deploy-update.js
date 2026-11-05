/* ═══════════════════════════════════════════════════════════════════════════
   ATUALIZAÇÃO DE DEPLOY SEM ATROPELAR QUEM ESTÁ NO MEIO DE ALGO
   ───────────────────────────────────────────────────────────────────────────
   Quando sai uma versão nova, o service worker (sw.js) faz skipWaiting() +
   clients.claim() e avisa as abas abertas com a mensagem GN_SW_UPDATED. Os apps
   respondiam recarregando na hora, incondicionalmente — o que apagava o que
   estivesse sendo digitado. Foi o caso relatado no app Estoque e Pedidos (aba
   Catálogo): modal de novo produto/edição aberto e a tela recarregava sozinha
   no meio, perdendo tudo.

   Aqui a regra é uma só, compartilhada por todos os apps: tela ociosa recarrega
   na hora (comportamento de sempre); com trabalho em andamento, mostra um aviso
   discreto com "Atualizar agora" e aplica sozinho assim que ficar ocioso.

   Uso no app:
     <script src="gn-deploy-update.js"></script>
     navigator.serviceWorker.addEventListener('message', function (e) {
       if (e.data && e.data.type === 'GN_SW_UPDATED') gnDeployAtualizar();
     });

   Ganchos opcionais (o app define se precisar, antes do primeiro deploy chegar):
     window.gnDeployFlush        → função (pode ser async) chamada antes do
                                   reload pra garantir que o último salvamento
                                   chegou na nuvem (o reload é navegação de
                                   verdade e aborta request em voo). Teto de 6s.
     window.gnDeployOcupadoExtra → função que devolve true quando o app tem um
                                   estado próprio de "editando" que não dá pra
                                   detectar pelo DOM (ex.: modo de edição em
                                   lote no Catálogo do Estoque e Pedidos).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TETO_FLUSH_MS = 6000;      // espera máxima pelo gnDeployFlush antes de recarregar
  var INTERVALO_CHECK_MS = 5000; // de quanto em quanto tempo reconfere se já está ocioso
  // Teto de adiamento: protege contra ficar numa versão velha pra sempre se algum app
  // tiver um overlay que vive aberto na tela (a trava de pendências, por exemplo). Mesmo
  // aqui, nunca recarrega com um campo em foco — ou seja, nunca no meio da digitação.
  var TETO_ADIAMENTO_MS = 10 * 60 * 1000;

  var pendente = false;   // flag própria, não o timestamp — um Date.now() falsy (0) faria
  var pendenteDesde = 0;  // o de-dup dos dois gatilhos falhar e recarregar duas vezes
  var timer = null;

  function campoEmFoco() {
    var el = document.activeElement;
    if (!el) return false;
    if (el.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  function visivel(el) {
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // Cada app nomeia seu modal de um jeito (modal-bg, modal-overlay, modalUsuario,
  // ...-trava-overlay), então procura pela marca no id/classe e confere se está de fato
  // visível — elemento interno de um modal fechado tem retângulo 0x0 e não conta.
  function modalAberto() {
    var els = document.querySelectorAll('[id*="modal" i],[class*="modal" i],[id*="overlay" i],[class*="overlay" i]');
    for (var i = 0; i < els.length; i++) {
      if (visivel(els[i])) return true;
    }
    return false;
  }

  function ocupado() {
    try {
      if (campoEmFoco()) return true;
      if (typeof window.gnDeployOcupadoExtra === 'function' && window.gnDeployOcupadoExtra()) return true;
      return modalAberto();
    } catch (e) { return false; }
  }

  function mostrarAviso() {
    if (document.getElementById('gn-deploy-update-banner')) return;
    var div = document.createElement('div');
    div.id = 'gn-deploy-update-banner';
    div.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:99999;' +
      'background:#1A1D23;color:#fff;border-radius:12px;padding:10px 14px;font-size:12px;font-weight:700;' +
      'display:flex;align-items:center;gap:10px;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:92vw;' +
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    var txt = document.createElement('span');
    txt.textContent = '🔄 Nova versão disponível — atualiza sozinho quando você terminar.';
    var btn = document.createElement('button');
    btn.textContent = 'Atualizar agora';
    btn.style.cssText = 'background:#E8580A;border:none;border-radius:8px;color:#fff;padding:6px 10px;' +
      'font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap';
    btn.onclick = aplicar;
    div.appendChild(txt);
    div.appendChild(btn);
    document.body.appendChild(div);
  }

  function aplicar() {
    if (timer) { clearInterval(timer); timer = null; }
    var espera = Promise.resolve();
    if (typeof window.gnDeployFlush === 'function') {
      try {
        espera = Promise.race([
          Promise.resolve(window.gnDeployFlush()),
          new Promise(function (r) { setTimeout(r, TETO_FLUSH_MS); })
        ]);
      } catch (e) { espera = Promise.resolve(); }
    }
    espera.catch(function () {}).then(function () { window.location.reload(); });
  }

  function gnDeployAtualizar() {
    if (pendente) return; // controllerchange e a mensagem chegam juntos — trata uma vez
    pendente = true;
    pendenteDesde = Date.now();
    if (!ocupado()) { aplicar(); return; }
    mostrarAviso();
    timer = setInterval(function () {
      var estourouOTeto = (Date.now() - pendenteDesde) > TETO_ADIAMENTO_MS;
      if (ocupado() && !(estourouOTeto && !campoEmFoco())) return;
      aplicar();
    }, INTERVALO_CHECK_MS);
  }

  window.gnDeployAtualizar = gnDeployAtualizar;
})();
