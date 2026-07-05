# Correções críticas — NÃO reverter

## gn-checklist.html

### mergeState (linha ~2644)
`if(rows.faltas && rows.faltas.length)` — array vazio [] é truthy em JS; sem o `.length` sobrescreve faltas em memória
`if(rows.manutencao && rows.manutencao.length)` — mesma razão

### onDataChange
Captura `carryFaltas` e `carryManut` ANTES de zerar o estado.
Após `loadSupabaseDay`, aplica carry se o novo dia estiver vazio.

### initAppWithLoja
Captura `carryFaltasInit`/`carryManutInit` quando localStorage é de um dia anterior.
Carryover roda SEMPRE que `state.faltas` estiver vazio — sem wrapper `if(!todayFound)`.
Fallback Supabase (query do dia anterior) roda quando `!todayFound` e ainda vazio.

### Login supervisor (doLogin / doSupLogin)
`.ilike('cargo', 'supervisor')` — DB pode ter 'Supervisor' com maiúscula
`if(data.cargo) data.cargo = data.cargo.toLowerCase()` — normaliza antes de usar

### initAppWithLoja — Carnes não resetam
`savedWeekRaw` capturado ANTES de `setSemanaAtual()` (que chama autoSave e sobrescreve localStorage)

## gn-lojas.html

### getVendas()
Retorna `checklistVendasItens` quando disponível — dados do check-list têm prioridade
Fallback: `vendasAll[lojaKey()] || {}`

### loadChecklistFat()
Busca `vendas` (JSONB) além de venda_salao/venda_delivery
Agrega em `checklistVendasItens = {cod: qtdTotal}`

### prevWeek / nextWeek / changeLoja / goTab('vendas')
Resetam `checklistVendasItens = null` junto com `checklistFat = null`
