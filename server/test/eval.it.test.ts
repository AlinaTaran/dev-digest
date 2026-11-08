import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { EvalCaseActualOutput, EvalCaseView } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  EvalStubLLM,
  FILE_A,
  FORBIDDEN_MARKERS,
  VALID_DIFF,
  makeApp,
  seedFixture,
  type App,
  type Fixture,
} from './helpers/eval-fixture.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('eval cases', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: App;
  let fx: Fixture;
  let agentId: string;
  const llm = new EvalStubLLM([{ file: FILE_A, start_line: 2 }]);

  const createAgent = async (name: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openrouter', model: 'm', system_prompt: `SYSTEM-${name}` },
    });
    return res.json().id as string;
  };
  const fromFinding = (id: string, payload?: unknown) =>
    app.inject({ method: 'POST', url: `/findings/${id}/eval-case`, ...(payload ? { payload: payload as never } : {}) });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    app = await makeApp(pg, { llm });
    agentId = await createAgent('eval-cases-agent');
    fx = await seedFixture(pg.handle.db, workspaceId, agentId);
  });
  afterEach(() => {
    llm.requests = [];
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('turns an accepted finding into a must_find case (AC-3/6/7/9/10 idempotent)', async () => {
    const res = await fromFinding(fx.accepted);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.created).toBe(true);
    expect(body.owner_name).toBe('eval-cases-agent');
    const c = EvalCaseView.parse(body.case);
    expect(c.name).toBe('hardcoded-stripe-secret-key-in-commit');
    expect(c.expected_output).toHaveLength(1);
    expect(c.expected_output[0]).toMatchObject({ expect: 'must_find', file: FILE_A, start_line: 2 });
    // AC-7: diff came from pr_files (no clone), only the finding's file.
    expect(c.input_diff).toContain('+++ b/src/a.ts');
    expect(c.input_diff).not.toContain('src/b.ts');
    expect(c.input_files).toEqual([{ path: FILE_A, additions: 2, deletions: 0 }]);
    expect(c.input_meta).toMatchObject({ repo: expect.stringContaining('acme/'), pr_number: 1, title: 'Add secrets', body: 'PR body' });
    expect(c.input_meta.source).toMatchObject({ finding_id: fx.accepted, review_id: fx.reviewId, agent_id: agentId, decision: 'accepted' });

    const again = await fromFinding(fx.accepted);
    expect(again.statusCode).toBe(200);
    expect(again.json().created).toBe(false);
    expect(again.json().case.id).toBe(c.id);
  });

  it('dismissed -> must_not_flag; concurrent double POST yields one case (AC-4/9)', async () => {
    const [a, b] = await Promise.all([fromFinding(fx.dismissed), fromFinding(fx.dismissed)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().case.id).toBe(b.json().case.id);
    expect(a.json().case.expected_output[0].expect).toBe('must_not_flag');
    const rows = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, fx.dismissed));
    expect(rows).toHaveLength(1);
  });

  it('409 undecided / no_diff, 404 foreign + missing finding (AC-5/11/13)', async () => {
    const u = await fromFinding(fx.undecided);
    expect(u.statusCode).toBe(409);
    expect(u.json().error).toMatchObject({ code: 'eval_case_unavailable', details: { reason: 'undecided' } });
    const n = await fromFinding(fx.noPatchFinding);
    expect(n.statusCode).toBe(409);
    expect(n.json().error.details.reason).toBe('no_diff');
    expect((await fromFinding(fx.foreignFinding)).statusCode).toBe(404);
    expect((await fromFinding('00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
  });

  it('409 agent_missing when the review has no agent or the agent is gone (AC-12)', async () => {
    const db = pg.handle.db;
    const goneAgent = await createAgent('soon-deleted');
    const mkFinding = async (aId: string | null) => {
      const [rev] = await db
        .insert(t.reviews)
        .values({ workspaceId, prId: fx.prId, agentId: aId, kind: 'review' })
        .returning();
      const [f] = await db
        .insert(t.findings)
        .values({
          reviewId: rev!.id, file: FILE_A, startLine: 2, endLine: 2, severity: 'WARNING', category: 'bug',
          title: 'x', rationale: 'r', confidence: 0.5, acceptedAt: new Date(),
        })
        .returning();
      return f!.id;
    };
    const noAgent = await mkFinding(null);
    const orphan = await mkFinding(goneAgent);
    await app.inject({ method: 'DELETE', url: `/agents/${goneAgent}` });
    for (const id of [noAgent, orphan]) {
      const res = await fromFinding(id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.details.reason).toBe('agent_missing');
    }
  });

  it('hand-made cases: validation 400 with paths, update keeps id + results (AC-20/21/22/24/25/26/33/34)', async () => {
    const post = (payload: unknown) => app.inject({ method: 'POST', url: `/agents/${agentId}/eval-cases`, payload: payload as never });
    const good = { name: 'manual-case', input_diff: VALID_DIFF, expected_output: [{ expect: 'must_find', file: FILE_A, start_line: 2 }] };

    // AC-21: empty, garbage, 300 KB.
    for (const diff of ['', 'garbage text', `${VALID_DIFF}\n${'+x'.repeat(150_000)}`]) {
      const res = await post({ ...good, input_diff: diff });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details.fields[0].path).toBe('input_diff');
    }
    // AC-20: invalid expectation.
    const bad = await post({ ...good, expected_output: [{ expect: 'maybe', file: 'a', start_line: 1 }] });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.details.fields[0].path).toBe('expected_output[0].expect');

    // CRLF is normalised (EC-23); placeholders fill meta.
    const created = await post({ ...good, input_diff: VALID_DIFF.replace(/\n/g, '\r\n') });
    expect(created.statusCode).toBe(201);
    const c = EvalCaseView.parse(created.json());
    expect(c.input_diff).not.toContain('\r');
    expect(c.input_meta).toEqual({ repo: '', pr_number: 0, title: '', body: '', head_sha: '', source: null });

    // AC-24/33/34: single-case run, 1 LLM call, suite_run_id null, actual_output parses.
    llm.requests = [];
    const run = await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    expect(run.statusCode).toBe(200);
    const result = run.json();
    expect(result.suite_run_id).toBeNull();
    expect(result).toMatchObject({ pass: true, recall: 1, expected_count: 1, got_count: 1, error: null });
    expect(() => EvalCaseActualOutput.parse(result.actual_output)).not.toThrow();
    expect(llm.calls).toBe(1);
    const text = llm.allText();
    expect(text).toContain('+const secret');
    for (const m of FORBIDDEN_MARKERS) expect(text).not.toContain(m);

    // AC-25: run history is unchanged.
    const runs = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs` });
    expect(runs.json()).toEqual([]);

    // AC-22: PUT keeps id + earlier results, recomputes input_files; AC-20: invalid PUT -> 400.
    const other = VALID_DIFF.replace(/src\/a\.ts/g, 'src/b.ts');
    const put = await app.inject({ method: 'PUT', url: `/eval-cases/${c.id}`, payload: { input_diff: other } });
    expect(put.statusCode).toBe(200);
    expect(put.json().id).toBe(c.id);
    expect(put.json().input_files[0].path).toBe('src/b.ts');
    expect(put.json().last_result.id).toBe(result.id);
    const badPut = await app.inject({ method: 'PUT', url: `/eval-cases/${c.id}`, payload: { expected_output: [{ expect: 'maybe' }] } });
    expect(badPut.statusCode).toBe(400);

    // listing shows last_result; AC-26 delete -> 404.
    const list = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` });
    expect(list.json().find((x: { id: string }) => x.id === c.id).last_result.pass).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);
  });

  it('404 across workspaces / unknown agents for every case endpoint (AC-46)', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/eval-cases` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/agents/${ghost}/eval-cases`, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/eval-cases/${ghost}/run` })).statusCode).toBe(404);
  });
});
