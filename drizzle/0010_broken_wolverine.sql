CREATE TYPE "public"."memory_event_type" AS ENUM('agent_created', 'context_loaded', 'memory_stored', 'reconciled', 'fallback_triggered', 'purged');--> statement-breakpoint
CREATE TABLE "memory_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"letta_agent_id" text,
	"event_type" "memory_event_type" NOT NULL,
	"payload" jsonb,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_events" ADD CONSTRAINT "memory_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_events_conversation_id_idx" ON "memory_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "memory_events_letta_agent_id_idx" ON "memory_events" USING btree ("letta_agent_id");--> statement-breakpoint
CREATE INDEX "memory_events_created_at_idx" ON "memory_events" USING btree ("created_at" DESC NULLS LAST);