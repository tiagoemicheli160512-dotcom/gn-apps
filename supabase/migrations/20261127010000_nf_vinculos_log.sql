-- Registro dos vínculos "nome da nota → item do Pedido" criados pelo app Lojas (27/11/2026),
-- pra o Compras conferir no Painel e desfazer o que estiver errado. Não destrutiva.
create table if not exists public.gn_nf_vinculos_log (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,          -- nome na nota (chave de nfMapeamentos)
  insumo text not null,             -- item do Pedido (nome único)
  origem text not null,             -- nota | lote_nota | sugestao | revisao | xml_manual
  loja text,                        -- userKey da loja onde foi criado
  nf text,
  fornecedor text,
  por text,
  criado_em timestamptz not null default now(),
  desfeito_em timestamptz,
  desfeito_por text
);
create index if not exists gn_nf_vinculos_log_criado on public.gn_nf_vinculos_log (criado_em desc);
alter table public.gn_nf_vinculos_log enable row level security;
drop policy if exists gn_nf_vinculos_log_ler on public.gn_nf_vinculos_log;
create policy gn_nf_vinculos_log_ler on public.gn_nf_vinculos_log for select using (true);
grant select on public.gn_nf_vinculos_log to anon, authenticated;

-- Grava uma leva de vínculos (o app manda depois de salvar o nfMapeamentos).
create or replace function public.gn_nf_vinculo_registrar(p_itens jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare a jsonb; n integer := 0;
begin
  for a in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    if coalesce(a->>'descricao', '') = '' or coalesce(a->>'insumo', '') = '' then continue; end if;
    insert into gn_nf_vinculos_log (descricao, insumo, origem, loja, nf, fornecedor, por)
    values (left(a->>'descricao', 300), left(a->>'insumo', 300), coalesce(left(a->>'origem', 30), 'sugestao'),
            left(a->>'loja', 60), left(a->>'nf', 40), left(a->>'fornecedor', 120), left(a->>'por', 80));
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.gn_nf_vinculo_registrar(jsonb) to anon, authenticated;

-- Desfaz um vínculo: tira do nfMapeamentos do MASTER_CONFIG (só se ainda aponta pro mesmo
-- item) e deixa a marca em nfMapeamentosRemovidos — os aparelhos têm cópia local do
-- nfMapeamentos e, sem a marca, o próximo que salvasse traria o vínculo de volta.
create or replace function public.gn_nf_vinculo_desfazer(p_id uuid, p_por text)
returns text language plpgsql security definer set search_path = public as $$
declare v gn_nf_vinculos_log%rowtype; atual text;
begin
  select * into v from gn_nf_vinculos_log where id = p_id;
  if not found then return 'nao_encontrado'; end if;
  if v.desfeito_em is not null then return 'ja_desfeito'; end if;
  select all_data->'nfMapeamentos'->>v.descricao into atual from gn_lojas where loja = 'MASTER_CONFIG';
  update gn_lojas set
    all_data = jsonb_set(
      case when atual = v.insumo then jsonb_set(all_data, '{nfMapeamentos}', coalesce(all_data->'nfMapeamentos', '{}'::jsonb) - v.descricao) else all_data end,
      '{nfMapeamentosRemovidos}', coalesce(all_data->'nfMapeamentosRemovidos', '{}'::jsonb) || jsonb_build_object(v.descricao, v.insumo)),
    updated_at = now()
  where loja = 'MASTER_CONFIG';
  update gn_nf_vinculos_log set desfeito_em = now(), desfeito_por = left(p_por, 80)
   where descricao = v.descricao and insumo = v.insumo and desfeito_em is null;
  return case when atual = v.insumo then 'desfeito' else 'ja_mudou' end;
end $$;
grant execute on function public.gn_nf_vinculo_desfazer(uuid, text) to anon, authenticated;
