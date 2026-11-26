-- Aviso "loja recebeu e não lançou NF" (Etapa 6, 26/11/2026).
-- A cobrança de nota fiscal está desligada desde 09/09/2026 (casava fornecedor pelo nome —
-- "AMBEV" no Pedido × razão social na nota — e virava pendência falsa em massa). Esta conta
-- não casa fornecedor: compara, por loja e semana, o valor que a loja CONFIRMOU ter recebido
-- (aba Entrega → gn_recebimentos) com o valor das NF que ela LANÇOU (aba Entradas →
-- gn_lojas.all_data.entradasAll["LOJA|segunda"]). Só leitura; devolve só os totais, pra o
-- Painel não baixar o all_data inteiro das lojas.
--   tipo 'rec': chave = loja_slug · n = itens recebidos · valor = R$ recebido
--   tipo 'nf' : chave = loja (userKey) · n = linhas de entrada · valor = R$ lançado (qtd × custo)
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
  select 'nf'::text, l.loja, jsonb_array_length(z.e),
         coalesce((select round(sum(coalesce((x->>'qtd')::numeric, 0) * coalesce((x->>'custoUnit')::numeric, 0)), 2) from jsonb_array_elements(z.e) x), 0)
    from gn_lojas l
    cross join lateral (select coalesce(l.all_data->'entradasAll'->(l.loja || '|' || p_semana::text), '[]'::jsonb) as e) z
   where l.all_data ? 'entradasAll';
$$;
grant execute on function public.gn_nf_semana(date) to anon, authenticated;
