-- BUG-LEAD-CAPTURE-WEB (descoberto em 2026-05-18): personas specialist no DB
-- não tinham `save_contact_name`, `save_contact_whatsapp`, `present_whatsapp_optin`
-- em active_tools. Builder em src/lib/agent/agents/builder.ts filtra tools
-- pelo activeTools → agent nunca recebe as tools de captura no contexto →
-- lead nunca era criado conversacionalmente; só nascia ao clicar o card de
-- opt-in WhatsApp (handler fora do agent loop).
--
-- Esta migration aplica em todas as 4 specialists ativas (auto, imovel,
-- moto, servicos):
--   1. Adiciona "save_contact_name" ao active_tools (idempotente).
--   2. Adiciona "save_contact_whatsapp" ao active_tools (idempotente).
--   3. Adiciona "present_whatsapp_optin" ao active_tools (idempotente).
--   4. Bump version + atualiza updated_at (cache do agente invalida via version).
--
-- Idempotente: pode rodar 2x sem efeito colateral.
-- Não toca em concierge (id='concierge') porque concierge não qualifica
-- usuário — não captura nome/WhatsApp. Só specialists o fazem.
--
-- Mesmo padrão da 0014_unblock_financing_comparison.sql.

-- ============================================================================
-- 1. Adiciona save_contact_name ao active_tools (se ausente)
-- ============================================================================
UPDATE "personas"
SET "active_tools" = "active_tools" || '["save_contact_name"]'::jsonb
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos')
  AND NOT ("active_tools" @> '["save_contact_name"]'::jsonb);

-- ============================================================================
-- 2. Adiciona save_contact_whatsapp ao active_tools (se ausente)
-- ============================================================================
UPDATE "personas"
SET "active_tools" = "active_tools" || '["save_contact_whatsapp"]'::jsonb
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos')
  AND NOT ("active_tools" @> '["save_contact_whatsapp"]'::jsonb);

-- ============================================================================
-- 3. Adiciona present_whatsapp_optin ao active_tools (se ausente)
-- ============================================================================
UPDATE "personas"
SET "active_tools" = "active_tools" || '["present_whatsapp_optin"]'::jsonb
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos')
  AND NOT ("active_tools" @> '["present_whatsapp_optin"]'::jsonb);

-- ============================================================================
-- 4. Bump version + updated_at em todas specialists (mesma heurística da 0014:
--    drizzle journal garante que a migration roda 1x; em dev local rodar 2x
--    incrementa version 2x mas o invariante (3 tools presentes) é mantido).
-- ============================================================================
UPDATE "personas"
SET "version" = "version" + 1,
    "updated_at" = now()
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos');
