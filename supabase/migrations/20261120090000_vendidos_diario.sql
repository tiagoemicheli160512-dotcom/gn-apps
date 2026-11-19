-- Vendidos do dia: carnes (pelos pratos), Coca-Cola e chopp (20/11/2026, pedido do dono).
-- "Completar o controle das carnes e controlar Coca-Cola e chopp em vendas: a quantidade
-- vendida por dia, lançada pelo gerente ou sub até 11h do dia seguinte — depois trava.
-- Nas carnes e no camarão, os pratos com a gramatura, pra multiplicar pela quantidade."
--
-- gn_vendidos_itens: o cadastro (global — o cardápio é o mesmo nas 11 lojas). Editado pelo
--   Painel de Gestão › Vendidos (master). Prato tem `gramas` por carne (gramas de estoque
--   por unidade vendida); chopp tem `ml` por unidade e o tipo do barril; Coca é unidade.
-- gn_vendidos_diario: uma linha por loja × dia. `itens` guarda a FOTO do cadastro no
--   momento do lançamento (nome, gramas, ml) — mudar a gramatura amanhã não reescreve o
--   que já foi lançado. `totais` é a conta pronta (kg por carne, un de Coca, litros de
--   chopp por tipo), pro Painel ler sem refazer.
-- Aplicada em produção (ncxttwvpafajnilpjbol) via MCP. Idempotente.

create table if not exists public.gn_vendidos_itens (
  id             text primary key default gen_random_uuid()::text,
  grupo          text not null check (grupo in ('prato', 'coca', 'chopp')),
  nome           text not null,
  codigo_pdv     text,
  gramas         jsonb not null default '{}'::jsonb,   -- {carne_sol, picanha, carne_seca, camarao}: g por unidade
  ml             numeric,                              -- chopp: ml por unidade vendida
  chopp_tipo     text check (chopp_tipo is null or chopp_tipo in ('CLARO', 'VINHO')),
  ativo          boolean not null default true,
  ordem          integer not null default 0,
  atualizado_por text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.gn_vendidos_diario (
  loja           text not null,                        -- userKey (GN_LOJAS)
  data           date not null,                        -- dia da venda
  itens          jsonb not null default '{}'::jsonb,   -- {item_id: {q, nome, grupo, gramas, ml, chopp_tipo}}
  totais         jsonb not null default '{}'::jsonb,   -- {carne_sol, picanha, carne_seca, camarao (kg), coca_un, chopp_l_claro, chopp_l_vinho}
  lancado_por    text not null,
  lancado_cargo  text,
  aparelho       text,
  atrasado       boolean not null default false,       -- lançado depois das 11h do dia seguinte (com liberação)
  liberado_por   text,                                 -- supervisão que liberou o lançamento atrasado
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  primary key (loja, data)
);

create index if not exists gn_vendidos_diario_data_idx on public.gn_vendidos_diario (data);

alter table public.gn_vendidos_itens enable row level security;
alter table public.gn_vendidos_diario enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'gn_vendidos_itens' and policyname = 'acesso_total_vendidos_itens') then
    create policy acesso_total_vendidos_itens on public.gn_vendidos_itens for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'gn_vendidos_diario' and policyname = 'acesso_total_vendidos_diario') then
    create policy acesso_total_vendidos_diario on public.gn_vendidos_diario for all using (true) with check (true);
  end if;
end $$;

-- Ponto de partida: Coca e chopp que já estavam no catálogo de vendas do Check-list
-- (PRATOS_VENDA, BEB001/BEB002/BEB021–BEB024). Os pratos ficam pro cadastro do Painel
-- (com sugestão a partir das fichas técnicas) — a gramatura é decisão do dono.
insert into public.gn_vendidos_itens (id, grupo, nome, codigo_pdv, ml, chopp_tipo, ordem) values
  ('coca_ks',       'coca',  'Coca-Cola KS 290 ml',      'BEB021', null, null,    1),
  ('coca_lata',     'coca',  'Coca-Cola lata 350 ml',    'BEB022', null, null,    2),
  ('coca_zero_ks',  'coca',  'Coca-Cola Zero KS 290 ml', 'BEB023', null, null,    3),
  ('coca_zero_lata','coca',  'Coca-Cola Zero lata 350 ml','BEB024', null, null,   4),
  ('chopp_claro_350','chopp','Chopp claro 350 ml',       'BEB001', 350,  'CLARO', 1),
  ('chopp_vinho_350','chopp','Chopp de vinho 350 ml',    'BEB002', 350,  'VINHO', 2)
on conflict (id) do nothing;
