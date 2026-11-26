-- Pergunta diária do app Lojas (Etapa 3, 26/11/2026): "algum barril foi finalizado?".
-- Uma linha por loja por dia; a primeira resposta do dia resolve pra loja. Finalizar um
-- barril pelo botão também grava SIM (com a quantidade do dia). Só registro — não trava.
-- (Aplicada via MCP como "barris_resposta_diaria".)
create table if not exists public.gn_barris_resposta_diaria (
  loja_slug      text        not null,
  dia            date        not null,
  resposta       text        not null check (resposta in ('SIM','NAO')),
  finalizados    integer     not null default 0,
  respondido_por text,
  cargo          text,
  respondido_em  timestamptz not null default now(),
  primary key (loja_slug, dia)
);
alter table public.gn_barris_resposta_diaria enable row level security;
drop policy if exists acesso_total_barris_resposta on public.gn_barris_resposta_diaria;
create policy acesso_total_barris_resposta on public.gn_barris_resposta_diaria for all using (true) with check (true);
grant select, insert, update on public.gn_barris_resposta_diaria to anon, authenticated;
