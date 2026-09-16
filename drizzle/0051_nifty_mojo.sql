ALTER TYPE "public"."conversion_event_name" ADD VALUE 'conversation_started';--> statement-breakpoint
ALTER TYPE "public"."conversion_event_name" ADD VALUE 'lead';--> statement-breakpoint
ALTER TYPE "public"."conversion_event_name" ADD VALUE 'qualified_lead';--> statement-breakpoint
ALTER TYPE "public"."conversion_event_name" ADD VALUE 'offer_viewed';--> statement-breakpoint
ALTER TYPE "public"."conversion_event_name" ADD VALUE 'proposal_sent';--> statement-breakpoint
ALTER TYPE "public"."conversion_event_name" ADD VALUE 'purchase';--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN "first_visit_id" uuid;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN "last_visit_id" uuid;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN "campaign_id" text;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN "adset_id" text;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN "ad_id" text;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN "previous_stage" text;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN "current_stage" text;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN "proposal_id" text;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD COLUMN "sale_id" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "campaign_id" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "adset_id" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "ad_id" text;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_first_visit_id_visits_id_fk" FOREIGN KEY ("first_visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_last_visit_id_visits_id_fk" FOREIGN KEY ("last_visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversion_events_lead_event_idx" ON "conversion_events" USING btree ("lead_id","event_name","occurred_at");--> statement-breakpoint
CREATE INDEX "visits_meta_ids_idx" ON "visits" USING btree ("campaign_id","adset_id","ad_id");