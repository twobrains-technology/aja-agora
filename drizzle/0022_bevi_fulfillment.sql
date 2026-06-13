CREATE TABLE "bevi_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"lead_id" uuid,
	"proposal_id" text NOT NULL,
	"simulation_session_id" text,
	"oferta_id" text,
	"offer_expires_at" timestamp with time zone,
	"segmento" varchar(30),
	"administradora" varchar(60),
	"grupo" varchar(30),
	"credit_value" numeric(12, 2),
	"monthly_payment" numeric(12, 2),
	"consortium_proposal_link" text,
	"documents_link_personal" text,
	"documents_link_address" text,
	"proposal_status" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bevi_proposals" ADD CONSTRAINT "bevi_proposals_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bevi_proposals" ADD CONSTRAINT "bevi_proposals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bevi_proposals_conversation_id_idx" ON "bevi_proposals" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "bevi_proposals_proposal_id_idx" ON "bevi_proposals" USING btree ("proposal_id");
