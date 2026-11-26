-- Metas de faturamento (Etapa 4, 26/11/2026): um cadastro ÚNICO da rede, sempre MENSAL.
-- Antes ficava em gn_usuarios.permissoes.dashboard_metas de quem cadastrou — cada gestor
-- via a sua. O Painel calcula semana/dia/trimestre proporcional aos dias do período.
-- (Aplicada via MCP como "metas_lojas_mensal".)
create table if not exists public.gn_metas_lojas (
  loja           text primary key,
  meta_mensal    numeric not null default 0 check (meta_mensal >= 0),
  atualizado_por text,
  atualizado_em  timestamptz not null default now()
);
alter table public.gn_metas_lojas enable row level security;
drop policy if exists acesso_total_metas_lojas on public.gn_metas_lojas;
create policy acesso_total_metas_lojas on public.gn_metas_lojas for all using (true) with check (true);
grant select, insert, update on public.gn_metas_lojas to anon, authenticated;

insert into public.gn_metas_lojas (loja, meta_mensal, atualizado_por)
select m.key, (m.value)::text::numeric, u.nome || ' (migrado do cadastro anterior)'
from public.gn_usuarios u, jsonb_each(u.permissoes->'dashboard_metas') m
where jsonb_typeof(u.permissoes->'dashboard_metas') = 'object' and jsonb_typeof(m.value) = 'number' and (m.value)::text::numeric > 0
on conflict (loja) do nothing;
