CREATE TABLE "caixa_de_prompt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"label" text DEFAULT 'production' NOT NULL,
	"versao" integer NOT NULL,
	"texto" text NOT NULL,
	"publicado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "caixa_de_prompt_nome_label_versao_idx" ON "caixa_de_prompt" USING btree ("nome","label","versao");