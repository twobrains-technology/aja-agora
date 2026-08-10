ALTER TABLE "messages" ADD COLUMN "media_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "media_type" varchar(16);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "media_mime_type" varchar(128);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "media_filename" varchar(255);