CREATE TYPE "public"."meta_entity_nivel" AS ENUM('campaign', 'adset', 'ad');--> statement-breakpoint
CREATE TABLE "meta_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" text NOT NULL,
	"nivel" "meta_entity_nivel" NOT NULL,
	"nome" text NOT NULL,
	"status" text,
	"account_id" text,
	"parent_entity_id" text,
	"visto_em" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_insights_diarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data" varchar(10) NOT NULL,
	"entity_id" text NOT NULL,
	"nivel" "meta_entity_nivel" NOT NULL,
	"spend_cents" integer,
	"impressions" integer,
	"clicks" integer,
	"leads" integer,
	"coletado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remarketing_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" text NOT NULL,
	"valor" text NOT NULL,
	"descricao" text,
	"atualizado_por" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "meta_entities_entity_id_idx" ON "meta_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "meta_entities_nivel_idx" ON "meta_entities" USING btree ("nivel");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_insights_dia_entity_idx" ON "meta_insights_diarios" USING btree ("data","entity_id");--> statement-breakpoint
CREATE INDEX "meta_insights_entity_data_idx" ON "meta_insights_diarios" USING btree ("entity_id","data");--> statement-breakpoint
CREATE UNIQUE INDEX "remarketing_config_chave_idx" ON "remarketing_config" USING btree ("chave");