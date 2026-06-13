-- BUG-TOPIC-PICKER-WEB (descoberto em 2026-05-18, apresentação 13h): personas
-- specialist no DB não tinham `present_topic_picker` em active_tools. Tool
-- existia em src/lib/agent/tools/ai-sdk.ts:408 e tinha componente React em
-- src/components/chat/artifacts/topic-picker.tsx, mas NUNCA foi conectada a
-- nenhuma persona — tool órfã. Builder em src/lib/agent/agents/builder.ts:44-53
-- filtra tools pelo activeTools → agent nunca recebe a tool no contexto → quando
-- "sente" que devia oferecer atalhos antes do gate de expertise (ex: tipos de uso
-- da moto, categorias de imóvel), alucina texto tipo "Da uma olhada nas opções
-- abaixo" sem produzir UI. Viola B6 da Bruna ("sempre ≥3 opções concretas,
-- nunca texto vago") e quebra a UX.
--
-- Mesmo padrão dos bugs irmãos já corrigidos:
--   - 0015_specialists_capture_tools.sql (BUG-LEAD-CAPTURE-WEB)
--   - 0017_specialists_value_picker.sql (BUG-CREDIT-PICKER-WEB)
--
-- Esta migration aplica em todas as 4 specialists ativas (auto, imovel,
-- moto, servicos):
--   1. Adiciona "present_topic_picker" ao active_tools (idempotente).
--   2. Bump version + atualiza updated_at (cache do agente invalida via version).
--
-- Idempotente: pode rodar 2x sem efeito colateral (guard NOT @> previne
-- duplicação no jsonb array; em re-run o UPDATE não casa nenhuma linha).
-- Não toca em concierge (id='concierge') porque concierge não oferece atalhos
-- de specialist — só specialists o fazem.
--
-- CINTO+SUSPENSÓRIO: builder.ts também passa a expor present_topic_picker
-- como invariante hardcoded (mesmo padrão de suggest_handoff,
-- save_contact_*, present_whatsapp_optin, present_value_picker) — primitivo
-- do fluxo, não toggle de admin. Sem o invariante, admin poderia remover via
-- UI e quebrar o fluxo de atalhos clicáveis.

-- ============================================================================
-- 1. Adiciona present_topic_picker ao active_tools (se ausente)
-- ============================================================================
UPDATE "personas"
SET "active_tools" = "active_tools" || '["present_topic_picker"]'::jsonb
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos')
  AND NOT ("active_tools" @> '["present_topic_picker"]'::jsonb);

-- ============================================================================
-- 2. Bump version + updated_at em todas specialists (mesma heurística da 0015/0017:
--    drizzle journal garante que a migration roda 1x em prod; em dev local
--    rodar 2x incrementa version 2x mas o invariante (tool presente) é mantido).
-- ============================================================================
UPDATE "personas"
SET "version" = "version" + 1,
    "updated_at" = now()
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos');
