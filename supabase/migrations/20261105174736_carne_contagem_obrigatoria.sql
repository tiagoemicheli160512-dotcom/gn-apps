-- Contagem de carne obrigatória por data + justificativa de contagem zerada.
-- Aplicada em produção (ncxttwvpafajnilpjbol) em 2026-11-05 via SQL Editor/MCP.
-- Idempotente: pode ser executada novamente sem erro.

create table if not exists public.gn_carne_contagem_obrigatoria (
  data       date primary key,
  motivo     text,
  criado_por text,
  criado_em  timestamptz default now()
);

alter table public.gn_carne_contagem_obrigatoria enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'gn_carne_contagem_obrigatoria'
      and policyname = 'acesso_total_carne_contagem_obrigatoria'
  ) then
    create policy acesso_total_carne_contagem_obrigatoria
      on public.gn_carne_contagem_obrigatoria
      for all using (true) with check (true);
  end if;
end $$;

alter table public.gn_contagens_pedido
  add column if not exists zero_justificativa text;
