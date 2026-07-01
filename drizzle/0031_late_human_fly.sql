CREATE TYPE "public"."client_document_dispatch_status" AS ENUM('pending', 'sent', 'failed', 'manual');--> statement-breakpoint
CREATE TYPE "public"."client_document_dispatch_target" AS ENUM('bevi_a', 'bevi_b', 'mesa');--> statement-breakpoint
CREATE TYPE "public"."client_document_slot" AS ENUM('identidade_frente', 'identidade_verso', 'comprovante_endereco');--> statement-breakpoint
CREATE TYPE "public"."client_document_status" AS ENUM('stored');--> statement-breakpoint
CREATE TABLE "client_document_downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_document_id" uuid NOT NULL,
	"downloaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"lead_id" uuid,
	"contact_id" uuid,
	"slot" "client_document_slot" NOT NULL,
	"s3_bucket" text NOT NULL,
	"s3_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "client_document_status" DEFAULT 'stored' NOT NULL,
	"dispatch_status" "client_document_dispatch_status" DEFAULT 'pending' NOT NULL,
	"dispatch_target" "client_document_dispatch_target",
	"dispatched_at" timestamp with time zone,
	"bevi_ref" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_document_downloads" ADD CONSTRAINT "client_document_downloads_client_document_id_client_documents_id_fk" FOREIGN KEY ("client_document_id") REFERENCES "public"."client_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_document_downloads" ADD CONSTRAINT "client_document_downloads_downloaded_by_user_id_fk" FOREIGN KEY ("downloaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_document_downloads_client_document_id_idx" ON "client_document_downloads" USING btree ("client_document_id");--> statement-breakpoint
CREATE INDEX "client_documents_lead_id_idx" ON "client_documents" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "client_documents_conversation_id_idx" ON "client_documents" USING btree ("conversation_id");