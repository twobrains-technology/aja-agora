CREATE TABLE "sinais_de_conversa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"trace_id" text,
	"origem" text NOT NULL,
	"nome" text NOT NULL,
	"valor" real,
	"comentario" text,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sinais_de_conversa" ADD CONSTRAINT "sinais_de_conversa_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sinais_de_conversa_conversation_id_idx" ON "sinais_de_conversa" USING btree ("conversation_id");