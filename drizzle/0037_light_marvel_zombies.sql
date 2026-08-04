CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" text NOT NULL,
	"channel" "channel" DEFAULT 'web' NOT NULL,
	"landing_path" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"gclid" text,
	"fbclid" text,
	"ctwa_clid" text,
	"ctwa_source_id" text,
	"ctwa_source_url" text,
	"ctwa_source_type" text,
	"ctwa_headline" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "visit_id" uuid;--> statement-breakpoint
CREATE INDEX "visits_visitor_id_idx" ON "visits" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "visits_created_at_idx" ON "visits" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "visits_utm_campaign_idx" ON "visits" USING btree ("utm_campaign");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;