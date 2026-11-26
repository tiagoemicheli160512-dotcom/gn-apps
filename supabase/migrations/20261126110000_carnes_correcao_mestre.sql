-- Correção de carnes pelo MESTRE no Painel de Gestão (26/11/2026).
-- Grava na RAIZ (contagem do app Lojas / recebimento da aba Entrega) e na cópia que o
-- Check-list guarda em checklist_carnes, numa transação só, com o valor anterior em
-- gn_backup_ajustes. Nada é apagado. (Aplicada via MCP como "carnes_correcao_mestre".)

create or replace function public.gn_carnes_mestre_inicial(
  p_loja_slug text, p_loja_chk text, p_catalogo_id uuid, p_corte text,
  p_semana date, p_valor numeric, p_por text)
returns jsonb language plpgsql as $$
declare
  v_dia date; v_antes jsonb; v_agora text;
  v_chk jsonb; v_prev jsonb; v_inseriu boolean := false;
begin
  if p_valor is null or p_valor < 0 then raise exception 'valor_invalido'; end if;
  if p_corte not in ('carne_sol','carne_seca','picanha','camarao') then raise exception 'corte_invalido'; end if;
  if coalesce(trim(p_por),'') = '' then raise exception 'sem_autor'; end if;
  v_agora := to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  -- Raiz: a contagem de abertura (segunda, ou até 2 dias depois quando a segunda foi feriado
  -- — mesma tolerância do Check-list, CARNES_ABERTURA_TOLERANCIA_DIAS).
  select min(data_contagem) into v_dia from gn_contagens_pedido
   where loja_slug = p_loja_slug and catalogo_id = p_catalogo_id
     and data_contagem between p_semana and p_semana + 2;
  if v_dia is not null then
    select jsonb_agg(to_jsonb(c)) into v_antes from gn_contagens_pedido c
     where loja_slug = p_loja_slug and catalogo_id = p_catalogo_id and data_contagem = v_dia;
    update gn_contagens_pedido set atual = p_valor
     where loja_slug = p_loja_slug and catalogo_id = p_catalogo_id and data_contagem = v_dia;
  else
    v_dia := p_semana; v_inseriu := true;
    insert into gn_contagens_pedido(catalogo_id, loja_slug, atual, data_contagem, criado_por, criado_em)
    values (p_catalogo_id, p_loja_slug, p_valor, p_semana, p_por || ' (correção mestre no Painel)', now());
  end if;

  -- Cópia no Check-list: inicial desta semana e contagem_final da anterior. O marcador
  -- <campo>MestreEm faz a mesclagem do Check-list manter o valor do servidor (ver
  -- _mesclarCarnesAntesDeSalvar): um aparelho com a tela aberta não desfaz a correção.
  select carnes into v_chk from checklist_carnes where loja = p_loja_chk and semana_inicio = p_semana;
  if found then
    update checklist_carnes set
      carnes = jsonb_set(coalesce(carnes,'{}'::jsonb), array[p_corte],
                 coalesce(carnes->p_corte,'{}'::jsonb) || jsonb_build_object(
                   'inicial', p_valor, 'inicialDe', to_char(v_dia,'YYYY-MM-DD'),
                   'inicialMestreEm', v_agora, 'inicialMestrePor', p_por)),
      updated_at = now()
     where loja = p_loja_chk and semana_inicio = p_semana;
  end if;
  select carnes into v_prev from checklist_carnes where loja = p_loja_chk and semana_inicio = p_semana - 7;
  if found then
    update checklist_carnes set
      carnes = jsonb_set(coalesce(carnes,'{}'::jsonb), array[p_corte],
                 coalesce(carnes->p_corte,'{}'::jsonb) || jsonb_build_object(
                   'contagem_final', p_valor,
                   'contagem_finalMestreEm', v_agora, 'contagem_finalMestrePor', p_por)),
      updated_at = now()
     where loja = p_loja_chk and semana_inicio = p_semana - 7;
  end if;

  insert into gn_backup_ajustes(motivo, dados) values (
    'carnes: estoque inicial corrigido pelo mestre no Painel',
    jsonb_build_object('por', p_por, 'loja_slug', p_loja_slug, 'loja_chk', p_loja_chk, 'corte', p_corte,
      'semana', p_semana, 'dia_contagem', v_dia, 'novo', p_valor, 'inseriu_contagem', v_inseriu,
      'contagem_antes', v_antes,
      'chk_inicial_antes', v_chk->p_corte->'inicial',
      'chk_contagem_final_ant_antes', v_prev->p_corte->'contagem_final'));

  return jsonb_build_object('ok', true, 'dia_contagem', v_dia, 'inseriu', v_inseriu,
    'chk_semana', v_chk is not null, 'chk_anterior', v_prev is not null);
end $$;

create or replace function public.gn_carnes_mestre_entrega(
  p_recebimento_id uuid, p_valor numeric, p_por text,
  p_loja_chk text, p_semana date, p_corte text, p_dia text)
returns jsonb language plpgsql as $$
declare
  v_rec gn_recebimentos%rowtype; v_delta numeric; v_agora text;
  v_chk jsonb; v_c jsonb; v_ent numeric; v_auto numeric; v_ent_txt text; v_auto_txt text;
  v_manual boolean := false; v_ajustou boolean := false;
begin
  if p_valor is null or p_valor < 0 then raise exception 'valor_invalido'; end if;
  if p_corte not in ('carne_sol','carne_seca','picanha','camarao') then raise exception 'corte_invalido'; end if;
  if p_dia not in ('seg','ter','qua','qui','sex','sab','dom') then raise exception 'dia_invalido'; end if;
  if coalesce(trim(p_por),'') = '' then raise exception 'sem_autor'; end if;
  v_agora := to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  select * into v_rec from gn_recebimentos where id = p_recebimento_id for update;
  if not found then raise exception 'recebimento_nao_encontrado'; end if;
  v_delta := p_valor - coalesce(v_rec.qtd_recebida, 0);

  update gn_recebimentos set qtd_recebida = p_valor,
         diferenca_qtd = coalesce(diferenca_qtd, 0) + v_delta
   where id = p_recebimento_id;

  -- Cópia no Check-list: só mexe no dia quando ele é da AUTOMAÇÃO (ent_<dia> igual ao
  -- espelho autoEnt_<dia>, ou os dois vazios). Número digitado à mão pela loja não é
  -- tocado — a resposta avisa. A estampa autoEntEm nova faz este bloco vencer a mesclagem;
  -- a próxima rodada da automação no Check-list recalcula tudo da raiz de novo.
  select carnes into v_chk from checklist_carnes where loja = p_loja_chk and semana_inicio = p_semana;
  if found and v_delta <> 0 then
    v_c := coalesce(v_chk->p_corte, '{}'::jsonb);
    v_ent_txt := nullif(v_c->>('ent_'||p_dia), '');
    v_auto_txt := nullif(v_c->>('autoEnt_'||p_dia), '');
    v_ent := v_ent_txt::numeric; v_auto := v_auto_txt::numeric;
    if (v_ent is null and v_auto is null) or (v_ent is not distinct from v_auto) or (v_ent is null and v_auto is not null) then
      v_c := v_c || jsonb_build_object(
        'ent_'||p_dia, greatest(0, coalesce(v_auto, v_ent, 0) + v_delta),
        'autoEnt_'||p_dia, greatest(0, coalesce(v_auto, v_ent, 0) + v_delta),
        'autoEntEm', v_agora);
      update checklist_carnes set carnes = jsonb_set(carnes, array[p_corte], v_c), updated_at = now()
       where loja = p_loja_chk and semana_inicio = p_semana;
      v_ajustou := true;
    else
      v_manual := true;
    end if;
  end if;

  insert into gn_backup_ajustes(motivo, dados) values (
    'carnes: entrega corrigida pelo mestre no Painel',
    jsonb_build_object('por', p_por, 'loja_chk', p_loja_chk, 'corte', p_corte, 'semana', p_semana,
      'dia', p_dia, 'novo', p_valor, 'delta', v_delta, 'recebimento_antes', to_jsonb(v_rec),
      'chk_ent_antes', v_chk->p_corte->('ent_'||p_dia), 'chk_auto_antes', v_chk->p_corte->('autoEnt_'||p_dia)));

  return jsonb_build_object('ok', true, 'delta', v_delta, 'chk_ajustado', v_ajustou, 'chk_manual', v_manual);
end $$;

grant execute on function public.gn_carnes_mestre_inicial(text,text,uuid,text,date,numeric,text) to anon, authenticated;
grant execute on function public.gn_carnes_mestre_entrega(uuid,numeric,text,text,date,text,text) to anon, authenticated;
