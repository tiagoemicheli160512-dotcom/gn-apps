# gn-apps — Gigante Nordestino

Suite de apps HTML/JS independentes (`public/*.html`) pra gestão de uma rede de restaurantes.

## Lojas — regra de escopo (Maglia)

A rede tem duas categorias de loja:

- **As 11 lojas originais**: Bangu, Caxias, São Gonçalo, Norte Shopping, Boulevard, Nova
  Iguaçu, Pedreira, Nova América, Campo Grande, Itaquera, Guarulhos.
- **Maglia**: 12ª loja, operação independente mas gerida pelo grupo. Cadastrada em
  `public/gn-lojas-config.js` (`GN_LOJAS`), a fonte canônica de lojas usada pela maioria
  dos apps.

**Regra combinada com o usuário**: qualquer mudança pedida só deve afetar a Maglia quando
o pedido citar "Maglia" explicitamente pelo nome. Sem essa menção, a mudança é só pras 11
lojas originais — não assumir que "todas as lojas"/"as lojas" no pedido inclui a Maglia por
padrão.

Na prática, como a Maglia está em `GN_LOJAS`, ela entra automaticamente em qualquer
listagem/loop que itere essa fonte central — então pedidos que não mencionam Maglia às
vezes exigem excluí-la explicitamente do que está sendo feito (ver
`LOJA_FORA_CONSOLIDADO`/`_lojasFatConsolidado()` em `gn-home.html` — consolidado de
faturamento exclui a Maglia por padrão) ou, se o pedido for sobre um recurso que a Maglia
não usa, escondê-lo só pra ela (ver `ABAS_FORA_MAGLIA`/`aplicarRestricaoAbasMaglia()` em
`gn-checklist.html` — abas Banda e Carnes escondidas só pra Maglia).

Diferenças já confirmadas da Maglia em relação às 11 lojas:
- Cardápio: compartilhado com as demais (fichas técnicas continuam globais) — decisão
  consciente do usuário pra não mudar a arquitetura de fichas.
- Gorjetas: cada loja já calcula pool de rateio isolado, nenhuma mudança necessária.
- Faturamento: nunca soma no consolidado/Faturamento Total do Painel de Gestão — só
  aparece individualmente (ranking, tabela, card próprio, linha do relatório).
- Cor de identidade: verde (`#059669`).
- Abas do app Check-list: não usa Banda nem Carnes.

## Workflow de PR

Commits vão pra branch `claude/repository-migrations-7xps6s`, PR em draft até o usuário
pedir "mergear" explicitamente (webhooks de deploy do Vercel não contam como aprovação).
Após um PR mergear, reiniciar a branch a partir de `origin/main` antes do próximo commit.
