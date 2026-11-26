-- gn_nf_semana: a NF conta pela DATA DA NOTA (26/11/2026, trava de NF no app Lojas).
-- Cargo de loja só enxerga a semana atual no app Lojas, então a nota da semana passada
-- lançada hoje cai no balde da semana de hoje — sem isto, a trava pedia uma nota que a loja
-- não tinha onde lançar. Agora a semana W soma: o balde W + as linhas do balde W+7 cuja
-- data da nota (dataNF) está dentro de W. O Painel (aviso) e o app Lojas (trava) usam a
-- mesma conta. Só leitura; substitui a função de 20261126180000 (mesma assinatura).
create or replace function public.gn_nf_semana(p_semana date)
returns table(tipo text, chave text, n integer, valor numeric)
language sql stable
as $$
  select 'rec'::text, p.loja_slug, count(*)::int, round(sum(coalesce(r.valor_recebido, p.valor_previsto, 0))::numeric, 2)
    from gn_recebimentos r join gn_provisoes p on p.id = r.provisao_id
   where (r.validado_em at time zone 'America/Sao_Paulo')::date between p_semana and p_semana + 6
     and coalesce(r.qtd_recebida, 0) > 0
   group by p.loja_slug
  union all
  select 'nf'::text, l.loja, count(x.*)::int,
         coalesce(round(sum(coalesce((x.e->>'qtd')::numeric, 0) * coalesce((x.e->>'custoUnit')::numeric, 0)), 2), 0)
    from gn_lojas l
    left join lateral (
      select e from jsonb_array_elements(coalesce(l.all_data->'entradasAll'->(l.loja || '|' || p_semana::text), '[]'::jsonb)) e
      union all
      select e from jsonb_array_elements(coalesce(l.all_data->'entradasAll'->(l.loja || '|' || (p_semana + 7)::text), '[]'::jsonb)) e
       where left(coalesce(e->>'dataNF', ''), 10) between p_semana::text and (p_semana + 6)::text
    ) x on true
   where l.all_data ? 'entradasAll'
   group by l.loja;
$$;
grant execute on function public.gn_nf_semana(date) to anon, authenticated;
