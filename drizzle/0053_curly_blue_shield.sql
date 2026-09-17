CREATE TYPE "public"."remarketing_touch_status" AS ENUM('ATIVO', 'RESPONDEU', 'ESGOTADO', 'OPTOUT', 'CONVERTEU');--> statement-breakpoint
CREATE TABLE "remarketing_touches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"objetivo" text NOT NULL,
	"step" smallint DEFAULT 0 NOT NULL,
	"status" "remarketing_touch_status" DEFAULT 'ATIVO' NOT NULL,
	"next_touch_at" timestamp with time zone,
	"touches_30d" smallint DEFAULT 0 NOT NULL,
	"motivo_saida" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remarketing_touches_step_check" CHECK ("remarketing_touches"."step" BETWEEN 0 AND 3)
);
--> statement-breakpoint
ALTER TABLE "remarketing_touches" ADD CONSTRAINT "remarketing_touches_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarketing_touches" ADD CONSTRAINT "remarketing_touches_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "remarketing_touches_conversation_id_idx" ON "remarketing_touches" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "remarketing_touches_ativos_idx" ON "remarketing_touches" USING btree ("status","next_touch_at") WHERE "remarketing_touches"."status" = 'ATIVO';