import { and, eq } from 'drizzle-orm';
import type { Finding, EvalExpectation, EvalCaseMeta } from '@devdigest/shared';
import type { Db } from './client.js';
import * as t from './schema.js';
// Pure scoring only (no I/O in core), so the seeded numbers match what a real run computes.
import { scoreCase, aggregateRun, type AggregateCaseResult } from '../modules/eval/core/index.js';

/**
 * Seed the eval pipeline demo data (NFR-11): for the Security Reviewer, two cases
 * (one must_find, one must_not_flag) and two finished suite runs (v1 older, v2 newer)
 * with different system prompts so Compare renders a prompt diff. No LLM, no key.
 *
 * Idempotent + additive: cases are keyed by (owner, name); runs are seeded only when the
 * agent has no suite runs yet. Timestamps are relative to now so the default 30-day
 * dashboard period always includes them.
 */

const DAY_MS = 86_400_000;

const META_BASE = { repo: 'acme/payments-api', pr_number: 482, head_sha: 'evalseed0001', source: null };

interface SeedCase {
  name: string;
  diff: string;
  files: Array<{ path: string; additions: number; deletions: number }>;
  meta: EvalCaseMeta;
  expectations: EvalExpectation[];
  notes: string;
}

const SEED_CASES: SeedCase[] = [
  {
    name: 'Hardcoded API key in config',
    diff: [
      'diff --git a/src/config.ts b/src/config.ts',
      '--- a/src/config.ts',
      '+++ b/src/config.ts',
      '@@ -10,3 +10,4 @@',
      ' export const config = {',
      "   region: 'eu-west-1',",
      "+  paymentKey: 'sk_live_xxx',",
      ' };',
      '',
    ].join('\n'),
    files: [{ path: 'src/config.ts', additions: 1, deletions: 0 }],
    meta: { ...META_BASE, title: 'Add payment provider key', body: 'Wires the live payment key into config.' },
    expectations: [{ expect: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 12, severity: 'CRITICAL', category: 'security' }],
    notes: 'Seeded: the reviewer must flag the committed secret.',
  },
  {
    name: 'Parameterised query is not an injection',
    diff: [
      'diff --git a/src/db/users.ts b/src/db/users.ts',
      '--- a/src/db/users.ts',
      '+++ b/src/db/users.ts',
      '@@ -20,3 +20,4 @@',
      ' export async function findUser(db: Db, email: string) {',
      '+  return db.query("SELECT id FROM users WHERE email = $1", [email]);',
      ' }',
      '',
    ].join('\n'),
    files: [{ path: 'src/db/users.ts', additions: 1, deletions: 0 }],
    meta: { ...META_BASE, title: 'Look up user by email', body: 'Uses a parameterised query.' },
    expectations: [{ expect: 'must_not_flag', file: 'src/db/users.ts', start_line: 21, end_line: 21 }],
    notes: 'Seeded: a safe parameterised query must not be flagged as injection.',
  },
];

const PROMPT_V1 = [
  'You are a security reviewer.',
  'Review the diff for security problems.',
  'Report anything that looks suspicious.',
  'Be thorough and flag every query you see.',
].join('\n');

const PROMPT_V2 = [
  'You are a security reviewer.',
  'Review the diff for security problems.',
  'Report only issues you can cite with an exact file and line.',
  'Do not flag parameterised queries as injection.',
].join('\n');

function finding(id: string, file: string, line: number, title: string, severity: Finding['severity']): Finding {
  return {
    id,
    severity,
    category: 'security',
    title,
    file,
    start_line: line,
    end_line: line,
    rationale: 'Seeded finding for the eval demo.',
    confidence: 0.9,
  };
}

const SECRET = finding('seed-f-secret', 'src/config.ts', 12, 'Hardcoded live API key', 'CRITICAL');
const FALSE_ALARM = finding('seed-f-inject', 'src/db/users.ts', 21, 'Possible SQL injection', 'WARNING');

/** Kept findings per case name, per run version. */
const RUN_OUTPUTS: Array<{ version: number; promptText: string; kept: Record<string, Finding[]> }> = [
  {
    version: 1,
    promptText: PROMPT_V1,
    kept: { [SEED_CASES[0]!.name]: [SECRET], [SEED_CASES[1]!.name]: [FALSE_ALARM] },
  },
  {
    version: 2,
    promptText: PROMPT_V2,
    kept: { [SEED_CASES[0]!.name]: [SECRET], [SEED_CASES[1]!.name]: [] },
  },
];

export async function seedEval(db: Db, workspaceId: string): Promise<void> {
  const [agent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
  if (!agent) return;

  // ---- cases (keyed by owner + name) ----
  const caseIds = new Map<string, string>();
  for (const c of SEED_CASES) {
    const [existing] = await db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agent.id),
          eq(t.evalCases.name, c.name),
        ),
      );
    if (existing) {
      caseIds.set(c.name, existing.id);
      continue;
    }
    const [row] = await db
      .insert(t.evalCases)
      .values({
        workspaceId,
        ownerKind: 'agent',
        ownerId: agent.id,
        name: c.name,
        inputDiff: c.diff,
        inputFiles: c.files,
        inputMeta: c.meta,
        expectedOutput: c.expectations,
        notes: c.notes,
      })
      .returning({ id: t.evalCases.id });
    caseIds.set(c.name, row!.id);
  }

  // ---- suite runs (only when the agent has none yet) ----
  const [anyRun] = await db
    .select({ id: t.evalSuiteRuns.id })
    .from(t.evalSuiteRuns)
    .where(
      and(
        eq(t.evalSuiteRuns.workspaceId, workspaceId),
        eq(t.evalSuiteRuns.ownerKind, 'agent'),
        eq(t.evalSuiteRuns.ownerId, agent.id),
      ),
    );
  if (anyRun) return;

  const now = Date.now();
  for (const run of RUN_OUTPUTS) {
    const startedAt = new Date(now - (3 - run.version) * DAY_MS);
    const finishedAt = new Date(startedAt.getTime() + 4_000);
    const [suite] = await db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        ownerKind: 'agent',
        ownerId: agent.id,
        ownerVersion: run.version,
        agentId: agent.id,
        agentVersion: run.version,
        status: 'done',
        startedAt,
        finishedAt,
        casesTotal: SEED_CASES.length,
        casesDone: SEED_CASES.length,
        casesErrored: 0,
        configSnapshot: {
          provider: agent.provider,
          model: agent.model,
          system_prompt: run.promptText,
          strategy: agent.strategy,
          skills: [],
          agent_name: agent.name,
          skill_body: null,
        },
        caseIds: SEED_CASES.map((c) => caseIds.get(c.name)!),
      })
      .returning({ id: t.evalSuiteRuns.id });

    const aggregateInput: AggregateCaseResult[] = [];
    for (const c of SEED_CASES) {
      const score = scoreCase({
        expectations: c.expectations,
        kept: run.kept[c.name] ?? [],
        dropped: [],
      });
      await db.insert(t.evalRuns).values({
        caseId: caseIds.get(c.name)!,
        suiteRunId: suite!.id,
        ranAt: finishedAt,
        actualOutput: score.actual_output,
        pass: score.pass,
        recall: score.recall,
        precision: score.precision,
        citationAccuracy: score.citation_accuracy,
        durationMs: 2_000,
        costUsd: 0,
      });
      aggregateInput.push({
        name: c.name,
        pass: score.pass,
        error: null,
        counts: score.counts,
        cost_usd: 0,
        expected: c.expectations,
        actual: score.actual_output.kept,
      });
    }

    const agg = aggregateRun(aggregateInput, 4_000);
    await db
      .update(t.evalSuiteRuns)
      .set({ metrics: agg.metrics, status: agg.status, casesErrored: agg.cases_errored })
      .where(eq(t.evalSuiteRuns.id, suite!.id));
  }
}
