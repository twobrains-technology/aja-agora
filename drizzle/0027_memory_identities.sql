-- Memory Identities — re-home da memória cross-channel do Letta pro Postgres
-- (FIX-81 / ADR 2026-06-25-remocao-letta-postgres, Opção B). Substitui o
-- "agent Letta" (KV-store REST remoto) por 1 linha local por identidade.
-- Escrita à mão: drizzle-kit generate está quebrado no repo (snapshots meta
-- 0014+ nunca foram commitados); migrate usa journal + .sql, então esta
-- migration aplica normalmente via migrate-guard no boot. Ver migration 0026.
CREATE TABLE "memory_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace" varchar(120) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"value" varchar(200) NOT NULL,
	"block" jsonb NOT NULL,
	"reconciled_from" text,
	"last_interaction_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "memory_identities_key_idx" ON "memory_identities" USING btree ("namespace","kind","value");
