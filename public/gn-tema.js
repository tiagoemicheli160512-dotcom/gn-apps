/* ── TEMA CLARO / ESCURO — mecanismo compartilhado ─────────────────────────────────────
   "Quero replicar em todo o app, com essa opção de alterar pro claro ou escuro."

   O Check-list ganhou o tema escuro primeiro, com o botão e a persistência escritos dentro
   dele. Repetir isso em 13 arquivos daria 13 cópias para divergir na primeira correção —
   e já houve uma: o botão nasceu na barra lateral, que não existe no celular.

   Então o COMPORTAMENTO mora aqui, uma vez só. O que NÃO mora aqui é a paleta: cada app
   tem seu próprio vocabulário de tokens (--s1 e --t1 no Check-list, --bg e --txt no
   Manutenção, --bd e --bg2 no Comissões — são oito sistemas diferentes), então cada um
   declara o seu :root[data-tema="escuro"] no próprio <style>. Unificar os vocabulários é
   outro trabalho, e não precisa acontecer pra o tema funcionar.

   Este arquivo tem que ser incluído no <head>, ANTES do <style>: ele aplica o atributo na
   hora, e se vier depois o app abre claro e pisca pra escuro a cada entrada.

   A escolha é por APARELHO, não por usuário: é o aparelho que está no sol do salão, não a
   pessoa. E é a MESMA pra todos os apps — quem escolheu escuro no Check-list não vai
   escolher de novo no Painel.                                                            */
(function (raiz, doc) {
  'use strict';

  var CHAVE = 'gn_tema';
  var CHAVE_ANTIGA = 'gn_chk_tema';   // do Check-list, antes deste arquivo existir

  function lido() {
    try {
      var v = raiz.localStorage.getItem(CHAVE);
      if (v) return v;
      // Quem já tinha escolhido no Check-list não precisa escolher de novo.
      var antigo = raiz.localStorage.getItem(CHAVE_ANTIGA);
      if (antigo) { try { raiz.localStorage.setItem(CHAVE, antigo); } catch (e) {} return antigo; }
    } catch (e) {}                     // cota cheia, aba anônima: claro, e segue a vida
    return 'claro';
  }

  function atual() {
    return doc.documentElement.getAttribute('data-tema') === 'escuro' ? 'escuro' : 'claro';
  }

  function aplicar(t) {
    if (t === 'escuro') doc.documentElement.setAttribute('data-tema', 'escuro');
    else doc.documentElement.removeAttribute('data-tema');
    // A barra do sistema no celular: sem isto a faixa de cima fica clara com o app escuro,
    // e parece que a tela não carregou inteira.
    var m = doc.querySelector('meta[name="theme-color"]');
    if (m) {
      // A cor clara é a que o app já declarou — o Painel usa o amarelo da identidade dele,
      // o Check-list usa cinza. Sobrescrever com um valor fixo mudaria a cara do app no
      // tema claro, que ninguém pediu. Guarda a original na primeira passada.
      if (!m.getAttribute('data-claro')) m.setAttribute('data-claro', m.getAttribute('content') || '#F5F6F8');
      m.setAttribute('content', t === 'escuro' ? '#14171C' : m.getAttribute('data-claro'));
    }
    var bs = doc.querySelectorAll('[data-botao-tema]');
    for (var i = 0; i < bs.length; i++) {
      bs[i].textContent = t === 'escuro' ? '☀️' : '🌙';
      bs[i].title = t === 'escuro' ? 'Voltar pro tema claro' : 'Mudar pro tema escuro';
    }
  }

  function trocar() {
    var novo = atual() === 'escuro' ? 'claro' : 'escuro';
    aplicar(novo);
    try { raiz.localStorage.setItem(CHAVE, novo); } catch (e) {}
    return novo;
  }

  // Aplica AGORA, antes da primeira pintura. Tudo o mais pode esperar o DOM.
  if (lido() === 'escuro') doc.documentElement.setAttribute('data-tema', 'escuro');

  function pronto(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  pronto(function () { aplicar(atual()); });

  raiz.gnTema = { atual: atual, trocar: trocar, aplicar: aplicar };
  // Nome curto pro onclick do botão, que é escrito à mão em cada app.
  raiz.gnTrocarTema = trocar;
})(window, document);
