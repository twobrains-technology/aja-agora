-- BUG-AUTO-SKIPS-PRE-VALUE-GATES (descoberto em 2026-05-18/19): PO Kairo
-- reportou que Rafael (specialist auto) — e por inspeção, também Helena/imovel
-- (conv Monique 6c0ca4cf-cae6, tb-dev 2026-05-18) — pulam direto pra
-- "Qual valor de carta?" APÓS save_contact_name, SEM ter disparado/respondido
-- antes os 3 gates de qualificação que o sistema espera nessa ordem:
--
--   1. experience  (já fez consórcio? — first/returning/doubts)
--   2. timeframe   (qual prazo?)
--   3. lance       (tem reserva pra lance?)
--
-- Sintoma observado:
--   - DB: qualifyAnswers.creditMax preenchido SEM experiencePrev e SEM
--     prazoMeses (perfil incompleto, eval inválida).
--   - UX: agent ignora o gate event emitido pelo orchestrator e pergunta valor
--     em texto puro — frontend não renderiza chips de experience.
--   - Funil: search_groups eventualmente roda com perfil incompleto,
--     recommend pifa.
--
-- Fix arquitetural (PO Kairo, 2026-05-19):
--   - PRINCIPAL: aplicar via "cadastro do agent" — adicionar EXEMPLOS
--     few-shot nas 4 specialists ensinando explicitamente que, APÓS
--     save_contact_name, o fluxo correto é REAGIR à info que o user já deu
--     em UMA frase + PARAR (o orchestrator dispara o gate seguinte).
--     NUNCA pedir valor/parcela antes dos 3 gates.
--   - COMPLEMENTAR: reforço no SPECIALIST_BASE_PROMPT (cobertura genérica
--     pras 4 specialists — vive em src/lib/agent/system-prompt.ts).
--
-- Mesma família dos exemplos seed da 0016_personas_examples.sql:
--   - whenIntent reflete o momento exato do funil (sistema acabou de chamar
--     save_contact_name → user ainda não respondeu nada — neutral/providing).
--   - whenCategory restrito à categoria da specialist (defensivo).
--   - Texto curto, no tom da persona, terminando com PONTO (sem pergunta).
--
-- Idempotente: guard "examples NOT @> '[{\"id\":\"...-pos-nome-gate-flow\"}]'"
-- evita re-aplicação. Bump de version (+1) invalida cache do agent.
-- Não toca em concierge (não tem fluxo de qualificação).
--
-- Vale pras 4 specialists (auto/imovel/moto/servicos). O PO Kairo
-- explicitamente pediu pra Rafael (auto), mas inspeção real em tb-dev
-- (conv Monique imovel) mostra que TODAS as specialists têm o mesmo bug —
-- por isso aplica nas 4. Cinto+suspensório com o reforço estrutural no
-- SPECIALIST_BASE_PROMPT que vale ATEMPORALMENTE pras 4.

-- ============================================================================
-- 1. AUTO — Rafael
-- ANTES de pedir valor (present_value_picker / search_groups), OBRIGATORIAMENTE
-- os 3 gates pré-valor (experience/timeframe/lance) precisam ter sido
-- respondidos. Agent reage curto + PARA — orchestrator dispara gate em seguida.
-- ============================================================================
UPDATE "personas"
SET "examples" = "examples" || '[
  {
    "id": "auto-pos-nome-gate-flow",
    "userMessage": "[sistema acabou de chamar save_contact_name(name=\"Paulo\") — orchestrator vai disparar o gate de experience em seguida]",
    "assistantResponse": "Beleza, Paulo.",
    "whenCategory": ["auto"],
    "whenIntent": ["neutral", "providing_info", "ready_to_proceed"],
    "enabled": true,
    "origin": "manual",
    "context": "Fluxo obrigatório de gates pré-valor (auto). ANTES de pedir valor/parcela ou chamar present_value_picker/search_groups, os 3 gates de qualificação (1) experience, (2) timeframe, (3) lance precisam ter sido respondidos. Após save_contact_name, agent reage com UMA frase curta no SEU tom e PARA — o orchestrator dispara o gate de experience em seguida automaticamente. NUNCA pergunte valor/carta/parcela no mesmo turn em que capturou o nome."
  }
]'::jsonb,
    "version" = "version" + 1,
    "updated_at" = now()
WHERE "id" = 'auto'
  AND NOT ("examples" @> '[{"id":"auto-pos-nome-gate-flow"}]'::jsonb);

-- ============================================================================
-- 2. IMOVEL — Helena
-- Mesmo fluxo de gates: experience → timeframe → lance ANTES de valor.
-- Real (Monique 6c0ca4cf): Helena pulou pra "Qual faixa de crédito?" sem disparar gates.
-- ============================================================================
UPDATE "personas"
SET "examples" = "examples" || '[
  {
    "id": "imovel-pos-nome-gate-flow",
    "userMessage": "[sistema acabou de chamar save_contact_name(name=\"Monique\") — orchestrator vai disparar o gate de experience em seguida]",
    "assistantResponse": "Prazer, Monique.",
    "whenCategory": ["imovel"],
    "whenIntent": ["neutral", "providing_info", "ready_to_proceed"],
    "enabled": true,
    "origin": "manual",
    "context": "Fluxo obrigatório de gates pré-valor (imovel). ANTES de pedir valor/parcela ou chamar present_value_picker/search_groups, os 3 gates (1) experience, (2) timeframe, (3) lance precisam ter sido respondidos. Após save_contact_name, agent reage com UMA frase curta no SEU tom e PARA — orchestrator dispara experience em seguida. NUNCA pergunte faixa de crédito/valor de imóvel no mesmo turn em que capturou o nome."
  }
]'::jsonb,
    "version" = "version" + 1,
    "updated_at" = now()
WHERE "id" = 'imovel'
  AND NOT ("examples" @> '[{"id":"imovel-pos-nome-gate-flow"}]'::jsonb);

-- ============================================================================
-- 3. MOTO — Bruno
-- ============================================================================
UPDATE "personas"
SET "examples" = "examples" || '[
  {
    "id": "moto-pos-nome-gate-flow",
    "userMessage": "[sistema acabou de chamar save_contact_name(name=\"Carlos\") — orchestrator vai disparar o gate de experience em seguida]",
    "assistantResponse": "Boa, Carlos.",
    "whenCategory": ["moto"],
    "whenIntent": ["neutral", "providing_info", "ready_to_proceed"],
    "enabled": true,
    "origin": "manual",
    "context": "Fluxo obrigatório de gates pré-valor (moto). ANTES de pedir valor da carta ou chamar present_value_picker/search_groups, os 3 gates (1) experience, (2) timeframe, (3) lance precisam ter sido respondidos. Após save_contact_name, agent reage com UMA frase curta no SEU tom e PARA — orchestrator dispara experience em seguida. NUNCA pergunte valor da carta/parcela no mesmo turn em que capturou o nome."
  }
]'::jsonb,
    "version" = "version" + 1,
    "updated_at" = now()
WHERE "id" = 'moto'
  AND NOT ("examples" @> '[{"id":"moto-pos-nome-gate-flow"}]'::jsonb);

-- ============================================================================
-- 4. SERVICOS — Camila
-- ============================================================================
UPDATE "personas"
SET "examples" = "examples" || '[
  {
    "id": "servicos-pos-nome-gate-flow",
    "userMessage": "[sistema acabou de chamar save_contact_name(name=\"Ana\") — orchestrator vai disparar o gate de experience em seguida]",
    "assistantResponse": "Perfeito, Ana.",
    "whenCategory": ["servicos"],
    "whenIntent": ["neutral", "providing_info", "ready_to_proceed"],
    "enabled": true,
    "origin": "manual",
    "context": "Fluxo obrigatório de gates pré-valor (servicos). ANTES de pedir valor/orçamento ou chamar present_value_picker/search_groups, os 3 gates (1) experience, (2) timeframe, (3) lance precisam ter sido respondidos. Após save_contact_name, agent reage com UMA frase curta no SEU tom e PARA — orchestrator dispara experience em seguida. NUNCA pergunte valor/orçamento/parcela no mesmo turn em que capturou o nome."
  }
]'::jsonb,
    "version" = "version" + 1,
    "updated_at" = now()
WHERE "id" = 'servicos'
  AND NOT ("examples" @> '[{"id":"servicos-pos-nome-gate-flow"}]'::jsonb);
