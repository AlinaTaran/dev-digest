import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { agentRuns } from './runs';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    /** Workflow file name inside `.github/workflows/` — stored so renaming the agent can't break ingest. */
    workflowFile: text('workflow_file').notNull().default(''),
    runnerVersion: text('runner_version').notNull().default(''),
    prUrl: text('pr_url'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('ci_installations_agent_repo_uq').on(t.agentId, t.repo)],
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
    workflowRunId: bigint('workflow_run_id', { mode: 'number' }),
    runAttempt: integer('run_attempt'),
    repo: text('repo'),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    status: text('status'),
    verdict: text('verdict'),
    findingsCount: integer('findings_count'),
    critical: integer('critical'),
    warning: integer('warning'),
    suggestion: integer('suggestion'),
    costUsd: doublePrecision('cost_usd'),
    githubUrl: text('github_url'),
    source: text('source'),
  },
  (t) => [
    uniqueIndex('ci_runs_run_uq').on(t.ciInstallationId, t.workflowRunId, t.runAttempt),
    index('ci_runs_ran_at_idx').on(t.ranAt.desc()),
    index('ci_runs_agent_run_idx').on(t.agentRunId),
  ],
);
