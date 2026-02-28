ALTER TYPE "public"."audit_action" ADD VALUE 'project_trashed' BEFORE 'brief_submitted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'project_restored' BEFORE 'brief_submitted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'project_purged' BEFORE 'brief_submitted';--> statement-breakpoint
ALTER TABLE "personas" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint