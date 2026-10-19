CREATE TABLE "uso_de_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"modelo" text NOT NULL,
	"tokens_input" integer DEFAULT 0 NOT NULL,
	"tokens_output" integer DEFAULT 0 NOT NULL,
	"custo_usd_cents" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uso_de_ia" ADD CONSTRAINT "uso_de_ia_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uso_de_ia_criado_em_idx" ON "uso_de_ia" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "uso_de_ia_conversation_id_idx" ON "uso_de_ia" USING btree ("conversation_id");