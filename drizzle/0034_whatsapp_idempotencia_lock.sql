CREATE TABLE "whatsapp_conversation_locks" (
	"wa_id" varchar(50) PRIMARY KEY NOT NULL,
	"holder" varchar(64) NOT NULL,
	"locked_until" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_once_keys" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"scope" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "whatsapp_once_keys_created_at_idx" ON "whatsapp_once_keys" USING btree ("created_at");