-- Reabrir a urgência da semana (app Lojas › Pedido, senha mestre): quem reabriu e quando.
-- Separado de reaberto_em/_por, que são da FINALIZAÇÃO — misturar faria a faixa dizer
-- "finalização já reaberta" quando o que voltou foi a urgência. Só acrescenta colunas.
alter table public.gn_pedido_envio_semana
  add column if not exists urgencia_reaberta_em timestamptz,
  add column if not exists urgencia_reaberta_por text;
