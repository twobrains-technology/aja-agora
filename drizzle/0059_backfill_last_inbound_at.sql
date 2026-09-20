-- Renumerada de 0057 para 0059 na integração (a base já usava 0057_dashing_havok e 0058_light_iceman).

-- F2 / AJA-02 — backfill do `conversations.last_inbound_at`.
--
-- A corrida (ver `src/lib/whatsapp/session.ts`): o carimbo de inbound era escrito
-- por `updateLastInboundAt`, que o webhook dispara ANTES de a conversa existir na
-- primeira mensagem de um número novo. Ninguém achar → "No conversation found" →
-- a coluna ficava NULL para sempre. Medido em produção: 100% das conversas de
-- WhatsApp com exatamente 1 mensagem (4/4 na janela), contra 0% nas com 2+.
--
-- A régua de remarketing exige `last_inbound_at IS NOT NULL`, então esses leads
-- nunca entraram. O conserto do código vale daqui para a frente; esta migration
-- devolve às conversas JÁ existentes o instante que elas de fato tiveram — o
-- `max(created_at)` das mensagens do CLIENTE (`role = 'user'`).
--
-- Escopo estreito de propósito:
--   • só `channel = 'whatsapp'` (a coluna é do canal; a web nunca a escreve);
--   • só `last_inbound_at IS NULL` — nunca reescreve um valor já gravado;
--   • só conversas que TÊM mensagem de usuário (`EXISTS`) — sem inbound real não
--     há instante a recuperar, e inventar `created_at` da conversa seria dado
--     falso (a conversa pode ter sido criada por um carimbo de origem, antes de
--     qualquer fala).
-- Idempotente: reaplicar não muda nada (a cláusula `IS NULL` já falhou).

UPDATE "conversations" AS c
SET "last_inbound_at" = sub."ultimo_inbound"
FROM (
	SELECT m."conversation_id" AS "conversation_id", max(m."created_at") AS "ultimo_inbound"
	FROM "messages" AS m
	WHERE m."role" = 'user'
	GROUP BY m."conversation_id"
) AS sub
WHERE c."id" = sub."conversation_id"
  AND c."channel" = 'whatsapp'
  AND c."last_inbound_at" IS NULL;