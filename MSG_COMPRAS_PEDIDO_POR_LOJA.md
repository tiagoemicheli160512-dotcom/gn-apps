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

Nesse caso o caminho é um destes dois:
- *Reverter* no fornecedor específico que precisa mudar; ou
- *Novo (todas)*, que abre um rascunho novo **sem** cancelar o que já foi confirmado.

### Também arrumado

O *×* e o *Cancelar* dos modais *Nova apresentação* e *Importar agenda* (aba Trios) não
fechavam — tinha que clicar fora da caixa. Agora fecham normal.

Qualquer coisa que não bater com o que está escrito aqui, me manda print.

---

## Resumo de uma linha (para fixar no grupo)

*Pedido errado em 1 ou 2 lojas? 🔄 Por loja → marca só elas → o resto fica intacto, e o número
antigo aparece na linha pra você conferir.*
