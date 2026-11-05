-- Entrega: recebimento parcial e troca de fornecedor por item (app Lojas, aba Entrega).
-- Aplicada em produção (ncxttwvpafajnilpjbol) em 2026-11-05. Só colunas novas e nulas:
-- nenhuma linha existente muda e nenhum app que não as conhece é afetado.
-- Idempotente.

-- Fornecedor que DE FATO entregou o item, quando a loja recebe de outro do mesmo tipo
-- (ex.: descartável pedido na DMIC que veio pela IEV). A coluna `fornecedor` continua
-- sendo o do PEDIDO — o app Pedidos confirma, reverte e evita duplicidade por ela.
alter table public.gn_provisoes add column if not exists fornecedor_entregue text;

-- Quando a loja recebe só parte do item, a provisão é dividida: a linha original fica com
-- o que chegou (recebida) e uma linha nova, com parcial_origem apontando pra ela, guarda o
-- restante como AGUARDANDO. Cada linha continua com UM recebimento, que é o que todos os
-- relatórios esperam.
alter table public.gn_provisoes add column if not exists parcial_origem uuid;

comment on column public.gn_provisoes.fornecedor_entregue is 'Fornecedor que de fato entregou, quando diferente do pedido (fornecedor). Escolhido pela loja na Entrega; o pedido original continua em fornecedor.';
comment on column public.gn_provisoes.parcial_origem is 'Provisão de origem quando esta linha é o RESTANTE de um recebimento parcial.';
