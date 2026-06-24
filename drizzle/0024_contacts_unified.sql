-- FIX-41: entidade `contacts` (cliente unificado). Resolve o cliente por
-- telefone, CPF ou e-mail e agrega N conversas/leads/propostas de qualquer canal.
-- DDL idempotente (migrate-guard re-rodável). CPF raw por hora (DES-CPF-RAW).
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"cpf" text,
	"email" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_identifier_check" CHECK ("phone" IS NOT NULL OR "cpf" IS NOT NULL OR "email" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_phone_idx" ON "contacts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_cpf_idx" ON "contacts" USING btree ("cpf");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint

-- FKs contactId nos consumidores (nullable até a identidade ser resolvida).
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "bevi_proposals" ADD COLUMN IF NOT EXISTS "contact_id" uuid;--> statement-breakpoint

DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_contact_id_contacts_id_fk') THEN
		ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_contact_id_contacts_id_fk') THEN
		ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bevi_proposals_contact_id_contacts_id_fk') THEN
		ALTER TABLE "bevi_proposals" ADD CONSTRAINT "bevi_proposals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint

-- Consulta legada por telefone (dedup/backfill).
CREATE INDEX IF NOT EXISTS "leads_phone_idx" ON "leads" USING btree ("phone");
