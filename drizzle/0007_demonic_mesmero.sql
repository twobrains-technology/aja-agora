ALTER TABLE "messages" ADD COLUMN "persona_id" text;--> statement-breakpoint
CREATE INDEX "messages_conversation_persona_idx" ON "messages" USING btree ("conversation_id","persona_id");