-- Registro dos bloqueios (26/11/2026). "Quero uma aba no Painel com o ranking das lojas com
-- mais caso de bloqueio — dia, semana, mês e trimestre — isso mostra o quanto a loja faz e os
-- que só fazem por obrigação, sem respeitar os prazos."
-- Até aqui nenhuma das ~20 travas deixava rastro: eram calculadas na hora e sumiam quando a
-- loja resolvia. Decisões do dono: registrar a partir de agora (sem reconstruir o passado);
-- 1 caso = 1 tipo de trava num dia, mais o tempo que a loja ficou travada.
--   Uma linha por loja × tipo × dia. primeiro_em = quando um app viu a trava pela 1ª vez
--   naquele dia; resolvido_em = quando um app viu que ela tinha saído (vazio = ainda travada).
create table if not exists public.gn_travas_registro (
  loja text not null,                 -- userKey (BANGU, SÃO GONÇALO…)
  tipo text not null,                 -- vendidos, carnes, nota_fiscal, entrega…
  dia date not null,                  -- dia (Brasília) em que estava travada
  app text,                           -- app que viu (checklist, lojas, home…)
  hard boolean not null default false,-- bloqueio total (escalado) em algum momento do dia
  detalhe text,
  primeiro_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now(),
  resolvido_em timestamptz,
  primary key (loja, tipo, dia)
);
create index if not exists gn_travas_registro_dia on public.gn_travas_registro (dia);
alter table public.gn_travas_registro enable row level security;
drop policy if exists gn_travas_registro_ler on public.gn_travas_registro;
create policy gn_travas_registro_ler on public.gn_travas_registro for select using (true);
grant select on public.gn_travas_registro to anon, authenticated;

-- Sincroniza o que UM app vê agora pra UMA loja: p_tipos = tipos que esse app trata (os que
-- ele sabe avaliar); p_ativas = [{tipo, hard, detalhe}] travadas neste momento. Abre/atualiza
-- as ativas no dia de hoje e marca como resolvidas as abertas desses tipos que não estão mais
-- ativas. Gravação só por aqui (sem insert/update direto pelo anon).
create or replace function public.gn_travas_sync(p_loja text, p_app text, p_tipos text[], p_ativas jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  a jsonb; n integer := 0;
begin
  if p_loja is null or p_loja = '' or upper(p_loja) in ('GERAL', 'MAGLIA') then return 0; end if;
  for a in select * from jsonb_array_elements(coalesce(p_ativas, '[]'::jsonb)) loop
    if (a->>'tipo') is null or not ((a->>'tipo') = any(p_tipos)) then continue; end if;
    insert into gn_travas_registro (loja, tipo, dia, app, hard, detalhe)
    values (p_loja, a->>'tipo', hoje, p_app, coalesce((a->>'hard')::boolean, false), left(a->>'detalhe', 300))
    on conflict (loja, tipo, dia) do update
      set ultimo_visto_em = now(), resolvido_em = null,
          hard = gn_travas_registro.hard or excluded.hard,
          detalhe = coalesce(excluded.detalhe, gn_travas_registro.detalhe);
    n := n + 1;
  end loop;
  -- Linha de um dia anterior ainda aberta: o dia acabou — fecha à meia-noite (Brasília) dele;
  -- se a trava continua, a linha de hoje (acima) segue a conta.
  update gn_travas_registro r set resolvido_em = ((r.dia + 1)::timestamp at time zone 'America/Sao_Paulo')
   where r.loja = p_loja and r.resolvido_em is null and r.tipo = any(p_tipos) and r.dia < hoje;
  update gn_travas_registro r set resolvido_em = now()
   where r.loja = p_loja and r.resolvido_em is null and r.tipo = any(p_tipos)
     and not exists (select 1 from jsonb_array_elements(coalesce(p_ativas, '[]'::jsonb)) x where x->>'tipo' = r.tipo);
  return n;
end $$;
grant execute on function public.gn_travas_sync(text, text, text[], jsonb) to anon, authenticated;
