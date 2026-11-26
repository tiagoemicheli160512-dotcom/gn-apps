-- Liberação da supervisão para os Vendidos do dia (26/11/2026).
-- Antes a liberação ficava só no aparelho de quem digitou a senha (localStorage, e ainda
-- presa ao usuário logado): liberava num celular e o resto da loja continuava travado.
-- Agora fica no banco, por loja, e vale em qualquer aparelho da loja.
--   tipo LANCAMENTO: libera o lançamento atrasado do dia `data_venda` (qualquer gerente/sub
--                    da loja lança, fica marcado como atrasado com quem liberou).
--   tipo ACESSO:     libera o acesso da loja no dia `dia` sem lançar (o dia segue pendente).
create table if not exists public.gn_vendidos_liberacao (
  id uuid primary key default gen_random_uuid(),
  loja text not null,
  tipo text not null check (tipo in ('LANCAMENTO','ACESSO')),
  data_venda date,
  dia date not null,
  liberado_por text not null,
  liberado_em timestamptz not null default now()
);
create index if not exists gn_vendidos_liberacao_loja_dia on public.gn_vendidos_liberacao (loja, dia);
alter table public.gn_vendidos_liberacao enable row level security;
drop policy if exists gn_vendidos_liberacao_all on public.gn_vendidos_liberacao;
create policy gn_vendidos_liberacao_all on public.gn_vendidos_liberacao for all using (true) with check (true);
grant select, insert on public.gn_vendidos_liberacao to anon, authenticated;
