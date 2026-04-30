ALTER TABLE "personas" DROP COLUMN "emoji";--> statement-breakpoint
ALTER TABLE "personas" DROP COLUMN "category_label";--> statement-breakpoint
ALTER TABLE "personas" DROP COLUMN "weight";--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "expertise" text;
