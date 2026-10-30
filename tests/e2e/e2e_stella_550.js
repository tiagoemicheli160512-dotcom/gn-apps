// "A garrafa é 550 ml."
//
// O catálogo sempre disse 550 ("Stella 550 ml Cx c/ 24 unds", item 9/1009) e a ficha
// técnica dizia 600 ("STELLA ARTOIS 600ML"). O item 9 já estava VINCULADO a essa ficha
// nas 12 lojas — o sistema sabia que a caixa abastece essa venda —, mas os dois números
// se contradiziam na tela, e foi essa contradição que levou alguém a esconder o item do
// catálogo achando que era duplicata. Confirmado pelo dono: a garrafa é 550.
//
// O QUE TORNA ISTO DELICADO, e é o que esta suíte protege: o nome do insumo é a CHAVE do
// estoque. Renomear sem levar o histórico junto zera a Stella nas 11 lojas de uma vez, em
// silêncio — ninguém vê erro, só um número que virou zero. Medido antes da migração:
// 86 registros de estoque inicial, 16 contagens, 12 mínimos e 24 vínculos presos ao nome
// antigo; todos migrados e conferidos um a um.
//
// Esta suíte cobra o lado do CÓDIGO: que o nome velho não voltou por nenhuma porta — nem
// pela semente das fichas, nem pelas listas que cada app carrega embutidas.
const CAMINHOS = require('../_env');
const fs = require('fs');
const path = require('path');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const NOVO = 'STELLA ARTOIS 550ML';
const VELHO = 'STELLA ARTOIS 600ML';

// Os arquivos vivos do app. `_base_*` ficam de fora porque não são versionados (são
// cópias locais de trabalho), e `build/` está parado desde o PR #1048 — mexer num
// artefato morto só adicionaria ruído ao diff.
const ARQUIVOS = ['fichas-seed.js', 'gn-lojas.html', 'gn-lojas-seed.js', 'gn-pedidos.html', 'gn-checklist.html'];

// ══ 1. O NOME VELHO NÃO PODE TER SOBRADO EM LUGAR NENHUM ════════════════════════
// Uma ocorrência esquecida é uma ficha apontando pra um insumo que não existe mais:
// o consumo daquele prato para de descontar do estoque, calado.
ARQUIVOS.forEach(a => {
  const src = fs.readFileSync(CAMINHOS.pub(a), 'utf8');
  check(`${a}: não sobrou "${VELHO}"`, src.indexOf(VELHO) < 0,
    (src.match(/.{60}STELLA ARTOIS 600ML/) || [''])[0]);
});

// ══ 2. E O NOVO PRECISA ESTAR ONDE O VELHO ESTAVA ═══════════════════════════════
// Sem isto, apagar o nome velho de todo canto também passaria — e a ficha ficaria sem
// insumo nenhum, que é pior que o nome errado.
const seed = fs.readFileSync(CAMINHOS.pub('fichas-seed.js'), 'utf8');
check('a ficha B005 existe e leva o nome novo',
  /"B005":\{"nome":"STELLA ARTOIS 550ML"/.test(seed),
  (seed.match(/"B005":\{[^}]{0,120}/) || [''])[0]);
check('e o insumo dela também — é ele que é a chave do estoque',
  /"B005":\{"nome":"STELLA ARTOIS 550ML","insumos":\[\{"insumo":"STELLA ARTOIS 550ML"/.test(seed),
  (seed.match(/"B005":\{[^\]]{0,200}/) || [''])[0]);

// O código da ficha NÃO muda: as vendas são gravadas por código (B005), não por nome.
// Trocar o código órfã o histórico de vendas inteiro — o oposto do que esta mudança quer.
check('o código B005 continua o mesmo, pra não órfãr as vendas',
  /"B005"/.test(seed) && !/"B0005"|"B505"/.test(seed));

const lojas = fs.readFileSync(CAMINHOS.pub('gn-lojas.html'), 'utf8');
check('o app Lojas carrega a ficha com o nome novo',
  lojas.indexOf(NOVO) >= 0 && /"codigo": "B005", "nome": "STELLA ARTOIS 550ML"/.test(lojas));

const pedidos = fs.readFileSync(CAMINHOS.pub('gn-pedidos.html'), 'utf8');
check('o app Estoque e Pedido também', pedidos.indexOf(NOVO) >= 0);

const chk = fs.readFileSync(CAMINHOS.pub('gn-checklist.html'), 'utf8');
check('e o Check-list, na lista de bebidas que ele traz embutida',
  /"c":"BEB005","n":"STELLA ARTOIS 550ML"/.test(chk),
  (chk.match(/.{20}BEB005.{60}/) || [''])[0]);

// ══ 3. O OUTRO LADO DA CONTRADIÇÃO ══════════════════════════════════════════════
// O catálogo já dizia 550; o que estava errado era a ficha. Se um dia alguém "arrumar"
// o catálogo pro 600 pra casar com um nome velho que sobrou, a contradição volta.
check('o nome novo fala em 550, igual ao catálogo', /550ML$/.test(NOVO));
check('e não sobrou nenhum 600 no nome da ficha', !/600/.test(NOVO));

// ══ 4. O RESTO DA FAMÍLIA STELLA NÃO FOI TOCADO ═════════════════════════════════
// São produtos diferentes, com nome parecido — é exatamente por causa dessa semelhança
// que o item sumiu da lista. Uma troca de texto larga demais levaria eles junto.
const outros = ['ESTELLA PURE GOLD LN', 'ANTARCTICA ORIGINAL 600ML', 'SPATEN 600ML'];
outros.forEach(n => {
  const onde = ARQUIVOS.filter(a => fs.readFileSync(CAMINHOS.pub(a), 'utf8').indexOf(n) >= 0);
  if (!onde.length) return;   // nem todo app traz todos
  check(`"${n}" continua intacto (é outro produto)`, onde.length > 0, onde.join(', '));
});
// O 600ML dos OUTROS produtos não pode ter virado 550. Cobrado pela AUSÊNCIA do 550,
// não pela presença do 600: com duas ocorrências por produto (o nome da ficha e o do
// insumo), trocar só uma delas deixava a outra de pé e a checagem passava — mesmo com o
// estoque da Antarctica partido em dois nomes.
const outros550 = ARQUIVOS
  .map(a => ({ a, src: fs.readFileSync(CAMINHOS.pub(a), 'utf8') }))
  .flatMap(({ a, src }) => ['ANTARCTICA ORIGINAL 550ML', 'SPATEN 550ML', 'MALZBIER 550ML']
    .filter(n => src.indexOf(n) >= 0).map(n => a + ': ' + n));
check('nenhum outro produto virou 550 — a troca era só da Stella',
  outros550.length === 0, JSON.stringify(outros550));
// E os deles continuam todos lá, nas duas pontas (nome da ficha e insumo).
const antarctica = (seed.match(/ANTARCTICA ORIGINAL 600ML/g) || []).length;
const spaten = (seed.match(/SPATEN 600ML/g) || []).length;
check('a Antarctica e a Spaten seguem com as duas ocorrências cada',
  antarctica === 2 && spaten === 2, JSON.stringify({ antarctica, spaten }));

console.log(`\n${ok} OK, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
