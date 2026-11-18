ALTER TABLE "ci_installations" ADD COLUMN "workflow_file" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "runner_version" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workflow_run_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "run_attempt" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "critical" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "warning" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "suggestion" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_agent_repo_uq" ON "ci_installations" USING btree ("agent_id","repo");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_run_uq" ON "ci_runs" USING btree ("ci_installation_id","workflow_run_id","run_attempt");--> statement-breakpoint
CREATE INDEX "ci_runs_ran_at_idx" ON "ci_runs" USING btree ("ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ci_runs_agent_run_idx" ON "ci_runs" USING btree ("agent_run_id");