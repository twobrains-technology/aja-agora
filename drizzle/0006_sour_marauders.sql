CREATE TABLE "conversation_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"persona_id" text,
	"persona_version" integer,
	"rubric_version" text NOT NULL,
	"judge_model" varchar(100) NOT NULL,
	"overall_score" numeric(3, 2),
	"dimensions" jsonb,
	"flags" jsonb,
	"top_issues" jsonb,
	"top_strengths" jsonb,
	"tokens_input" integer,
	"tokens_output" integer,
	"evaluated_until_message_id" uuid,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "conversation_evaluations_overall_score_check" CHECK ("conversation_evaluations"."overall_score" IS NULL OR ("conversation_evaluations"."overall_score" >= 0 AND "conversation_evaluations"."overall_score" <= 1))
);
--> statement-breakpoint
ALTER TABLE "conversation_evaluations" ADD CONSTRAINT "conversation_evaluations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_evaluations" ADD CONSTRAINT "conversation_evaluations_evaluated_until_message_id_messages_id_fk" FOREIGN KEY ("evaluated_until_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_evaluations_conversation_id_evaluated_at_idx" ON "conversation_evaluations" USING btree ("conversation_id","evaluated_at" DESC NULLS LAST);