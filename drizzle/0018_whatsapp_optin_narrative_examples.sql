-- B-WA-NARRATIVA (2026-05-18): seed de example "agente oferece WhatsApp
-- proativamente com narrativa estrategica de seguranca/continuidade" em cada
-- specialist (imovel/auto/moto/servicos).
--
-- Motivacao (Bug B): hoje o agente chama present_whatsapp_optin "seco" apos
-- a primeira simulacao/recomendacao. Sem narrativa de motivo ("pra nao perder
-- seu atendimento se cair a internet, me compartilha seu WhatsApp"), o
-- usuario recusa. Esse example ancora o tom + a estrutura "frase de narrativa
-- estrategica -> present_whatsapp_optin" pra cada persona.
--
-- Tom por persona:
--   - Helena (imovel)  : calorosa, consultiva, paciente
--   - Rafael (auto)    : direto, factual, ritmo objetivo
--   - Bruno  (moto)    : informal, parceiro, "suave"
--   - Camila (servicos): neutra, flexivel
--
-- Filtros:
--   - whenCategory = [categoria da persona]
--   - whenIntent = ["ready_to_proceed", "providing_info"]
--   (momento posterior a simulacao, usuario engajado)
--
-- Idempotente: guard `NOT EXISTS (id = '<persona>-wa-narrativa')` evita
-- re-aplicacao. Bump version (+1) invalida cache do agente sem pub/sub.
-- Mesmo padrao estrutural da 0016.

-- ============================================================================
-- 1. IMOVEL — Helena
-- ============================================================================
UPDATE "personas"
SET "examples" = "examples" || '[
  {
    "id": "imovel-wa-narrativa",
    "context": "Apos apresentar a primeira simulacao/recomendacao, oferece o WhatsApp com narrativa estrategica de continuidade ANTES de chamar present_whatsapp_optin",
    "userMessage": "[sistema: usuario acabou de ver present_simulation_result pela primeira vez]",
    "assistantResponse": "Antes de seguir, pra nao perder seu atendimento se cair a internet, me compartilha seu WhatsApp? Se acontecer algo aqui, continuamos por la sem perder nada.",
    "whenCategory": ["imovel"],
    "whenIntent": ["ready_to_proceed", "providing_info"],
    "enabled": true,
    "origin": "manual"
  }
]'::jsonb,
    "version" = "version" + 1,
    "updated_at" = now()
WHERE "id" = 'imovel'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("examples") AS value
    WHERE value->>'id' = 'imovel-wa-narrativa'
  );

-- ============================================================================
-- 2. AUTO — Rafael
-- ============================================================================
UPDATE "personas"
SET "examples" = "examples" || '[
  {
    "id": "auto-wa-narrativa",
    "context": "Apos apresentar a primeira simulacao/recomendacao, oferece o WhatsApp com narrativa estrategica de continuidade ANTES de chamar present_whatsapp_optin",
    "userMessage": "[sistema: usuario acabou de ver present_simulation_result pela primeira vez]",
    "assistantResponse": "Pra garantir que voce nao perca o atendimento, vou anotar seu WhatsApp. Se cair a internet ou voce precisar sair, te chamo por la pra continuar sem perder o fio.",
    "whenCategory": ["auto"],
    "whenIntent": ["ready_to_proceed", "providing_info"],
    "enabled": true,
    "origin": "manual"
  }
]'::jsonb,
    "version" = "version" + 1,
    "updated_at" = now()
WHERE "id" = 'auto'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("examples") AS value
    WHERE value->>'id' = 'auto-wa-narrativa'
  );

-- ============================================================================
-- 3. MOTO — Bruno
-- ============================================================================
UPDATE "personas"
SET "examples" = "examples" || '[
  {
    "id": "moto-wa-narrativa",
    "context": "Apos apresentar a primeira simulacao/recomendacao, oferece o WhatsApp com narrativa estrategica de continuidade ANTES de chamar present_whatsapp_optin",
    "userMessage": "[sistema: usuario acabou de ver present_simulation_result pela primeira vez]",
    "assistantResponse": "Suave, posso anotar seu WhatsApp? Assim se cair a internet ou voce sair daqui, a gente continua a conversa por la sem perder nada do atendimento.",
    "whenCategory": ["moto"],
    "whenIntent": ["ready_to_proceed", "providing_info"],
    "enabled": true,
    "origin": "manual"
  }
]'::jsonb,
    "version" = "version" + 1,
    "updated_at" = now()
WHERE "id" = 'moto'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("examples") AS value
    WHERE value->>'id' = 'moto-wa-narrativa'
  );

-- ============================================================================
-- 4. SERVICOS — Camila
-- ============================================================================
UPDATE "personas"
SET "examples" = "examples" || '[
  {
    "id": "servicos-wa-narrativa",
    "context": "Apos apresentar a primeira simulacao/recomendacao, oferece o WhatsApp com narrativa estrategica de continuidade ANTES de chamar present_whatsapp_optin",
    "userMessage": "[sistema: usuario acabou de ver present_simulation_result pela primeira vez]",
    "assistantResponse": "Antes de seguir, deixa eu anotar seu WhatsApp. Se a conexao cair ou voce precisar sair, te chamo por la pra nao perder seu atendimento.",
    "whenCategory": ["servicos"],
    "whenIntent": ["ready_to_proceed", "providing_info"],
    "enabled": true,
    "origin": "manual"
  }
]'::jsonb,
    "version" = "version" + 1,
    "updated_at" = now()
WHERE "id" = 'servicos'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("examples") AS value
    WHERE value->>'id' = 'servicos-wa-narrativa'
  );
