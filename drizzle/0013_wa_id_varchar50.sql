-- B-02 (QA simulador round 2 DEV): wa_id varchar(32) rejeita
-- SIM-<uuid-v4> (40 chars) com "value too long for type character
-- varying(32)". Expandindo pra varchar(50) — comporta SIM- prefix +
-- UUID v4 + qualquer wa_id real do WhatsApp Business (E.164 max 15
-- + sufixo). Não-destrutiva (TYPE expansion sem perda de dado).
ALTER TABLE "conversations" ALTER COLUMN "wa_id" TYPE varchar(50);
