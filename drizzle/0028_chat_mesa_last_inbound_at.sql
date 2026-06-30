-- Chat da mesa pelo Kanban: rastreia o último inbound do cliente no WhatsApp pra
-- calcular a janela de 24h da API oficial Meta (FIX-86 / bloco-b chat-mesa). O
-- bloco-b adicionou `lastInboundAt` ao schema mas NÃO criou a migration — esta
-- corrige (develop estava vermelha: column "last_inbound_at" does not exist).
-- Escrita à mão: drizzle-kit generate está quebrado no repo (snapshots meta 0014+
-- ausentes — pendência do bloco-g/FIX-100); migrate usa journal + .sql, então esta
-- migration aplica normalmente via migrate-guard no boot. Ver migration 0027.
ALTER TABLE "conversations" ADD COLUMN "last_inbound_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "conversations_last_inbound_at_idx" ON "conversations" USING btree ("last_inbound_at");
