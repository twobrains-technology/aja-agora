CREATE TYPE "public"."conversion_destination" AS ENUM('meta');--> statement-breakpoint
CREATE TYPE "public"."conversion_event_name" AS ENUM('lead_qualificado', 'proposta_criada', 'contrato_fechado');--> statement-breakpoint
CREATE TYPE "public"."conversion_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"conversation_id" uuid,
	"visit_id" uuid,
	"event_name" "conversion_event_name" NOT NULL,
	"destination" "conversion_destination" NOT NULL,
	"event_key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"value" numeric(12, 2),
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"hashed_email" text,
	"hashed_phone" text,
	"fbc" text,
	"fbp" text,
	"ctwa_clid" text,
	"action_source" varchar(30) NOT NULL,
	"status" "conversion_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversion_events_key_idx" ON "conversion_events" USING btree ("event_key","destination");--> statement-breakpoint
CREATE INDEX "conversion_events_status_idx" ON "conversion_events" USING btree ("status","created_at");