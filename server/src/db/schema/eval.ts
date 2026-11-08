import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Idempotency guard: one case per (owner, source finding). NULL for hand-made cases.
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    sourceUniq: uniqueIndex('eval_cases_owner_source_finding_uniq').on(
      t.ownerKind,
      t.ownerId,
      t.sourceFindingId,
    ),
    ownerIdx: index('eval_cases_ws_owner_idx').on(t.workspaceId, t.ownerKind, t.ownerId),
  }),
);

// One execution of a case set ("eval run"). owner_id is polymorphic (agent|skill) and
// agent_id has no FK on purpose: run history survives agent/skill deletes.
export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    ownerVersion: integer('owner_version').notNull().default(1),
    agentId: uuid('agent_id'),
    agentVersion: integer('agent_version').notNull().default(1),
    status: text('status', { enum: ['running', 'done', 'partial', 'failed'] })
      .notNull()
      .default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    casesTotal: integer('cases_total').notNull().default(0),
    casesDone: integer('cases_done').notNull().default(0),
    casesErrored: integer('cases_errored').notNull().default(0),
    metrics: jsonb('metrics'),
    configSnapshot: jsonb('config_snapshot').notNull().default({}),
    caseIds: jsonb('case_ids').notNull().default([]),
    errorReason: text('error_reason'),
  },
  (t) => ({
    ownerStartedIdx: index('eval_suite_runs_owner_started_idx').on(
      t.workspaceId,
      t.ownerKind,
      t.ownerId,
      t.startedAt.desc(),
    ),
    wsStartedIdx: index('eval_suite_runs_ws_started_idx').on(t.workspaceId, t.startedAt.desc()),
    // One active run per owner.
    activeUniq: uniqueIndex('eval_suite_runs_one_running_uniq')
      .on(t.ownerKind, t.ownerId)
      .where(sql`${t.status} = 'running'`),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    suiteRunId: uuid('suite_run_id').references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    error: jsonb('error'),
  },
  (t) => ({
    suiteIdx: index('eval_runs_suite_idx').on(t.suiteRunId),
    caseRanIdx: index('eval_runs_case_ran_idx').on(t.caseId, t.ranAt.desc()),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
