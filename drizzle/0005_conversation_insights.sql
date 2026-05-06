ALTER TABLE "lead_insights" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_insights" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_insights" ADD CONSTRAINT "lead_insights_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_insights_lead_id_idx" ON "lead_insights" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_insights_conversation_id_idx" ON "lead_insights" USING btree ("conversation_id");--> statement-breakpoint
ALTER TABLE "lead_insights" ADD CONSTRAINT "lead_insights_owner_check" CHECK (("lead_insights"."lead_id" IS NOT NULL) <> ("lead_insights"."conversation_id" IS NOT NULL));