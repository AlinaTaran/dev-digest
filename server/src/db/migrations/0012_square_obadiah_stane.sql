ALTER TABLE "conventions" ADD COLUMN "category" text DEFAULT 'uncategorized' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line_start" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line_end" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;