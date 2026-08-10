ALTER TABLE "mesa_attendants" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "mesa_attendants" ADD CONSTRAINT "mesa_attendants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mesa_attendants_user_id_idx" ON "mesa_attendants" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "mesa_attendants" ADD CONSTRAINT "mesa_attendants_user_id_unique" UNIQUE("user_id");