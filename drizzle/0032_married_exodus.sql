CREATE TYPE "public"."whatsapp_outbound_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_template_category" AS ENUM('UTILITY', 'MARKETING', 'AUTHENTICATION');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_template_status" AS ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'DISABLED', 'PAUSED');--> statement-breakpoint
CREATE TABLE "whatsapp_outbound_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"usage_key" text NOT NULL,
	"params" jsonb,
	"status" "whatsapp_outbound_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usage_key" text,
	"meta_name" text NOT NULL,
	"language" text DEFAULT 'pt_BR' NOT NULL,
	"category" "whatsapp_template_category",
	"components" jsonb,
	"body_preview" text,
	"status" "whatsapp_template_status" DEFAULT 'DRAFT' NOT NULL,
	"meta_template_id" text,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "whatsapp_outbound_queue_usage_key_idx" ON "whatsapp_outbound_queue" USING btree ("usage_key");--> statement-breakpoint
CREATE INDEX "whatsapp_outbound_queue_status_idx" ON "whatsapp_outbound_queue" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_usage_key_idx" ON "whatsapp_templates" USING btree ("usage_key");--> statement-breakpoint
CREATE INDEX "whatsapp_templates_meta_template_id_idx" ON "whatsapp_templates" USING btree ("meta_template_id");--> statement-breakpoint
CREATE INDEX "whatsapp_templates_status_idx" ON "whatsapp_templates" USING btree ("status");