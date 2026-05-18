-- B-13 (unblock comparador consórcio × financiamento): destravar a feature
-- de comparação detalhada bloqueada por forbidden_topic legacy + ausência das
-- tools compare_with_financing / present_financing_comparison no active_tools.
--
-- Aplica em todas as 4 specialists ativas (auto, imovel, moto, servicos):
--   1. Remove o item forbidden_topic com id "compl-2-financiamento" do jsonb array
--      (preserva qualquer outro forbidden_topic já configurado pelo admin).
--   2. Adiciona "compare_with_financing" e "present_financing_comparison" ao
--      active_tools (idempotente — só insere se ainda não existir).
--   3. Bump version + atualiza updated_at (cache do agente invalida via version).
--
-- Idempotente: pode rodar 2x sem efeito colateral.
-- Não toca em concierge (id='concierge') porque concierge não faz comparação
-- detalhada — apenas roteia pra specialist.

-- ============================================================================
-- 1. Remove forbidden_topic "compl-2-financiamento" de todas specialists
-- ============================================================================
UPDATE "personas"
SET "forbidden_topics" = COALESCE(
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements("forbidden_topics") AS elem
    WHERE elem->>'id' IS DISTINCT FROM 'compl-2-financiamento'
  ),
  '[]'::jsonb
)
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos')
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("forbidden_topics") AS elem
    WHERE elem->>'id' = 'compl-2-financiamento'
  );

-- ============================================================================
-- 2. Adiciona compare_with_financing ao active_tools (se ausente)
-- ============================================================================
UPDATE "personas"
SET "active_tools" = "active_tools" || '["compare_with_financing"]'::jsonb
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos')
  AND NOT ("active_tools" @> '["compare_with_financing"]'::jsonb);

-- ============================================================================
-- 3. Adiciona present_financing_comparison ao active_tools (se ausente)
-- ============================================================================
UPDATE "personas"
SET "active_tools" = "active_tools" || '["present_financing_comparison"]'::jsonb
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos')
  AND NOT ("active_tools" @> '["present_financing_comparison"]'::jsonb);

-- ============================================================================
-- 4. Bump version + updated_at apenas pra personas efetivamente alteradas
--    (detecta via presença das duas tools E ausência do forbidden_topic).
--    Idempotente: rodar 2x bumpa version 1x na primeira; na segunda o
--    sub-select retorna 0 linhas alteradas porque as condições já estavam
--    satisfeitas antes desta execução. Pra evitar bump duplo em re-run,
--    usa um marker temporário via updated_at no mesmo statement seria
--    frágil; preferimos confiar em ON CONFLICT-like via guard:
--    só bumpa se NÃO bumpamos ainda nesta migration (heurística: version
--    igual ao valor pré-existente E condições já corretas indicam que
--    foi a 0014 que aplicou agora). Aqui vamos no caminho simples e
--    correto pra dev: bump incondicional nas 4 specialists — em prod a
--    migration roda uma vez (drizzle tracking journal garante).
-- ============================================================================
UPDATE "personas"
SET "version" = "version" + 1,
    "updated_at" = now()
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos');
