import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { EVAL_MAX_CASES_PER_RUN, EvalDashboard, EvalOverview, RunAllEvalResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { EvalStubLLM, FILE_A, VALID_DIFF, makeApp, waitRun, type App } from './helpers/eval-fixture.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DAY = 86_400_000;
const SNAPSHOT = {
  provider: 'openrouter',
  model: 'm',
  system_prompt: 'p',
  strategy: 'single',
  skills: [],
  agent_name: 'a',
  skill_body: null,
};

function metrics(recall: number, precision: number, citation = 1, passed = 3, total = 3, cost: number | null = 0.1) {
  return {
    recall,
    precision,
    citation_accuracy: citation,
    traces_passed: passed,
    traces_total: total,
    duration_ms: 1000,
    cost_usd: cost,
    per_trace: [],
  };
}

d('eval dashboards', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let n = 0;
  const apps: App[] = [];

  const newApp = async (llm: EvalStubLLM | null) => {
    const app = await makeApp(pg, { llm });
    apps.push(app);
    return app;
  };
  const mkAgent = async (app: App, extra: Record<string, unknown> = {}) => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `eval-dash-agent-${n++}`, provider: 'openrouter', model: 'm', system_prompt: 'p', ...extra },
    });
    return res.json().id as string;
  };
  const mkCase = async (app: App, agentId: string, name = 'case-0') =>
    app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-cases`,
      payload: { name, input_diff: VALID_DIFF, expected_output: [{ expect: 'must_find', file: FILE_A, start_line: 2 }] },
    });
  const insertRun = async (
    agentId: string,
    ageDays: number,
    status: 'done' | 'partial' | 'failed',
    m: ReturnType<typeof metrics> | null,
    version = 1,
    kind: 'agent' | 'skill' = 'agent',
  ) => {
    const startedAt = new Date(Date.now() - ageDays * DAY);
    const [row] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        ownerKind: kind,
        ownerId: agentId,
        ownerVersion: version,
        agentId,
        agentVersion: version,
        status,
        startedAt,
        finishedAt: startedAt,
        casesTotal: 3,
        casesDone: 3,
        metrics: m,
        configSnapshot: SNAPSHOT,
      })
      .returning();
    return row!.id;
  };
  const dash = async (app: App, agentId: string, days?: number) => {
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-dashboard${days ? `?days=${days}` : ''}` });
    expect(res.statusCode, res.body).toBe(200);
    return EvalDashboard.parse(res.json());
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('trend asc without failed runs, deltas and 404/422 (AC-56, EC-17)', async () => {
    const app = await newApp(null);
    const agentId = await mkAgent(app);
    await mkCase(app, agentId);
    const empty = await dash(app, agentId);
    expect(empty).toMatchObject({ trend: [], alert: null, cases_total: 1, delta: { recall: 0 } });

    const r1 = await insertRun(agentId, 3, 'done', metrics(0.5, 0.5), 1);
    await insertRun(agentId, 2, 'failed', null, 2);
    const r3 = await insertRun(agentId, 1, 'partial', metrics(0.75, 0.5, 1, 2, 3, null), 3);

    const body = await dash(app, agentId);
    expect(body.trend.map((p) => p.run_id)).toEqual([r1, r3]);
    expect(body.trend[1]).toMatchObject({ agent_version: 3, cost_usd: null });
    expect(body.trend[1]!.pass_rate).toBeCloseTo(2 / 3);
    expect(body.current).toMatchObject({ recall: 0.75, traces_passed: 2, cost_usd: null });
    expect(body.delta.recall).toBeCloseTo(0.25);
    expect(body.delta.precision).toBe(0);
    expect(body.recent_runs).toHaveLength(3); // failed stays in history, not in trend
    expect(body.recent_runs[0]!.id).toBe(r3);

    expect((await app.inject({ method: 'GET', url: '/agents/00000000-0000-4000-8000-000000000000/eval-dashboard' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-dashboard?days=5` })).statusCode).toBe(422);
  });

  it('days=7 excludes older runs (AC-64)', async () => {
    const app = await newApp(null);
    const agentId = await mkAgent(app);
    await insertRun(agentId, 20, 'done', metrics(0.4, 0.4));
    const recent = await insertRun(agentId, 2, 'done', metrics(0.6, 0.6));
    const week = await dash(app, agentId, 7);
    expect(week.trend.map((p) => p.run_id)).toEqual([recent]);
    expect(week.recent_runs).toHaveLength(1);
    expect((await dash(app, agentId, 30)).trend).toHaveLength(2);
  });

  it('alert only on a >= 0.02 drop, names the metric and version (AC-65)', async () => {
    const app = await newApp(null);
    const small = await mkAgent(app);
    await insertRun(small, 2, 'done', metrics(0.8, 0.8), 6);
    await insertRun(small, 1, 'done', metrics(0.79, 0.8), 7);
    expect((await dash(app, small)).alert).toBeNull();

    const big = await mkAgent(app);
    await insertRun(big, 2, 'done', metrics(0.8, 0.82), 6);
    await insertRun(big, 1, 'done', metrics(0.8, 0.8), 7);
    expect((await dash(app, big)).alert).toBe('Precision dipped 2pts on v7');
  });

  it('overview: agent cards, sparkline <= 10, recent 20, agent runs only (AC-60/61/62/86)', async () => {
    const app = await newApp(null);
    const withRuns = await mkAgent(app);
    const noRuns = await mkAgent(app);
    const noCases = await mkAgent(app);
    await mkCase(app, withRuns);
    await mkCase(app, noRuns);
    for (let i = 0; i < 12; i++) await insertRun(withRuns, 12 - i, 'done', metrics(i / 20, 1), 1);
    await insertRun(withRuns, 0.5, 'failed', null);
    await insertRun(noCases, 0.1, 'done', metrics(0.1, 0.1), 1, 'skill'); // skill run: never shown

    const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });
    expect(res.statusCode).toBe(200);
    const body = EvalOverview.parse(res.json());
    const card = body.agents.find((a) => a.agent_id === withRuns)!;
    expect(card).toMatchObject({ cases_total: 1, model: 'm' });
    expect(card.last_run?.metrics?.recall).toBeCloseTo(11 / 20);
    expect(card.recall_sparkline).toHaveLength(10);
    expect(card.recall_sparkline[9]).toBeCloseTo(11 / 20); // oldest first, newest last
    expect(card.recall_sparkline[0]).toBeCloseTo(2 / 20);
    expect(body.agents.find((a) => a.agent_id === noRuns)).toMatchObject({ last_run: null, recall_sparkline: [] });
    expect(body.agents.find((a) => a.agent_id === noCases)).toBeUndefined();
    expect(body.recent_runs.length).toBeLessThanOrEqual(20);
    expect(body.recent_runs.every((r) => r.owner_kind === 'agent' && r.status !== 'failed')).toBe(true);
    expect(body.recent_runs[0]).toMatchObject({ agent_name: expect.stringContaining('eval-dash-agent') });
    expect(body.recent_runs.some((r) => r.owner_id === noCases)).toBe(false);
  });

  it('GET budget: 50 cases x 100 runs well under 300 ms (NFR-1, tolerant)', async () => {
    const app = await newApp(null);
    const agentId = await mkAgent(app);
    await pg.handle.db.insert(t.evalCases).values(
      Array.from({ length: 50 }, (_, i) => ({
        workspaceId,
        ownerKind: 'agent' as const,
        ownerId: agentId,
        name: `perf-${i}`,
        inputDiff: VALID_DIFF,
        inputFiles: [],
        inputMeta: {},
        expectedOutput: [],
      })),
    );
    await pg.handle.db.insert(t.evalSuiteRuns).values(
      Array.from({ length: 100 }, (_, i) => ({
        workspaceId,
        ownerKind: 'agent' as const,
        ownerId: agentId,
        agentId,
        status: 'done' as const,
        startedAt: new Date(Date.now() - (i + 1) * 3_600_000),
        finishedAt: new Date(),
        casesTotal: 50,
        casesDone: 50,
        metrics: metrics(0.5, 0.5, 1, 40, 50),
        configSnapshot: SNAPSHOT,
      })),
    );
    await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-dashboard` }); // warm up
    for (const url of [`/agents/${agentId}/eval-dashboard?days=90`, '/eval/dashboard']) {
      const t0 = performance.now();
      const res = await app.inject({ method: 'GET', url });
      const ms = performance.now() - t0;
      expect(res.statusCode).toBe(200);
      expect(ms).toBeLessThan(300);
    }
  });

  it('run all: starts 2, skips in_progress, disabled, no_cases, too_many_cases, llm key (AC-63)', async () => {
    const llm = new EvalStubLLM([{ file: FILE_A, start_line: 2 }]);
    const app = await newApp(llm);
    const a1 = await mkAgent(app);
    const a2 = await mkAgent(app);
    const busy = await mkAgent(app);
    const off = await mkAgent(app, { enabled: false });
    const empty = await mkAgent(app);
    const big = await mkAgent(app);
    for (const id of [a1, a2, busy, off]) await mkCase(app, id);
    await pg.handle.db.insert(t.evalCases).values(
      Array.from({ length: EVAL_MAX_CASES_PER_RUN + 1 }, (_, i) => ({
        workspaceId,
        ownerKind: 'agent' as const,
        ownerId: big,
        name: `bulk-${i}`,
        inputDiff: '',
        expectedOutput: [],
      })),
    );
    await pg.handle.db.insert(t.evalSuiteRuns).values({
      workspaceId,
      ownerKind: 'agent',
      ownerId: busy,
      agentId: busy,
      status: 'running',
      casesTotal: 1,
      configSnapshot: SNAPSHOT,
    });

    const res = await app.inject({ method: 'POST', url: '/eval-runs', payload: { all: true } });
    expect(res.statusCode).toBe(202);
    const body = RunAllEvalResponse.parse(res.json());
    const mine = new Set([a1, a2, busy, off, empty, big]);
    expect(body.started.filter((r) => mine.has(r.owner_id)).map((r) => r.owner_id).sort()).toEqual([a1, a2].sort());
    const reasons = Object.fromEntries(body.skipped.filter((s) => mine.has(s.agent_id)).map((s) => [s.agent_id, s.reason]));
    expect(reasons).toEqual({ [busy]: 'in_progress', [off]: 'disabled', [empty]: 'no_cases', [big]: 'too_many_cases' });
    for (const r of body.started) await waitRun(app, r.id);

    expect((await app.inject({ method: 'POST', url: '/eval-runs', payload: { all: false } })).statusCode).toBe(422);

    // No provider key: everything with cases is skipped as llm_not_configured, nothing 409s.
    const noKey = await newApp(null);
    const again = await noKey.inject({ method: 'POST', url: '/eval-runs', payload: { all: true } });
    expect(again.statusCode).toBe(202);
    const skipped = Object.fromEntries(again.json().skipped.map((s: { agent_id: string; reason: string }) => [s.agent_id, s.reason]));
    expect(skipped[a1]).toBe('llm_not_configured');
  });
});
