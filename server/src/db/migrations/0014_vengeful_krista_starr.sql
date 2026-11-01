ALTER TABLE "onboarding" ALTER COLUMN "json" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ALTER COLUMN "generated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "onboarding" ALTER COLUMN "generated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "generation_id" uuid;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "generation_status" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "generation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "generation_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "generation_error" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();