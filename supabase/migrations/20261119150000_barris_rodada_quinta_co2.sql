-- Contagem de barris de QUINTA (preparação do fim de semana) e cilindros de CO2
-- (19/11/2026, pedido do dono). Não-destrutiva: só acrescenta a coluna `rodada`.
--   · rodada 'SEG' = a contagem semanal de sempre (semana_inicio = a segunda);
--   · rodada 'QUI' = a contagem de quinta (semana_inicio = a própria quinta) — a chave
--     primária da confirmação (loja_slug, semana_inicio) continua valendo sem mudança.
--   · cilindros de CO2 entram em gn_barris_semanal_contagem com tipo 'CO2' (CHEIO/VAZIO),
--     uma linha por cilindro, igual aos barris.
-- Aplicada em produção (ncxttwvpafajnilpjbol) via MCP. Idempotente.
alter table public.gn_barris_semanal_contagem   add column if not exists rodada text not null default 'SEG';
alter table public.gn_barris_semanal_confirmacao add column if not exists rodada text not null default 'SEG';
