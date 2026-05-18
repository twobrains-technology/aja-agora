CREATE TYPE "public"."automation_node_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."automation_run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."automation_trigger_type" AS ENUM('stage_changed', 'idle_in_stage', 'chat_event');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_template_category" AS ENUM('UTILITY', 'MARKETING', 'AUTHENTICATION');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_template_status" AS ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED');--> statement-breakpoint
CREATE TABLE "automation_node_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"node_type" text NOT NULL,
	"status" "automation_node_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"output" jsonb,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"automation_version" integer NOT NULL,
	"lead_id" uuid NOT NULL,
	"lead_event_id" uuid,
	"dedup_key" text NOT NULL,
	"status" "automation_run_status" DEFAULT 'pending' NOT NULL,
	"current_node_id" text,
	"step_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_runs_dedup_key_unique" UNIQUE("dedup_key")
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"trigger_type" "automation_trigger_type" NOT NULL,
	"trigger_config" jsonb NOT NULL,
	"graph" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(512) NOT NULL,
	"category" "whatsapp_template_category" DEFAULT 'UTILITY' NOT NULL,
	"language" varchar(16) DEFAULT 'pt_BR' NOT NULL,
	"body_text" text NOT NULL,
	"header_type" varchar(16),
	"header_value" text,
	"footer_text" text,
	"buttons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"placeholders_count" integer DEFAULT 0 NOT NULL,
	"meta_template_id" text,
	"meta_status" "whatsapp_template_status" DEFAULT 'DRAFT' NOT NULL,
	"meta_rejection_reason" text,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "phone" SET DATA TYPE varchar(32);--> statement-breakpoint
ALTER TABLE "automation_node_executions" ADD CONSTRAINT "automation_node_executions_run_id_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_lead_event_id_lead_events_id_fk" FOREIGN KEY ("lead_event_id") REFERENCES "public"."lead_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_node_executions_run_id_idx" ON "automation_node_executions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "automation_runs_automation_status_idx" ON "automation_runs" USING btree ("automation_id","status");--> statement-breakpoint
CREATE INDEX "automation_runs_lead_id_idx" ON "automation_runs" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "automation_runs_status_idx" ON "automation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "automations_enabled_trigger_type_idx" ON "automations" USING btree ("enabled","trigger_type");--> statement-breakpoint
CREATE INDEX "whatsapp_templates_meta_status_idx" ON "whatsapp_templates" USING btree ("meta_status");--> statement-breakpoint
CREATE INDEX "whatsapp_templates_name_idx" ON "whatsapp_templates" USING btree ("name");