CREATE TABLE "handoff_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"attendant_phone" varchar(32) NOT NULL,
	"attendant_name" varchar(120),
	"wamid" text,
	"listeners_no_handoff" integer,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handoff_notifications" ADD CONSTRAINT "handoff_notifications_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "handoff_notifications_wamid_idx" ON "handoff_notifications" USING btree ("wamid");--> statement-breakpoint
CREATE INDEX "handoff_notifications_conversation_idx" ON "handoff_notifications" USING btree ("conversation_id");