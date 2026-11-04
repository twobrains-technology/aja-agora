CREATE TABLE "playground_perfil_versoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"perfil_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"atributos" jsonb NOT NULL,
	"orientacao" text DEFAULT '' NOT NULL,
	"bloco_compilado" text NOT NULL,
	"salvo_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"caixa_versao" integer
);
--> statement-breakpoint
CREATE TABLE "playground_perfis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"atributos" jsonb NOT NULL,
	"orientacao" text DEFAULT '' NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" text
);
--> statement-breakpoint
ALTER TABLE "playground_perfil_versoes" ADD CONSTRAINT "playground_perfil_versoes_perfil_id_playground_perfis_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."playground_perfis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playground_perfil_versoes_perfil_versao_idx" ON "playground_perfil_versoes" USING btree ("perfil_id","versao");