ALTER TABLE "conversations" ADD COLUMN "handed_off_user_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone" varchar(32);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "invited_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "invited_by" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "invite_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_handed_off_user_id_user_id_fk" FOREIGN KEY ("handed_off_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_handed_off_user_id_idx" ON "conversations" USING btree ("handed_off_user_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_invite_token_unique" UNIQUE("invite_token");