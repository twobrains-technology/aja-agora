CREATE TABLE "exportacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"formato" text NOT NULL,
	"de" timestamp with time zone NOT NULL,
	"ate" timestamp with time zone NOT NULL,
	"mascarado" boolean DEFAULT true NOT NULL,
	"linhas" integer NOT NULL,
	"usuario_id" text,
	"usuario_email" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exportacoes" ADD CONSTRAINT "exportacoes_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exportacoes_criado_em_idx" ON "exportacoes" USING btree ("criado_em");