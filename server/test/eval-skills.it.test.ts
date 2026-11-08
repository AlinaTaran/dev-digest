import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { EVAL_MAX_CASES_PER_RUN, EvalCaseView, EvalSuiteRun, EvalTargets } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  EvalStubLLM,
  FILE_A,
  FIXTURE_DIFF_MARKER,
  VALID_DIFF,
  makeApp,
  seedFixture,
  waitRun,
  type App,
  type Fixture,
} from './helpers/eval-fixture.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const NIL = '00000000-0000-4000-8000-000000000000';

d('eval skills (T15)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: App;
  let n = 0;
  const llm = new EvalStubLLM([{ file: FILE_A, start_line: 2 }]);

  const mkAgent = async (extra: Record<string, unknown> = {}) => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `skill-host-${n++}`, provider: 'openrouter', model: 'm', system_prompt: 'HOST-PROMPT', ...extra },
    });
    return res.json().id as string;
  };
  const mkSkill = async (body: string, extra: Record<string, unknown> = {}) => {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `eval-skill-${n++}`, description: 'd', type: 'custom', body, ...extra },
    });
    return res.json() as { id: string; name: string; version: number };
  };
  const link = (agentId: string, skillIds: string[]) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: skillIds } });
  const mkSkillCase = async (skillId: string, i = 0) => {
    const res = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/eval-cases`,
      payload: {
        name: `skill-case-${i}`,
        input_diff: VALID_DIFF.replace('"manual"', `"${FIXTURE_DIFF_MARKER}-${i}"`),
        expected_output: [{ expect: 'must_find', file: FILE_A, start_line: 2 }],
      },
    });
    return res;
  };
  const startRun = (skillId: string, host: string) =>
    app.inject({ method: 'POST', url: `/skills/${skillId}/eval-runs`, payload: { host_agent_id: host } });
  const fromFinding = (findingId: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case`, payload: payload as never });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    app = await makeApp(pg, { llm });
  });
  afterEach(() => {
    llm.requests = [];
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('skill cases CRUD: list/create, 404 foreign skill (AC-72/73)', async () => {
    const skill = await mkSkill('BODY-CRUD');
    const created = await mkSkillCase(skill.id);
    expect(created.statusCode).toBe(201);
    const c = EvalCaseView.parse(created.json());
    expect(c).toMatchObject({ owner_kind: 'skill', owner_id: skill.id });
    const list = await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` });
    expect(list.json().map((x: { id: string }) => x.id)).toEqual([c.id]);
    // generic case endpoints work on skill cases.
    const put = await app.inject({ method: 'PUT', url: `/eval-cases/${c.id}`, payload: { name: 'renamed' } });
    expect(put.json().name).toBe('renamed');
    expect((await app.inject({ method: 'GET', url: `/skills/${NIL}/eval-cases` })).statusCode).toBe(404);
    expect((await mkSkillCase(NIL)).statusCode).toBe(404);
    // a skill's cases never show up under an agent.
    const host = await mkAgent();
    expect((await app.inject({ method: 'GET', url: `/agents/${host}/eval-cases` })).json()).toEqual([]);
  });

  it('finding -> skill case: targets, linked guard, idempotent, foreign 404 (AC-74..77, EC-29)', async () => {
    const agentId = await mkAgent();
    const linked = await mkSkill('BODY-LINKED');
    const unlinked = await mkSkill('BODY-UNLINKED');
    await link(agentId, [linked.id]);
    const fx: Fixture = await seedFixture(pg.handle.db, workspaceId, agentId);

    const targets = await app.inject({ method: 'GET', url: `/findings/${fx.accepted}/eval-targets` });
    expect(targets.statusCode).toBe(200);
    expect(EvalTargets.parse(targets.json())).toEqual({
      agent: { id: agentId, name: expect.any(String) },
      skills: [{ id: linked.id, name: linked.name }],
    });
    expect((await app.inject({ method: 'GET', url: `/findings/${fx.foreignFinding}/eval-targets` })).statusCode).toBe(404);

    const body = { owner_kind: 'skill', owner_id: linked.id };
    const first = await fromFinding(fx.accepted, body);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      created: true,
      owner_name: linked.name,
      case: { owner_kind: 'skill', owner_id: linked.id, source_finding_id: fx.accepted },
    });
    const again = await fromFinding(fx.accepted, body);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ created: false, case: { id: first.json().case.id } });
    // the agent variant is a separate (finding, owner) pair.
    expect((await fromFinding(fx.accepted, { owner_kind: 'agent', owner_id: agentId })).statusCode).toBe(201);

    const notLinked = await fromFinding(fx.accepted, { owner_kind: 'skill', owner_id: unlinked.id });
    expect(notLinked.statusCode).toBe(409);
    expect(notLinked.json().error.details.reason).toBe('skill_not_linked');
    expect((await fromFinding(fx.accepted, { owner_kind: 'skill', owner_id: NIL })).statusCode).toBe(404);
    expect((await fromFinding(fx.foreignFinding, body)).statusCode).toBe(404);
  });

  it('409 reasons for a skill run: no_host_agent (missing/foreign/disabled), no_cases, llm_not_configured (AC-82, EC-30)', async () => {
    const skill = await mkSkill('BODY-409');
    const host = await mkAgent();
    expect((await startRun(NIL, host)).statusCode).toBe(404);

    const noCases = await startRun(skill.id, host);
    expect(noCases.statusCode).toBe(409);
    expect(noCases.json().error.details.reason).toBe('no_cases');

    await mkSkillCase(skill.id);
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: `foreign-host-${n++}` } as never).returning();
    const [foreignAgent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws2!.id, name: 'foreign-host', provider: 'openrouter', model: 'm', systemPrompt: 'x' } as never)
      .returning();
    const disabled = await mkAgent({ enabled: false });
    for (const hostId of [NIL, foreignAgent!.id, disabled]) {
      const res = await startRun(skill.id, hostId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.details.reason).toBe('no_host_agent');
    }
    // single-case run needs a host too.
    const caseId = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` })).json()[0].id;
    const noHost = await app.inject({ method: 'POST', url: `/eval-cases/${caseId}/run` });
    expect(noHost.statusCode).toBe(409);
    expect(noHost.json().error.details.reason).toBe('no_host_agent');

    const noKeyApp = await makeApp(pg, { llm: null });
    try {
      const res = await noKeyApp.inject({
        method: 'POST',
        url: `/skills/${skill.id}/eval-runs`,
        payload: { host_agent_id: host },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.details.reason).toBe('llm_not_configured');
    } finally {
      await noKeyApp.close();
    }
  });

  it('skill run: only the tested body reaches the engine, snapshot frozen, listed under the skill (AC-79..81, 83, EC-31/32)', async () => {
    const tested = await mkSkill('TESTED-BODY-OLD', { enabled: false }); // EC-32: disabled still runnable
    const other1 = await mkSkill('OTHER-BODY-ONE');
    const other2 = await mkSkill('OTHER-BODY-TWO');
    const host = await mkAgent();
    await link(host, [other1.id, other2.id, tested.id]);
    await mkSkillCase(tested.id, 0);
    await mkSkillCase(tested.id, 1);

    const gated = new EvalStubLLM([{ file: FILE_A, start_line: 2 }], ['gate', 'gate']);
    const gatedApp = await makeApp(pg, { llm: gated });
    try {
      const res = await gatedApp.inject({
        method: 'POST',
        url: `/skills/${tested.id}/eval-runs`,
        payload: { host_agent_id: host },
      });
      expect(res.statusCode).toBe(202);
      const run = EvalSuiteRun.parse(res.json().eval_run);
      expect(run).toMatchObject({
        owner_kind: 'skill',
        owner_id: tested.id,
        owner_version: tested.version,
        agent_id: host,
        status: 'running',
        cases_total: 2,
      });

      // one active skill run per skill.
      const second = await gatedApp.inject({
        method: 'POST',
        url: `/skills/${tested.id}/eval-runs`,
        payload: { host_agent_id: host },
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error).toMatchObject({ code: 'eval_run_in_progress', details: { active_run_id: run.id } });

      // AC-81: edit the body mid-run -> old body used + bumps skills.version (AC-84).
      const put = await gatedApp.inject({ method: 'PUT', url: `/skills/${tested.id}`, payload: { body: 'TESTED-BODY-NEW' } });
      expect(put.statusCode).toBe(200);
      expect(put.json().version).toBe(tested.version + 1);
      gated.release();
      const final = await waitRun(gatedApp, run.id);
      expect(final.eval_run).toMatchObject({ status: 'done', cases_done: 2 });
      const snap = final.eval_run.config_snapshot;
      expect(snap).toMatchObject({
        skill_body: 'TESTED-BODY-OLD',
        skill_id: tested.id,
        skill_version: tested.version,
        system_prompt: 'HOST-PROMPT',
        skills: [{ id: tested.id, name: tested.name, version: tested.version }],
      });

      // AC-80: the captured prompt carries only the tested body.
      const text = gated.allText(0);
      expect(text).toContain('## Skills / rules');
      expect(text).toContain('TESTED-BODY-OLD');
      expect(text).not.toContain('TESTED-BODY-NEW');
      expect(text).not.toContain('OTHER-BODY-ONE');
      expect(text).not.toContain('OTHER-BODY-TWO');

      // AC-83 / EC-31: history under the skill carries host_agent_name from the snapshot.
      const hostRow = (await app.inject({ method: 'GET', url: `/agents/${host}` })).json();
      const hist = await app.inject({ method: 'GET', url: `/skills/${tested.id}/eval-runs` });
      expect(hist.statusCode).toBe(200);
      const [row] = hist.json();
      expect(row).toMatchObject({ id: run.id, host_agent_name: hostRow.name });
    } finally {
      await gatedApp.close();
    }
  });

  it('single skill case run uses the host and only the tested skill (AC-79/80)', async () => {
    const tested = await mkSkill('SINGLE-TESTED');
    const extra = await mkSkill('SINGLE-EXTRA');
    const host = await mkAgent();
    await link(host, [extra.id]);
    const caseId = (await mkSkillCase(tested.id)).json().id as string;
    llm.requests = [];
    const res = await app.inject({ method: 'POST', url: `/eval-cases/${caseId}/run`, payload: { host_agent_id: host } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ suite_run_id: null, error: null });
    expect(llm.allText()).toContain('SINGLE-TESTED');
    expect(llm.allText()).not.toContain('SINGLE-EXTRA');
  });

  it('imported (non-manual) skill body is wrapped as untrusted (EC-35)', async () => {
    const tested = await mkSkill('IMPORTED-BODY', { source: 'extracted', name: 'bad"<name>' });
    const host = await mkAgent();
    const caseId = (await mkSkillCase(tested.id)).json().id as string;
    llm.requests = [];
    const res = await app.inject({ method: 'POST', url: `/eval-cases/${caseId}/run`, payload: { host_agent_id: host } });
    expect(res.statusCode).toBe(200);
    const text = llm.allText();
    expect(text).toContain('IMPORTED-BODY');
    expect(text).toMatch(/untrusted/i);
    expect(text).toContain('skill:bad__name_');
  });

  it('skill runs stay out of agent history, dashboards and run-all (AC-86)', async () => {
    const skill = await mkSkill('BODY-AC86');
    const host = await mkAgent();
    await mkSkillCase(skill.id);
    const res = await startRun(skill.id, host);
    expect(res.statusCode).toBe(202);
    const runId = res.json().eval_run.id as string;
    await waitRun(app, runId);

    expect((await app.inject({ method: 'GET', url: `/agents/${host}/eval-runs` })).json()).toEqual([]);
    const dash = (await app.inject({ method: 'GET', url: `/agents/${host}/eval-dashboard` })).json();
    expect(JSON.stringify(dash)).not.toContain(runId);
    expect(dash.cases_total).toBe(0);
    expect(dash.current).toMatchObject({ traces_total: 0, recall: 0 });

    const overview = (await app.inject({ method: 'GET', url: '/eval/dashboard' })).json();
    expect(overview.recent_runs.some((r: { id: string }) => r.id === runId)).toBe(false);
    expect(overview.agents.some((a: { agent_id: string }) => a.agent_id === host || a.agent_id === skill.id)).toBe(false);

    const all = await app.inject({ method: 'POST', url: '/eval-runs', payload: { all: true } });
    expect(all.statusCode).toBe(202);
    const body = all.json();
    expect(body.started.some((r: { owner_id: string }) => r.owner_id === skill.id)).toBe(false);
    expect(body.skipped.some((s: { agent_id: string }) => s.agent_id === skill.id)).toBe(false);
    // let any agent runs finish so they do not leak into other tests.
    for (const r of body.started as { id: string }[]) await waitRun(app, r.id);
  });

  it('409 too_many_cases on a skill with more than the per-run cap (AC-63/EC-26)', async () => {
    const skill = await mkSkill('BODY-TOO-MANY');
    const host = await mkAgent();
    await link(host, [skill.id]);
    await pg.handle.db.insert(t.evalCases).values(
      Array.from({ length: EVAL_MAX_CASES_PER_RUN + 1 }, (_, i) => ({
        workspaceId,
        ownerKind: 'skill' as const,
        ownerId: skill.id,
        name: `bulk-${i}`,
        inputDiff: '',
        expectedOutput: [],
      })),
    );
    const res = await startRun(skill.id, host);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'eval_run_unavailable', details: { reason: 'too_many_cases' } });
  });

  it('deleting a skill cascades its cases and runs (EC-33)', async () => {
    const skill = await mkSkill('BODY-DELETE');
    const host = await mkAgent();
    await mkSkillCase(skill.id);
    const res = await startRun(skill.id, host);
    await waitRun(app, res.json().eval_run.id);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBeLessThan(300);
    const cases = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, skill.id));
    const runs = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.ownerId, skill.id));
    expect(cases).toHaveLength(0);
    expect(runs).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: `/eval-runs/${res.json().eval_run.id}` })).statusCode).toBe(404);
  });
});
