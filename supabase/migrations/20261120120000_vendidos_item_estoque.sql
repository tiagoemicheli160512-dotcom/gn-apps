-- Vendidos × estoque (20/11/2026): liga o item vendido ao item do catálogo de estoque
-- (gn_catalogo.item_id), pra comparar o vendido com a saída real da contagem semanal:
-- contagem de segunda + recebido (gn_recebimentos) − contagem da segunda seguinte.
-- Começa pelas 4 Cocas (KS 290 = 36, lata 350 = 37, Zero KS = 38, Zero lata = 39).
-- Aplicada em produção (ncxttwvpafajnilpjbol) via MCP. Idempotente, não destrutiva.
alter table public.gn_vendidos_itens add column if not exists item_estoque integer;
update public.gn_vendidos_itens set item_estoque = v.item from (values
  ('coca_ks', 36), ('coca_lata', 37), ('coca_zero_ks', 38), ('coca_zero_lata', 39)
) as v(id, item) where gn_vendidos_itens.id = v.id and gn_vendidos_itens.item_estoque is null;
