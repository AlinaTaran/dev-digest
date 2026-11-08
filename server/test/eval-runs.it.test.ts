import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { EVAL_MAX_CASES_PER_RUN, EvalSuiteRun } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  EvalStubLLM,
  FILE_A,
  FIXTURE_DIFF_MARKER,
  FORBIDDEN_MARKERS,
  VALID_DIFF,
  makeApp,
  waitRun,
  type App,
} from './helpers/eval-fixture.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('eval runs', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let n = 0;
  const apps: App[] = [];

  const newApp = async (llm: EvalStubLLM | null) => {
    const app = await makeApp(pg, { llm });
    apps.push(app);
    return app;
  };
  const mkAgent = async (app: App, prompt = 'SYSTEM-PROMPT-OLD') => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `eval-run-agent-${n++}`, provider: 'openrouter', model: 'm', system_prompt: prompt },
    });
    return res.json().id as string;
  };
  const mkCases = async (app: App, agentId: string, count: number) => {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/eval-cases`,
        payload: {
          name: `case-${i}`,
          input_diff: VALID_DIFF.replace('"manual"', `"${FIXTURE_DIFF_MARKER}-${i}"`),
          expected_output: [{ expect: 'must_find', file: FILE_A, start_line: 2 }],
        },
      });
      ids.push(res.json().id);
    }
    return ids;
  };
  const start = (app: App, agentId: string) => app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    while (apps.length) await apps.pop()!.close();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('409 no_cases, 404 unknown agent, 409 llm_not_configured (AC-43/44/46)', async () => {
    const app = await newApp(null);
    const agentId = await mkAgent(app);
    const none = await start(app, agentId);
    expect(none.statusCode).toBe(409);
    expect(none.json().error).toMatchObject({ code: 'eval_run_unavailable', details: { reason: 'no_cases' } });
    expect((await app.inject({ method: 'POST', url: '/agents/00000000-0000-4000-8000-000000000000/eval-runs' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/eval-runs/00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);

    await mkCases(app, agentId, 1);
    const noKey = await start(app, agentId);
    expect(noKey.statusCode).toBe(409);
    expect(noKey.json().error.details.reason).toBe('llm_not_configured');
    const rows = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.ownerId, agentId));
    expect(rows).toHaveLength(0);
  });

  it('409 too_many_cases on an agent with more than the per-run cap (AC-63/EC-26)', async () => {
    const app = await newApp(new EvalStubLLM([]));
    const agentId = await mkAgent(app);
    await pg.handle.db.insert(t.evalCases).values(
      Array.from({ length: EVAL_MAX_CASES_PER_RUN + 1 }, (_, i) => ({
        workspaceId,
        ownerKind: 'agent' as const,
        ownerId: agentId,
        name: `bulk-${i}`,
        inputDiff: '',
        expectedOutput: [],
      })),
    );
    const res = await start(app, agentId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'eval_run_unavailable', details: { reason: 'too_many_cases' } });
  });

  it('202 fast with a slow stub; 409 in-progress; snapshot is frozen; progress monotonic (AC-35/36/37/38/39)', async () => {
    const llm = new EvalStubLLM([{ file: FILE_A, start_line: 2 }], ['gate', 'gate', 'gate', 'gate']);
    const app = await newApp(llm);
    const agentId = await mkAgent(app);
    await mkCases(app, agentId, 4);

    const t0 = Date.now();
    const res = await start(app, agentId);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(res.statusCode).toBe(202);
    const run = EvalSuiteRun.parse(res.json().eval_run);
    expect(run).toMatchObject({ status: 'running', cases_total: 4, owner_kind: 'agent', owner_version: 1 });

    const second = await start(app, agentId);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatchObject({ code: 'eval_run_in_progress', details: { active_run_id: run.id } });

    // AC-37: change the prompt mid-run.
    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { system_prompt: 'SYSTEM-PROMPT-NEW' } });

    const seen: number[] = [];
    llm.release();
    for (;;) {
      const body = (await app.inject({ method: 'GET', url: `/eval-runs/${run.id}` })).json();
      seen.push(body.eval_run.cases_done);
      if (body.eval_run.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    const final = await waitRun(app, run.id);
    expect(final.eval_run).toMatchObject({ status: 'done', cases_done: 4, cases_errored: 0 });
    expect(final.eval_run.config_snapshot.system_prompt).toBe('SYSTEM-PROMPT-OLD');
    expect(final.eval_run.metrics).toMatchObject({ recall: 1, precision: 1, traces_passed: 4, traces_total: 4 });
    expect(final.results).toHaveLength(4);

    // AC-33/36: exactly N calls, old prompt, case diff, no review-only sections.
    expect(llm.calls).toBe(4);
    for (let i = 0; i < 4; i++) {
      const text = llm.allText(i);
      expect(text).toContain('SYSTEM-PROMPT-OLD');
      expect(text).not.toContain('SYSTEM-PROMPT-NEW');
      expect(text).toContain(FIXTURE_DIFF_MARKER);
      for (const m of FORBIDDEN_MARKERS) expect(text).not.toContain(m);
    }
    expect(llm.peak).toBeLessThanOrEqual(3); // NFR-1

    // History lists the run; the lock is released.
    const list = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs?days=7` })).json();
    expect(list.map((r: { id: string }) => r.id)).toEqual([run.id]);
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs?days=5` })).statusCode).toBe(422);
    expect((await start(app, agentId)).statusCode).toBe(202);
    await waitRun(app, (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs` })).json()[0].id);
  });

  it('isolates a failing case: partial; all failing: failed with null metrics; classifies reasons (AC-40/41)', async () => {
    const partial = new EvalStubLLM([{ file: FILE_A, start_line: 2 }], ['ok', 'throw', 'ok', 'ok']);
    // Exactly one call throws (the 2nd to arrive); which case it hits does not matter.
    const app = await newApp(partial);
    const agentId = await mkAgent(app);
    await mkCases(app, agentId, 4);
    const r1 = await waitRun(app, (await start(app, agentId)).json().eval_run.id);
    expect(r1.eval_run.status).toBe('partial');
    expect(r1.results).toHaveLength(4);
    const errored = r1.results.filter((r: { error: unknown }) => r.error);
    expect(errored).toHaveLength(1);
    expect(errored[0]).toMatchObject({ pass: false, error: { reason: 'llm_failed' }, recall: null });
    expect(r1.eval_run.metrics.traces_passed).toBeLessThanOrEqual(3);
    expect(r1.eval_run.metrics).toMatchObject({ traces_total: 4, recall: 1 });

    const allBad = new EvalStubLLM([], [], 0, 'invalid');
    const app2 = await newApp(allBad);
    const agent2 = await mkAgent(app2);
    await mkCases(app2, agent2, 2);
    const r2 = await waitRun(app2, (await start(app2, agent2)).json().eval_run.id);
    expect(r2.eval_run).toMatchObject({ status: 'failed', metrics: null, cases_errored: 2 });
    expect(r2.results.every((r: { error: { reason: string } }) => r.error.reason === 'invalid_output')).toBe(true);
  });

  it('a case that never answers becomes a timeout error (D21)', async () => {
    const llm = new EvalStubLLM([{ file: FILE_A, start_line: 2 }], ['never']);
    const app = await newApp(llm);
    const agentId = await mkAgent(app);
    await mkCases(app, agentId, 1);
    // The 90 s deadline is not configurable through the HTTP path: drive runCase directly.
    const { runCase } = await import('../src/modules/eval/runner.js');
    const { buildAgentRunConfig } = await import('../src/modules/eval/snapshot.js');
    const container = app.container;
    const agent = (await container.agentsRepo.getById(workspaceId, agentId))!;
    const [c0] = await container.evalRepo.listCases(workspaceId, 'agent', agentId);
    const out = await runCase({
      config: await buildAgentRunConfig(container, agent),
      evalCase: c0!,
      llm,
      timeoutMs: 100,
    });
    expect(out.error?.reason).toBe('timeout');
    expect(out.pass).toBe(false);
  });

  it('reaps interrupted runs on boot: failed, or partial when cases finished (AC-45)', async () => {
    const db = pg.handle.db;
    const probe = await newApp(new EvalStubLLM());
    const agentA = await mkAgent(probe);
    const agentB = await mkAgent(probe);
    const mk = (ownerId: string, casesDone: number) =>
      db.insert(t.evalSuiteRuns).values({
        workspaceId, ownerKind: 'agent', ownerId, agentId: ownerId, casesTotal: 3, casesDone,
      }).returning();
    const [a] = await mk(agentA, 0);
    const [b] = await mk(agentB, 2);
    await newApp(new EvalStubLLM()); // boot reaper
    const got = async (id: string) => (await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, id)))[0]!;
    expect(await got(a!.id)).toMatchObject({ status: 'failed', errorReason: 'interrupted' });
    expect(await got(b!.id)).toMatchObject({ status: 'partial', errorReason: 'interrupted' });
    expect((await got(a!.id)).finishedAt).not.toBeNull();
  });

  it('logs run/case lines without diff content (NFR-7) and never re-runs a case (NFR-4)', async () => {
    const llm = new EvalStubLLM([{ file: FILE_A, start_line: 2 }]);
    const app = await newApp(llm);
    const info = vi.spyOn(app.log, 'info');
    const agentId = await mkAgent(app);
    await mkCases(app, agentId, 2);
    await waitRun(app, (await start(app, agentId)).json().eval_run.id);
    const lines = info.mock.calls.filter((c) => c[1] === 'eval.case' || c[1] === 'eval.run');
    expect(lines.filter((c) => c[1] === 'eval.case')).toHaveLength(2);
    expect(lines.filter((c) => c[1] === 'eval.run')).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain(FIXTURE_DIFF_MARKER);
    expect(llm.calls).toBe(2);
  });

  it('deleting an agent removes its cases, results and runs (EC-8)', async () => {
    const llm = new EvalStubLLM([{ file: FILE_A, start_line: 2 }]);
    const app = await newApp(llm);
    const agentId = await mkAgent(app);
    const [caseId] = await mkCases(app, agentId, 1);
    const run = await waitRun(app, (await start(app, agentId)).json().eval_run.id);
    expect(run.results).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: `/agents/${agentId}` })).statusCode).toBeLessThan(300);
    const db = pg.handle.db;
    expect(await db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, agentId))).toHaveLength(0);
    expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.ownerId, agentId))).toHaveLength(0);
    expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, caseId!))).toHaveLength(0);
  });
});
