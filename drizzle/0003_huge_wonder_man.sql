DROP INDEX "conversations_handed_off_to_idx";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "handed_off_to";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "agent_name";