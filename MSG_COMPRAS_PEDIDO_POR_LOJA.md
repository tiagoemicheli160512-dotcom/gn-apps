# Mensagem para o setor de Compras — refazer pedido por loja

Para enviar ao Matheus e a quem mais mexe no app Estoque e Pedido.

---

## Versão para mandar

Bom dia! Mudou uma coisa no app Estoque e Pedido que resolve um problema chato: *refazer o
pedido de uma loja sem mexer nas outras.*

### Antes

O botão *Novo* era tudo ou nada. Se só a Bangu precisava lançar de novo, ele cancelava o
pedido da semana inteiro — e as outras 10 lojas perdiam de vista tudo que já tinham lançado.
Na prática, uma loja errada custava o trabalho das 11.

### Agora

Tem dois botões lado a lado:

🔄 *Por loja* → escolhe quais lojas refazem. **Use este no dia a dia.**
*Novo (todas)* → o antigo, que cancela o pedido da semana inteiro. Só para começar a semana do zero.

### Como usar o "Por loja"

1. Toque em *🔄 Por loja*.
2. Aparece a lista das lojas da região, e ao lado de cada uma *quantos itens ela já lançou*.
   Começa tudo desmarcado de propósito.
3. Marque só as lojas que precisam refazer (uma, duas, cinco — quantas quiser).
4. Confirme. A mensagem repete os nomes das lojas e quantos itens saem, para você conferir
   antes de agir.

As lojas que você **não** marcou continuam exatamente como estavam. O pedido da semana **não**
é cancelado.

### O número de referência na linha do item

Esta é a segunda parte, e é a que evita pedir quantidade errada.

Depois de refazer, cada item passa a mostrar ao lado do campo *quanto estava lançado antes de
zerar*:

> *Refeito: 10*  ← em laranja

Ou seja: você vê o que a loja tinha pedido enquanto lança o número novo. Nada é perdido.

Quando não houve nenhum pedido refeito na semana, o app mostra a referência da semana passada:

> *Sem.ant: 9*

No topo da tela sempre aparece uma frase dizendo **de onde o número vem** — leia essa frase
antes de comparar, porque o "Refeito" e o "Sem.ant" são coisas diferentes.

### Uma coisa que o "Por loja" NÃO faz

Se o pedido da semana já está **CONFIRMADO** (ou ENVIADO), o *Por loja* se recusa e explica o
motivo: a provisão de entrega já existe e o fornecedor já recebeu o pedido. Tirar itens de
dentro de um pedido confirmado apagaria um pedido real.

*Ou seja: o Por loja nunca reabre nem zera um pedido confirmado.*

Nesse caso o caminho é um destes dois:
- *Reverter* no fornecedor específico que precisa mudar; ou
- *Novo (todas)*, que abre um rascunho novo **sem** cancelar o que já foi confirmado.

### Acrescentar o que faltou num pedido já confirmado (2ª rodada)

Esse é o caso de *"esqueci de pedir X"* depois de o pedido já ter saído. O caminho é o
*Novo (todas)*: ele abre um rascunho em branco por cima, **sem** cancelar o confirmado.

Pra não pedir duas vezes a mesma coisa, agora cada item mostra em verde quanto *já foi
comprado* nesta semana:

> *Já pedido: 12*  ← em verde

É a soma de todas as rodadas já confirmadas da semana. Antes a linha só ficava com o fundo
verde, dizendo que a loja já tinha pedido aquele item — mas sem dizer quanto, o que não ajudava
a decidir a quantidade nova.

E no topo da tela aparece o aviso: *"Já existe pedido confirmado nesta semana — lance aqui só o
que FALTA"*.

Resumindo os números que aparecem na linha:

| Número | Cor | O que é |
|---|---|---|
| *Já pedido: N* | verde | já foi comprado nesta semana — **não repita** |
| *Refeito: N* | laranja | estava lançado antes de você zerar com o Por loja |
| *Sem.ant: N* | cinza | foi pedido na semana passada |

### Também arrumado

O *×* e o *Cancelar* dos modais *Nova apresentação* e *Importar agenda* (aba Trios) não
fechavam — tinha que clicar fora da caixa. Agora fecham normal.

Qualquer coisa que não bater com o que está escrito aqui, me manda print.

---

## Resumo de uma linha (para fixar no grupo)

*Pedido errado em 1 ou 2 lojas? 🔄 Por loja → marca só elas → o resto fica intacto, e o número
antigo aparece na linha pra você conferir.*
