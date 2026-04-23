CREATE TYPE "public"."actor_type" AS ENUM('system', 'admin');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('web', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'handed_off', 'closed');--> statement-breakpoint
CREATE TYPE "public"."insight_type" AS ENUM('summary', 'intent', 'budget', 'objections', 'next_action');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('novo', 'engajado', 'qualificado', 'em_negociacao', 'proposta_enviada', 'fechado_ganho', 'perdido');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_stage" "lead_stage",
	"to_stage" "lead_stage" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"insight_type" "insight_type" NOT NULL,
	"content" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "wa_id" varchar(32);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "channel" "channel" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "status" "conversation_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "handed_off_to" varchar(32);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "agent_name" varchar(100);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "contact_name" varchar(100);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "stage" "lead_stage" DEFAULT 'novo' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "credit_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "channel" "channel" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_insights" ADD CONSTRAINT "lead_insights_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "conversations_wa_id_idx" ON "conversations" USING btree ("wa_id");--> statement-breakpoint
CREATE INDEX "conversations_handed_off_to_idx" ON "conversations" USING btree ("handed_off_to");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");