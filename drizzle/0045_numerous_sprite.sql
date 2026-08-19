ALTER TYPE "public"."page_event_type" ADD VALUE 'chat_open';--> statement-breakpoint
ALTER TYPE "public"."page_event_type" ADD VALUE 'chat_typing';--> statement-breakpoint
ALTER TYPE "public"."page_event_type" ADD VALUE 'chat_send';--> statement-breakpoint
ALTER TYPE "public"."page_event_type" ADD VALUE 'chat_receive';--> statement-breakpoint
ALTER TYPE "public"."page_event_type" ADD VALUE 'chat_card_click';--> statement-breakpoint
ALTER TYPE "public"."page_event_type" ADD VALUE 'chat_close';--> statement-breakpoint
ALTER TABLE "page_events" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "page_events" ADD COLUMN "duracao_ms" integer;--> statement-breakpoint
ALTER TABLE "page_events" ADD CONSTRAINT "page_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_events_conversation_id_idx" ON "page_events" USING btree ("conversation_id","created_at");