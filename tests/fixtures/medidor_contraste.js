// Medidor de contraste reaproveitável. Nasceu dentro do teste do Check-list, foi copiado
// pro do Painel, e na terceira vez virou arquivo — três cópias divergem na primeira
// correção, e este aqui já levou quatro correções que eu não quero refazer em cada cópia:
//
//   1. getClientRects em vez de offsetParent: offsetParent é null tanto pra display:none
//      quanto pra position:fixed, e a exceção que abri pros fixos deixava passar a tela de
//      login escondida;
//   2. texto translúcido é COMPOSTO sobre o fundo, não pulado — pular escondia texto fraco
//      de verdade e fazia um texto que MELHOROU parecer regressão;
//   3. alpha 0 continua pulado: invisível de propósito não é ilegível;
//   4. gradiente: backgroundColor de gradiente vem transparente, então a busca subia a
//      árvore e media contra o fundo errado. Foi assim que um texto claro sobre gradiente
//      claro passou — quem pegou foi o print, não o teste.
module.exports.MEDIDOR = () => {
  //   5. color(srgb r g b): o navegador devolve color-mix() nesta forma, com os canais de
  //      0 a 1. Lidos como 0-255 viravam quase preto, e um texto CLARO de verdade era
  //      acusado de 1,16:1 — o medidor reprovando a correção que ele mesmo tinha pedido.
  const num = c => {
    const m = (c || '').match(/[\d.]+/g) || [];
    const v = m.map(Number);
    if (/^color\(/.test(c || '') && v.length >= 3) {
      const canais = v.slice(0, 3).map(x => Math.round(Math.max(0, Math.min(1, x)) * 255));
      return v.length > 3 ? canais.concat(v.slice(3)) : canais;
    }
    return v;
  };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const razao = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const fundoDe = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs2 = getComputedStyle(n);
      const v = num(cs2.backgroundColor);
      if (v.length >= 3 && (v.length < 4 || v[3] > 0.5)) return v.slice(0, 3);
      const bi = cs2.backgroundImage || '';
      if (/gradient/.test(bi)) {
        const paradas = (bi.match(/rgba?\([^)]+\)/g) || []).map(num)
          .filter(c => c.length >= 3 && (c.length < 4 || c[3] > 0.5));
        if (paradas.length) return [0, 1, 2].map(i => Math.round(paradas.reduce((s, c) => s + c[i], 0) / paradas.length));
      }
      n = n.parentElement;
    }
    const v = num(getComputedStyle(document.body).backgroundColor);
    return v.length >= 3 ? v.slice(0, 3) : [255, 255, 255];
  };
  const ruins = [];
  for (const el of document.querySelectorAll('*')) {
    if (!el.getClientRects().length) continue;
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!txt) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.3) continue;
    let cor = num(cs.color);
    if (cor.length >= 4 && cor[3] === 0) continue;
    const f = fundoDe(el);
    if (cor.length >= 4 && cor[3] < 1) {
      const al = cor[3];
      cor = [0, 1, 2].map(i => Math.round(cor[i] * al + f[i] * (1 - al)));
    }
    const r = razao(cor.slice(0, 3), f);
    if (r < 3.0) ruins.push({ txt: txt.slice(0, 42), cor: cs.color, fundo: 'rgb(' + f.join(',') + ')', r: +r.toFixed(2) });
  }
  return ruins;
};
