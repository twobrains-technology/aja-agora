-- Mesa de operação (transbordo humano + agente copiloto) — feature da branch
-- base/atendente-mesa-e-agente. Spec: docs/visao/mesa-de-operacao.md.
-- Escrita à mão: drizzle-kit generate está quebrado no repo (snapshots meta
-- 0014-0025 nunca foram commitados — git só tem até 0013). migrate usa journal
-- + .sql, então esta migration aplica normalmente via migrate-guard no boot.
CREATE TYPE "public"."administradora_doc_tipo" AS ENUM('manual', 'tabela', 'outro');--> statement-breakpoint
CREATE TYPE "public"."mesa_handoff_status" AS ENUM('aberto', 'em_andamento', 'concluido', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."mesa_copilot_role" AS ENUM('assistant', 'attendant');--> statement-breakpoint
CREATE TABLE "administradoras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(80) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"codigo_bevi" varchar(60),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "administradoras_nome_unique" UNIQUE("nome"),
	CONSTRAINT "administradoras_slug_unique" UNIQUE("slug")
);--> statement-breakpoint
CREATE TABLE "administradora_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"administradora_id" uuid NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"tipo" "administradora_doc_tipo" DEFAULT 'manual' NOT NULL,
	"storage_key" text NOT NULL,
	"texto_extraido" text,
	"versao" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "mesa_attendants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(100) NOT NULL,
	"whatsapp" varchar(32) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mesa_attendants_whatsapp_unique" UNIQUE("whatsapp")
);--> statement-breakpoint
CREATE TABLE "mesa_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"conversation_id" uuid,
	"bevi_proposal_id" uuid,
	"mesa_attendant_id" uuid NOT NULL,
	"administradora_id" uuid,
	"status" "mesa_handoff_status" DEFAULT 'aberto' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "mesa_copilot_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mesa_handoff_id" uuid NOT NULL,
	"role" "mesa_copilot_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "administradora_docs" ADD CONSTRAINT "administradora_docs_administradora_id_administradoras_id_fk" FOREIGN KEY ("administradora_id") REFERENCES "public"."administradoras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administradora_docs" ADD CONSTRAINT "administradora_docs_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesa_handoffs" ADD CONSTRAINT "mesa_handoffs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesa_handoffs" ADD CONSTRAINT "mesa_handoffs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesa_handoffs" ADD CONSTRAINT "mesa_handoffs_bevi_proposal_id_bevi_proposals_id_fk" FOREIGN KEY ("bevi_proposal_id") REFERENCES "public"."bevi_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesa_handoffs" ADD CONSTRAINT "mesa_handoffs_mesa_attendant_id_mesa_attendants_id_fk" FOREIGN KEY ("mesa_attendant_id") REFERENCES "public"."mesa_attendants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesa_handoffs" ADD CONSTRAINT "mesa_handoffs_administradora_id_administradoras_id_fk" FOREIGN KEY ("administradora_id") REFERENCES "public"."administradoras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesa_handoffs" ADD CONSTRAINT "mesa_handoffs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesa_copilot_messages" ADD CONSTRAINT "mesa_copilot_messages_mesa_handoff_id_mesa_handoffs_id_fk" FOREIGN KEY ("mesa_handoff_id") REFERENCES "public"."mesa_handoffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "administradoras_nome_idx" ON "administradoras" USING btree ("nome");--> statement-breakpoint
CREATE INDEX "administradora_docs_administradora_id_idx" ON "administradora_docs" USING btree ("administradora_id");--> statement-breakpoint
CREATE INDEX "mesa_attendants_whatsapp_idx" ON "mesa_attendants" USING btree ("whatsapp");--> statement-breakpoint
CREATE INDEX "mesa_handoffs_lead_id_idx" ON "mesa_handoffs" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "mesa_handoffs_mesa_attendant_id_idx" ON "mesa_handoffs" USING btree ("mesa_attendant_id");--> statement-breakpoint
CREATE INDEX "mesa_handoffs_status_idx" ON "mesa_handoffs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mesa_copilot_messages_handoff_id_idx" ON "mesa_copilot_messages" USING btree ("mesa_handoff_id");
