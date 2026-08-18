CREATE TYPE "public"."device" AS ENUM('mobile', 'tablet', 'desktop');--> statement-breakpoint
CREATE TYPE "public"."page_event_type" AS ENUM('click', 'rage_click', 'section_view', 'scroll_depth');--> statement-breakpoint
CREATE TABLE "page_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid,
	"type" "page_event_type" NOT NULL,
	"path" text NOT NULL,
	"section" text,
	"selector" text,
	"label" text,
	"rel_x" real,
	"rel_y" real,
	"page_rel_x" real,
	"page_y" integer,
	"scroll_pct" integer,
	"viewport_width" integer NOT NULL,
	"viewport_height" integer NOT NULL,
	"device" "device" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_events" ADD CONSTRAINT "page_events_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_events_path_created_at_idx" ON "page_events" USING btree ("path","created_at");--> statement-breakpoint
CREATE INDEX "page_events_visit_id_idx" ON "page_events" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "page_events_type_section_idx" ON "page_events" USING btree ("type","section");