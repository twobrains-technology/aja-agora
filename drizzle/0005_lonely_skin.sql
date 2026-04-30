ALTER TABLE "personas" ADD COLUMN "role" text DEFAULT 'specialist' NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "weight" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
-- Backfill role + category from the conflated id.
UPDATE "personas" SET "role" = 'concierge', "category" = NULL WHERE "id" = 'concierge';--> statement-breakpoint
UPDATE "personas" SET "category" = 'imovel'   WHERE "id" = 'imovel';--> statement-breakpoint
UPDATE "personas" SET "category" = 'auto'     WHERE "id" = 'auto';--> statement-breakpoint
UPDATE "personas" SET "category" = 'servicos' WHERE "id" = 'servicos';--> statement-breakpoint
ALTER TABLE "personas" DROP COLUMN "forced_search_category";--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_role_check" CHECK ("personas"."role" IN ('concierge', 'specialist'));--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_category_check" CHECK ("personas"."category" IS NULL OR "personas"."category" IN ('imovel', 'auto', 'servicos'));--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_specialist_has_category" CHECK ("personas"."role" = 'concierge' OR "personas"."category" IS NOT NULL);--> statement-breakpoint
-- Backfill currentCategory in conversation metadata so existing in-flight conversations
-- keep routing to the right tools after the persona/category split.
UPDATE "conversations"
SET "metadata" = "metadata" || jsonb_build_object('currentCategory', "metadata"->'currentPersona')
WHERE "metadata"->>'currentPersona' IN ('imovel','auto','servicos');
