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

## Calendário de semanas — regra que não se quebra

A comissão fecha por semana. O índice da semana é a **chave** de `gn_comissoes.all_data`, e
essa chave **não guarda ano**: 2026 ocupa os índices 0–51, 2027 os 52–103.

**Ao acrescentar um ano, só ANEXE no fim de `public/gn-comissoes-calendario.js`.** Mexer na
ordem ou regerar o arquivo só com o ano novo faz o índice 37 (hoje 21/09/2026) passar a
significar uma semana de outro ano — e todo o histórico de escala, faltas, férias e repique
é reinterpretado de uma vez, sem erro nenhum aparecendo na tela.

A regra de cada ano: semana ISO, segunda a domingo, numerada pelo número ISO do próprio ano,
omitindo a semana 1 quando a segunda dela cai no ano anterior. A última semana atravessa o
réveillon de propósito (28/12–03/01) e é paga como uma semana só.

Os dias trazem o ano (`y`) e cada semana o ano da sua segunda (`ano`); nunca monte a data de
um dia a partir de dia+mês chutando o ano. Quem consome: `gn-checklist.html`, `gn-home.html`,
`gn-caixa.html`, `gn-avaliacoes-pesos.js`, e o `_buildCAL()` **próprio** de
`gn-comissoes.html` (que ancora em 05/01/2026 e anda de 7 em 7 dias — tem que continuar
dando o mesmo índice). No banco, `gn_repique_calendario` espelha esse calendário e é
conferida por md5 contra o arquivo.

## Workflow de PR

Commits vão pra branch `claude/repository-migrations-7xps6s`, PR em draft até o usuário
pedir "mergear" explicitamente (webhooks de deploy do Vercel não contam como aprovação).
Após um PR mergear, reiniciar a branch a partir de `origin/main` antes do próximo commit.
