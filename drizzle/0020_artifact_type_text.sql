-- BUG-LEAD-HISTORY-INCOMPLETE (2026-05-18): troca artifacts.type de enum→text.
--
-- A união TS `ArtifactType` em src/lib/chat/types.ts é a fonte de verdade real
-- (11 tipos hoje); o enum `artifact_type` no DB ficou parado em 5 tipos desde
-- a migration 0000 porque a tabela `artifacts` era dead-code — nenhum
-- `db.insert(artifacts)` no codebase. Agora que o runner persiste os artifacts
-- (fix #1 do BUG-LEAD-HISTORY-INCOMPLETE), seguir com enum forçaria migration
-- a cada artifact novo, sem ganho real (nenhum consumer SQL fora do código TS
-- precisa validar via enum). Text remove esse atrito.
--
-- Os 6 tipos da união que não estavam no enum: quick_reply, value_picker,
-- topic_picker, scenarios, financing_comparison, whatsapp_optin.

ALTER TABLE "artifacts" ALTER COLUMN "type" SET DATA TYPE text;
--> statement-breakpoint
DROP TYPE "public"."artifact_type";
