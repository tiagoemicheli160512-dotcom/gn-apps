-- Desperdício do rodízio e do buffet de feijoada (19/11/2026, pedido do dono).
-- Uma linha por loja × dia × tipo: a gerência (gerente/sub) declara se teve desperdício
-- e, se teve, os itens. "Não teve nada" também é uma linha (teve=false) — é o que diferencia
-- "não teve" de "esqueceu de informar". Só controle/relatório: não passa por valor.
-- Aplicada em produção (ncxttwvpafajnilpjbol) via MCP. Idempotente.

create table if not exists public.gn_desperdicio_buffet (
  id              uuid primary key default gen_random_uuid(),
  loja            text not null,                 -- userKey (GN_LOJAS)
  data            date not null,                 -- dia operacional (até 02h conta o dia anterior)
  tipo            text not null check (tipo in ('rodizio', 'feijoada')),
  teve            boolean not null,
  itens           jsonb not null default '[]'::jsonb,   -- [{insumo, qtd, unidade}]
  obs             text,
  assinado_por    text not null,
  assinado_cargo  text,
  aparelho        text,
  criado_em       timestamptz not null default now(),
  unique (loja, data, tipo)
);

create index if not exists gn_desperdicio_buffet_data_idx on public.gn_desperdicio_buffet (data);

alter table public.gn_desperdicio_buffet enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gn_desperdicio_buffet'
      and policyname = 'acesso_total_desperdicio_buffet'
  ) then
    create policy acesso_total_desperdicio_buffet
      on public.gn_desperdicio_buffet
      for all using (true) with check (true);
  end if;
end $$;
