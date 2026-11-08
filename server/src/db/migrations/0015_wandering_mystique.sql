CREATE TABLE "eval_suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"owner_version" integer DEFAULT 1 NOT NULL,
	"agent_id" uuid,
	"agent_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cases_total" integer DEFAULT 0 NOT NULL,
	"cases_done" integer DEFAULT 0 NOT NULL,
	"cases_errored" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb,
	"config_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"case_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_reason" text
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "suite_run_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error" jsonb;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_suite_runs_owner_started_idx" ON "eval_suite_runs" USING btree ("workspace_id","owner_kind","owner_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "eval_suite_runs_ws_started_idx" ON "eval_suite_runs" USING btree ("workspace_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_runs_one_running_uniq" ON "eval_suite_runs" USING btree ("owner_kind","owner_id") WHERE "eval_suite_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_run_id_eval_suite_runs_id_fk" FOREIGN KEY ("suite_run_id") REFERENCES "public"."eval_suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_owner_source_finding_uniq" ON "eval_cases" USING btree ("owner_kind","owner_id","source_finding_id");--> statement-breakpoint
CREATE INDEX "eval_cases_ws_owner_idx" ON "eval_cases" USING btree ("workspace_id","owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "eval_runs_suite_idx" ON "eval_runs" USING btree ("suite_run_id");--> statement-breakpoint
CREATE INDEX "eval_runs_case_ran_idx" ON "eval_runs" USING btree ("case_id","ran_at" DESC NULLS LAST);