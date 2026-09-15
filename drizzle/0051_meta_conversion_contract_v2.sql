-- Meta CAPI V2: mantém o histórico legado e acrescenta o contrato novo.
ALTER TYPE "public"."conversion_event_name" ADD VALUE IF NOT EXISTS 'conversation_started';
ALTER TYPE "public"."conversion_event_name" ADD VALUE IF NOT EXISTS 'lead';
ALTER TYPE "public"."conversion_event_name" ADD VALUE IF NOT EXISTS 'qualified_lead';
ALTER TYPE "public"."conversion_event_name" ADD VALUE IF NOT EXISTS 'offer_viewed';
ALTER TYPE "public"."conversion_event_name" ADD VALUE IF NOT EXISTS 'proposal_sent';
ALTER TYPE "public"."conversion_event_name" ADD VALUE IF NOT EXISTS 'purchase';
--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "campaign_id" text;
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "adset_id" text;
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "ad_id" text;
--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN IF NOT EXISTS "first_visit_id" uuid REFERENCES "public"."visits"("id") ON DELETE SET NULL;
ALTER TABLE "conversion_events" ADD COLUMN IF NOT EXISTS "last_visit_id" uuid REFERENCES "public"."visits"("id") ON DELETE SET NULL;
ALTER TABLE "conversion_events" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE "conversion_events" ADD COLUMN IF NOT EXISTS "campaign_id" text;
ALTER TABLE "conversion_events" ADD COLUMN IF NOT EXISTS "adset_id" text;
ALTER TABLE "conversion_events" ADD COLUMN IF NOT EXISTS "ad_id" text;
ALTER TABLE "conversion_events" ADD COLUMN IF NOT EXISTS "previous_stage" text;
ALTER TABLE "conversion_events" ADD COLUMN IF NOT EXISTS "current_stage" text;
ALTER TABLE "conversion_events" ADD COLUMN IF NOT EXISTS "proposal_id" text;
ALTER TABLE "conversion_events" ADD COLUMN IF NOT EXISTS "sale_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visits_meta_ids_idx" ON "visits" ("campaign_id", "adset_id", "ad_id");
CREATE INDEX IF NOT EXISTS "conversion_events_lead_event_idx" ON "conversion_events" ("lead_id", "event_name", "occurred_at");
