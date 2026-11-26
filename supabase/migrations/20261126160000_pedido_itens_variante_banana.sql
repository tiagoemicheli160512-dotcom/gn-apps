-- Tipo da banana no pedido de Hortifruti (Etapa 4, 26/11/2026): "três opções para a
-- descrição da banana: verde, madura, de vez — no relatório do WhatsApp e no PDF, pro
-- fornecedor saber qual tipo está sendo pedido." Coluna nova, nula pra todo o resto.
-- (Aplicada via MCP como "pedido_itens_variante_banana".)
alter table public.gn_pedido_itens add column if not exists variante text;
alter table public.gn_pedido_itens drop constraint if exists gn_pedido_itens_variante_chk;
alter table public.gn_pedido_itens add constraint gn_pedido_itens_variante_chk check (variante is null or variante in ('VERDE','MADURA','DE_VEZ'));
