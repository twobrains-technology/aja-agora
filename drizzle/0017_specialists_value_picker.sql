-- BUG-CREDIT-PICKER-WEB (descoberto em 2026-05-18): personas specialist no DB
-- não tinham `present_value_picker` em active_tools. Builder em
-- src/lib/agent/agents/builder.ts filtra tools pelo activeTools → agent nunca
-- recebe a tool no contexto → Helena (e demais specialists) perguntam faixa de
-- crédito em texto puro em vez de renderizar o seletor interativo (sliders no
-- web / lista de botões no WhatsApp). Viola o system-prompt
-- (src/lib/agent/system-prompt.ts:13) que manda explicitamente:
--   "NUNCA pergunte valores por texto. Use present_value_picker."
--
-- Esta migration aplica em todas as 4 specialists ativas (auto, imovel,
-- moto, servicos):
--   1. Adiciona "present_value_picker" ao active_tools (idempotente).
--   2. Bump version + atualiza updated_at (cache do agente invalida via version).
--
-- Idempotente: pode rodar 2x sem efeito colateral (guard NOT @> previne
-- duplicação no jsonb array; em re-run o UPDATE não casa nenhuma linha).
-- Não toca em concierge (id='concierge') porque concierge não qualifica
-- usuário — não pergunta faixa de crédito. Só specialists o fazem.
--
-- Mesmo padrão da 0014_unblock_financing_comparison.sql e
-- 0015_specialists_capture_tools.sql.
--
-- CINTO+SUSPENSÓRIO: builder.ts também passa a expor present_value_picker
-- como invariante hardcoded (mesmo padrão de suggest_handoff,
-- save_contact_*, present_whatsapp_optin) — primitivo do fluxo, não toggle
-- de admin. Sem o invariante, admin poderia remover via UI e quebrar o fluxo
-- de captura de valor.

-- ============================================================================
-- 1. Adiciona present_value_picker ao active_tools (se ausente)
-- ============================================================================
UPDATE "personas"
SET "active_tools" = "active_tools" || '["present_value_picker"]'::jsonb
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos')
  AND NOT ("active_tools" @> '["present_value_picker"]'::jsonb);

-- ============================================================================
-- 2. Bump version + updated_at em todas specialists (mesma heurística da 0015:
--    drizzle journal garante que a migration roda 1x em prod; em dev local
--    rodar 2x incrementa version 2x mas o invariante (tool presente) é mantido).
-- ============================================================================
UPDATE "personas"
SET "version" = "version" + 1,
    "updated_at" = now()
WHERE "role" = 'specialist'
  AND "category" IN ('auto', 'imovel', 'moto', 'servicos');
