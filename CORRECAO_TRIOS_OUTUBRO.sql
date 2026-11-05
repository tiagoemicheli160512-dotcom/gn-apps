-- Correção de dado da aba Trios, em duas partes.
-- Rodar no SQL Editor do Supabase (projeto ncxttwvpafajnilpjbol).
--
-- As duas partes são independentes: dá pra rodar uma, conferir, e rodar a outra.
-- Backup das linhas da PARTE 1 em scratchpad/backup_trios_outubro_1a_importacao.json.


-- ════════════════════════════════════════════════════════════════════════════
-- CONFERIR ANTES (não muda nada)
-- ════════════════════════════════════════════════════════════════════════════

-- Deve mostrar 2 lotes de 94 linhas cada: 28/09 10h22 e 29/09 18h18.
select date_trunc('minute', created_at at time zone 'America/Sao_Paulo') lote, count(*) linhas
from gn_trios_agenda
where data between '2026-10-01' and '2026-10-31'
group by 1 order by 1;

-- Deve mostrar 12 linhas com cachê zero, em 6 grafias.
select artista, count(*) lancamentos, count(*) filter (where confirmado) confirmados
from gn_trios_agenda
where coalesce(cache, 0) = 0
group by artista order by lancamentos desc;


-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — apagar a 1ª importação de outubro (esperado: 94 linhas)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Outubro foi importado duas vezes. Não foi engano: a agenda mudou de fato entre as duas
-- (5 alterações de horário/banda), então a de 29/09 18h18 é a válida.
--
-- As cláusulas depois da data são trava de segurança: se alguma linha tiver ganhado
-- confirmação, presença, couver ou "banda não veio" nesse meio-tempo, ela NÃO é apagada.
-- Na conferência nenhuma das 94 tinha qualquer um desses — então o esperado é 94 linhas.
-- Se vier menos que 94, alguma ganhou lançamento: conferir antes de seguir.

delete from gn_trios_agenda
where data between '2026-10-01' and '2026-10-31'
  and created_at at time zone 'America/Sao_Paulo' < '2026-09-29'
  and not confirmado and not presenca_confirmada and not banda_nao_veio
  and coalesce(couver_qtd, 0) = 0 and coalesce(couver_valor, 0) = 0;


-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — corrigir os cachês que entraram R$ 0 por grafia
-- ════════════════════════════════════════════════════════════════════════════
--
-- A lista de cachês do app comparava o nome exato (só em minúscula), então grafia com espaço
-- duplo, sem o "e", sem o "do" ou com letra trocada não achava cachê e gravava zero. São 12
-- lançamentos, 3 deles JÁ CONFIRMADOS — banda que tocou e ficou registrada valendo zero.
--
-- A raiz já está corrigida no app (PR #977: busca normalizada + mapa de apelidos). Isto acerta
-- o que já estava gravado.
--
-- Só toca linha que está em zero: nunca sobrescreve cachê digitado na mão.

update gn_trios_agenda a
set cache = v.cache
from (values
  ('Trio ZABELLE',                800),   -- = Trio ZABELÊ
  ('ZABELLE',                     800),
  ('Elcinho Trio Forró Moderno',  800),   -- = Elcinho e Trio Forró Moderno (sem o "e")
  ('Elcinho  Trio Forró Moderno', 800),   -- espaço duplo
  ('Trio Silvas  do Forro',       600),   -- = Trio Silvas do Forró (espaço duplo)
  ('Trio Silvas do Farro',        600),   -- "Farro" por "Forró"
  ('Trio Amigos Forro',           700),   -- = Trio Amigos do Forró (sem o "do")
  ('Trio Amigos Forró',           700)
) as v(grafia, cache)
where a.artista = v.grafia
  and coalesce(a.cache, 0) = 0;


-- ════════════════════════════════════════════════════════════════════════════
-- CONFERIR DEPOIS
-- ════════════════════════════════════════════════════════════════════════════

-- Deve sobrar 1 lote só, de 94 linhas (29/09 18h18).
select date_trunc('minute', created_at at time zone 'America/Sao_Paulo') lote, count(*) linhas
from gn_trios_agenda
where data between '2026-10-01' and '2026-10-31'
group by 1 order by 1;

-- Deve voltar vazio: nenhum lançamento com cachê zero.
select data, loja, artista, cache, confirmado
from gn_trios_agenda
where coalesce(cache, 0) = 0
order by data;

-- As 5 alterações da agenda, pra confirmar que ficou a versão certa:
--   03/10 Caxias   Trio 100% Pé Serra      19:00  (era 13:00)
--   17/10 Caxias   Trio Rony do Forro      19:00  (era Trilha do Forró 13:00)
--   17/10 Itaquera Trio ZABELLE                   (era Trio SP Baiao)
--   24/10 Caxias   Trio Trilha do Forró    19:00  (era Íris Pontal In Trio 13:00)
--   31/10 Caxias   Trio Amigos do Forro    19:00  (era 13:00)
select data, loja, artista, horario_inicio, cache
from gn_trios_agenda
where data in ('2026-10-03','2026-10-17','2026-10-24','2026-10-31')
  and loja in ('caxias','itaquera')
order by data, loja;
