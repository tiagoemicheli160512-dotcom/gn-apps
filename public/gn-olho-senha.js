/* ── OLHO DE VER A SENHA — comportamento compartilhado ─────────────────────────────────
   "Vendo aqui, temos muitos erros na senha. Tem como colocar a opção de ver a senha antes
   de confirmar? No caso aquele olho que ao clicar aparece a senha pra verificar."

   O registro de tentativas com falha mostra a mesma pessoa errando quatro vezes no mesmo
   minuto, no mesmo app. É digitação às cegas em celular, em pé no salão — e o custo não é
   só o tempo: senha errada no fechamento do caixa é o caixa que não fecha.

   São 29 campos de senha em 12 apps, e vários nascem depois, dentro de template literal
   (o `visexcl-pass-${v.id}` do gn-home, as confirmações do gn-caixa). Escrever o olho campo
   a campo daria 29 cópias pra divergir na primeira correção — o mesmo motivo que fez o tema
   virar gn-tema.js. Então o comportamento mora aqui, uma vez só, e se pendura sozinho em
   todo input[type=password] que aparecer.

   A regra que não se quebra: NÃO MEXER NO LAYOUT. Cada app tem seu próprio CSS e seu próprio
   vocabulário de tokens; um campo que anda três pixels em 12 apps é um estrago maior que o
   problema que isto resolve. Por isso o embrulho é MEDIDO: guarda o retângulo do campo,
   embrulha, mede de novo, e se mexeu desfaz tudo e desiste daquele campo. Sem olho, mas sem
   estrago. O padding do olho é de graça porque os 12 apps têm `box-sizing:border-box` global
   — se um app novo não tiver, a medição pega e desiste sozinha.

   Incluir no <head>, junto do gn-tema.js. Não depende dele nem de ordem.                  */
(function (raiz, doc) {
  'use strict';

  var MARCA = 'data-gn-olho';        // no input já tratado
  var MARCA_WRAP = 'data-gn-olho-wrap';
  var LARGURA = 34;                  // px que o botão ocupa dentro do campo
  var TOLER = 1.5;                   // px de folga na medição (arredondamento de subpixel)

  function medir(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  function mesmoLugar(a, b) {
    return Math.abs(a.x - b.x) < TOLER && Math.abs(a.y - b.y) < TOLER &&
           Math.abs(a.w - b.w) < TOLER && Math.abs(a.h - b.h) < TOLER;
  }

  /* O desenho do olho é SVG, não emoji: 👁 sai de um tamanho em cada Android e some em
     alguns. `currentColor` deixa ele seguir a cor do campo nos dois temas, sem este arquivo
     precisar conhecer os tokens de nenhum app. */
  function desenho(aberto) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'block';
    svg.style.pointerEvents = 'none';
    var olho = doc.createElementNS(ns, 'path');
    olho.setAttribute('d', 'M1.8 12S5.4 5.4 12 5.4 22.2 12 22.2 12 18.6 18.6 12 18.6 1.8 12 1.8 12z');
    var iris = doc.createElementNS(ns, 'circle');
    iris.setAttribute('cx', '12'); iris.setAttribute('cy', '12'); iris.setAttribute('r', '2.9');
    svg.appendChild(olho); svg.appendChild(iris);
    if (!aberto) {                                  // escondida: a barra atravessando
      var corte = doc.createElementNS(ns, 'path');
      corte.setAttribute('d', 'M3.6 3.6 20.4 20.4');
      svg.appendChild(corte);
    }
    return svg;
  }

  function pintar(btn, inp) {
    // A cor sai do próprio campo: serve pro tema claro e pro escuro, em qualquer app.
    try { btn.style.color = raiz.getComputedStyle(inp).color; } catch (e) {}
  }

  function trocarDesenho(btn, aberto) {
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(desenho(aberto));
    btn.setAttribute('aria-pressed', aberto ? 'true' : 'false');
    btn.title = aberto ? 'Esconder a senha' : 'Ver a senha';
    btn.setAttribute('aria-label', btn.title);
  }

  function pendurar(inp) {
    if (!inp || inp.getAttribute(MARCA) || inp.type !== 'password') return;
    var pai = inp.parentNode;
    if (!pai || !pai.insertBefore) return;

    var antes = medir(inp);
    if (antes.w < 40 || antes.h < 12) return;   // escondido ou estreito demais: tenta no foco

    var estiloOriginal = inp.getAttribute('style');
    var cs = raiz.getComputedStyle(inp);
    var paiCS = raiz.getComputedStyle(pai);

    var wrap = doc.createElement('span');
    wrap.setAttribute(MARCA_WRAP, '1');
    var depoisDele = inp.nextSibling;

    /* O campo quase sempre tem largura em PORCENTAGEM. Posto dentro de um embrulho que
       encolhe pro conteúdo, ele vira 100% de nada e murcha. Então o embrulho precisa
       assumir o papel de layout que o campo tinha, e há dois casos que cobrem tudo o que
       existe nos 12 apps — o segundo é a rede: largura travada em px, medida do campo.
       `clientWidth` do pai inclui o padding dele, então a conta é com a largura de
       CONTEÚDO: foi o que fazia os cards de login desistirem do olho. */
    var larguraConteudoPai = pai.clientWidth -
      (parseFloat(paiCS.paddingLeft) || 0) - (parseFloat(paiCS.paddingRight) || 0);

    function montar(tentativa) {
      wrap.removeAttribute('style');
      wrap.style.position = 'relative';
      wrap.style.verticalAlign = cs.verticalAlign;
      wrap.style.margin = cs.margin;            // a margem passa pro embrulho, senão dobra
      if (tentativa === 1 && Math.abs(antes.w - larguraConteudoPai) < 2) {
        wrap.style.display = 'block';           // campo de largura cheia: o embrulho também
        wrap.style.width = '100%';
      } else {
        wrap.style.display = 'inline-block';
        wrap.style.width = antes.w + 'px';      // largura travada: o campo manda
        if (/flex|grid/.test(paiCS.display)) {
          wrap.style.flex = cs.flex;
          wrap.style.alignSelf = cs.alignSelf;
          wrap.style.minWidth = cs.minWidth;
        }
      }
      pai.insertBefore(wrap, depoisDele);
      wrap.appendChild(inp);
      inp.style.margin = '0';
      inp.style.width = '100%';
      inp.style.paddingRight = (parseFloat(cs.paddingRight) || 0) + LARGURA + 'px';
      return mesmoLugar(antes, medir(inp));
    }

    function desmontar() {
      pai.insertBefore(inp, wrap);
      pai.removeChild(wrap);
      if (estiloOriginal === null) inp.removeAttribute('style');
      else inp.setAttribute('style', estiloOriginal);
    }

    // A prova: o campo continua exatamente onde estava, do mesmo tamanho?
    if (!montar(1)) {
      desmontar();
      if (!montar(2)) { desmontar(); inp.setAttribute(MARCA, 'nao-coube'); return; }
    }

    var btn = doc.createElement('button');
    btn.type = 'button';                         // sem isto, dentro de <form>, ele ENVIA
    btn.setAttribute('data-gn-olho-btn', '1');
    btn.style.cssText = 'position:absolute;top:50%;right:0;transform:translateY(-50%);' +
      'width:' + LARGURA + 'px;height:' + Math.min(antes.h, 40) + 'px;display:flex;' +
      'align-items:center;justify-content:center;background:none;border:0;padding:0;margin:0;' +
      'cursor:pointer;opacity:.5;border-radius:8px;-webkit-appearance:none;appearance:none;' +
      'font:inherit;line-height:0';
    trocarDesenho(btn, false);
    pintar(btn, inp);
    wrap.appendChild(btn);
    inp.setAttribute(MARCA, '1');

    btn.addEventListener('mouseenter', function () { btn.style.opacity = '.9'; });
    btn.addEventListener('mouseleave', function () { btn.style.opacity = '.5'; });

    /* preventDefault no apontador: sem isto o campo perde o foco e, no celular, o teclado
       fecha no meio da digitação — a pessoa toca no olho pra conferir e tem que tocar de
       novo pra continuar.

       E `tocado` é a trava do caso em que o preventDefault NÃO segura (acontece em alguns
       navegadores de celular): aí o blur dispara ANTES do clique, o blur esconde, e o
       clique logo em seguida acha a senha escondida e mostra de novo — o segundo toque
       pararia de esconder. Com a marca de tempo, o blur sabe que foi o próprio olho e
       deixa o clique resolver. */
    var tocado = 0;
    function marcar(ev) { tocado = Date.now(); if (ev.cancelable) ev.preventDefault(); }
    if (raiz.PointerEvent) btn.addEventListener('pointerdown', marcar);
    else { btn.addEventListener('touchstart', marcar); btn.addEventListener('mousedown', marcar); }
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var abrindo = inp.type === 'password';
      // A posição do cursor se perde ao trocar o type em alguns navegadores: guarda e devolve.
      var ini = null, fim = null;
      try { ini = inp.selectionStart; fim = inp.selectionEnd; } catch (e) {}
      inp.type = abrindo ? 'text' : 'password';
      trocarDesenho(btn, abrindo);
      pintar(btn, inp);
      try { if (ini !== null) inp.setSelectionRange(ini, fim); } catch (e) {}
      if (doc.activeElement !== inp) { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }
    });

    // Some sozinha quando a pessoa sai do campo: a senha não fica aberta na tela do salão
    // enquanto alguém passa atrás. Quem quiser ver de novo toca no olho de novo.
    inp.addEventListener('blur', function () {
      if (Date.now() - tocado < 500) return;     // foi o próprio olho: o clique resolve
      if (inp.type === 'text') { inp.type = 'password'; trocarDesenho(btn, false); }
    });
  }

  function varrer(raizBusca) {
    var campos;
    try { campos = (raizBusca || doc).querySelectorAll('input[type="password"]:not([' + MARCA + '])'); }
    catch (e) { return; }
    for (var i = 0; i < campos.length; i++) pendurar(campos[i]);
  }

  /* Três gatilhos, porque os campos nascem de três jeitos:
     1. os que já estão no HTML quando a página abre;
     2. os que um render cria depois (template literal) — o observer;
     3. os que estavam escondidos e só agora foram medidos — o foco, que é o momento em que
        o campo está garantidamente visível, e é justo quando a pessoa precisa do olho.   */
  doc.addEventListener('focusin', function (ev) {
    var a = ev.target;
    if (a && a.tagName === 'INPUT' && a.type === 'password' && a.getAttribute(MARCA) !== '1') {
      a.removeAttribute(MARCA);   // escondido antes, visível agora: vale uma nova tentativa
      pendurar(a);
    }
  }, true);

  function ligarObserver() {
    if (!raiz.MutationObserver) return;
    var pendente = false;
    new raiz.MutationObserver(function () {
      if (pendente) return;
      pendente = true;
      raiz.requestAnimationFrame(function () { pendente = false; varrer(doc); });
    }).observe(doc.documentElement, { childList: true, subtree: true });
  }

  function ligarTema() {
    // O tema troca por atributo no <html> (gn-tema.js). A cor do olho vem do campo, então
    // basta repintar quando isso acontece.
    if (!raiz.MutationObserver) return;
    new raiz.MutationObserver(function () {
      var bs = doc.querySelectorAll('[data-gn-olho-btn]');
      for (var i = 0; i < bs.length; i++) {
        var campo = bs[i].parentNode && bs[i].parentNode.querySelector('input');
        if (campo) pintar(bs[i], campo);
      }
    }).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-tema', 'data-theme', 'class'] });
  }

  function começar() { varrer(doc); ligarObserver(); ligarTema(); }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', começar);
  else começar();

  raiz.gnOlhoSenha = varrer;   // pra um app forçar a varredura depois de um render pesado
})(window, document);
