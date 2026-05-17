ALTER TABLE "conversations" ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL;