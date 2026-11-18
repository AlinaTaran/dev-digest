import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeCiApp, createAgent, resultArtifact, REPO, type CiApp } from './helpers/ci-fixture.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient, type MockGitHubOptions } from '../src/adapters/mocks.js';
import type { WorkflowRunMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const run = (id: number, attempt = 1): WorkflowRunMeta => ({
  id,
  run_attempt: attempt,
  html_url: `https://github.com/${REPO}/actions/runs/${id}`,
  created_at: `2026-11-1${id % 10}T10:00:00Z`,
  conclusion: 'failure',
});

d('ci ingest (refresh + runs list)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let opts: MockGitHubOptions;
  let github: MockGitHubClient;
  let app: CiApp;

  const db = () => pg.handle.db;
  const ciAgentRuns = () =>
    db().select().from(t.agentRuns).where(eq(t.agentRuns.source, 'ci'));

  /** Install an agent through the zip export and return its stored workflow file. */
  async function install(repo = REPO) {
    const agent = await createAgent(app);
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo, action: 'zip' },
    });
    expect(res.statusCode).toBe(200);
    const ci = await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci` });
    return { agent, workflowFile: ci.json().installations[0].workflow_file as string };
  }
  const refresh = async () => (await app.inject({ method: 'POST', url: '/ci/runs/refresh' })).json();

  beforeAll(async () => {
    pg = await startPg();
    await seed(db());
    const [ws] = await db().select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    opts = {};
    github = new MockGitHubClient(opts);
    ({ app } = await makeCiApp(pg, github));
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });
  beforeEach(async () => {
    await db().delete(t.ciRuns);
    await db().delete(t.agentRuns).where(eq(t.agentRuns.source, 'ci'));
    await db().delete(t.ciInstallations);
    opts.workflowRuns = {};
    opts.artifacts = {};
    opts.errors = undefined;
    github.downloads.length = 0;
    github.listedWorkflows.length = 0;
  });

  it('ingests only its own workflow runs, is idempotent and lists newest first', async () => {
    const { agent, workflowFile } = await install();
    opts.workflowRuns = {
      [`${REPO}:${workflowFile}`]: [run(102), run(101)],
      [`${REPO}:unrelated.yml`]: [run(103)],
    };
    opts.artifacts = {
      101: resultArtifact({ pr_number: 11 }),
      102: resultArtifact({ pr_number: 12, cost_usd: null, status: 'no_findings', verdict: 'comment', findings_count: 0, critical: 0, warning: 0, suggestion: 0, blockers: 0 }),
      103: resultArtifact(),
    };

    expect(await refresh()).toEqual({ ingested: 2, errors: [] });
    expect(github.listedWorkflows).toEqual([`${REPO}:${workflowFile}`]);
    expect(github.downloads.sort()).toEqual([101, 102]);

    const rows = await ciAgentRuns();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.prId === null && r.agentId === agent.id)).toBe(true);
    expect(rows.map((r) => r.status)).toEqual(['done', 'done']);

    const list = (await app.inject({ method: 'GET', url: '/ci/runs' })).json().items;
    expect(list.map((r: { pr_number: number }) => r.pr_number)).toEqual([12, 11]);
    expect(list[0]).toMatchObject({ cost_usd: null, status: 'no_findings', repo: REPO, agent: agent.name, source: 'ci' });
    expect(list[0].github_url).toBe(`https://github.com/${REPO}/actions/runs/102`);
    expect(list[1]).toMatchObject({ cost_usd: 0.012, duration_s: 4.2, critical: 1, run_attempt: 1, verdict: 'request_changes' });

    // Second refresh: nothing new, nothing downloaded again, row counts unchanged.
    const downloaded = github.downloads.length;
    expect(await refresh()).toEqual({ ingested: 0, errors: [] });
    expect(github.downloads).toHaveLength(downloaded);
    expect(await db().select().from(t.ciRuns)).toHaveLength(2);
    expect(await ciAgentRuns()).toHaveLength(2);

    // The agent's CI tab sees the same runs.
    const ci = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci` })).json();
    expect(ci.installations[0].recent_runs).toHaveLength(2);

    // A re-run attempt of the same workflow run is a new row.
    opts.workflowRuns = { [`${REPO}:${workflowFile}`]: [run(101, 2), run(102), run(101)] };
    opts.artifacts[101] = resultArtifact({ pr_number: 11 });
    expect((await refresh()).ingested).toBe(1);
  });

  it('records nothing for missing, broken or invalid artifacts', async () => {
    const { workflowFile } = await install();
    opts.workflowRuns = { [`${REPO}:${workflowFile}`]: [run(201), run(202), run(203)] };
    opts.artifacts = {
      201: null,
      202: new TextEncoder().encode('definitely not a zip'),
      203: resultArtifact({ schema_version: 2 }),
    };
    expect(await refresh()).toEqual({ ingested: 0, errors: [] });
    expect(await db().select().from(t.ciRuns)).toHaveLength(0);
    expect(await ciAgentRuns()).toHaveLength(0);
  });

  it('one failing repository does not block the others', async () => {
    await db().insert(t.repos).values({ workspaceId, owner: 'acme', name: 'second', fullName: 'acme/second' }).onConflictDoNothing();
    const a = await install(REPO);
    const b = await install('acme/second');
    opts.workflowRuns = {
      [`${REPO}:${a.workflowFile}`]: [run(301)],
      [`acme/second:${b.workflowFile}`]: [run(302)],
    };
    opts.artifacts = { 301: resultArtifact(), 302: resultArtifact({ pr_number: 7 }) };
    opts.errors = { listWorkflowRuns: { [REPO]: new Error('Resource not accessible by personal access token') } };

    const out = await refresh();
    expect(out.ingested).toBe(1);
    expect(out.errors).toEqual([{ repo: REPO, reason: 'Resource not accessible by personal access token' }]);
    const items = (await app.inject({ method: 'GET', url: '/ci/runs' })).json().items;
    expect(items.map((r: { repo: string }) => r.repo)).toEqual(['acme/second']);
  });

  it('does not touch PR run history (AC-79) and rolls back both rows when ci_runs fails (NFR-5)', async () => {
    const [pr] = await db().select().from(t.pullRequests).limit(1);
    const prRuns = () => app.inject({ method: 'GET', url: `/pulls/${pr!.id}/runs` }).then((r) => r.body);
    const prLinked = () => db().select().from(t.agentRuns).where(isNotNull(t.agentRuns.prId));
    const beforeBody = await prRuns();
    const beforeLinked = (await prLinked()).length;

    const { workflowFile } = await install();
    opts.workflowRuns = { [`${REPO}:${workflowFile}`]: [run(401)] };
    opts.artifacts = { 401: resultArtifact() };

    await db().execute(sql`
      CREATE OR REPLACE FUNCTION ci_runs_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced ci_runs failure'; END; $$ LANGUAGE plpgsql`);
    await db().execute(sql`CREATE TRIGGER ci_runs_fail BEFORE INSERT ON ci_runs FOR EACH ROW EXECUTE FUNCTION ci_runs_fail()`);
    try {
      const failed = await refresh();
      expect(failed.ingested).toBe(0);
      expect(failed.errors).toHaveLength(1);
      expect(await ciAgentRuns()).toHaveLength(0);
      expect(await db().select().from(t.ciRuns)).toHaveLength(0);
    } finally {
      await db().execute(sql`DROP TRIGGER ci_runs_fail ON ci_runs`);
    }
    expect(await refresh()).toEqual({ ingested: 1, errors: [] });
    expect(await ciAgentRuns()).toHaveLength(1);

    expect(await prRuns()).toBe(beforeBody);
    expect((await prLinked()).length).toBe(beforeLinked);
  });

  it('lists at most 50 runs, newest first', async () => {
    const { agent } = await install();
    const [inst] = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, agent.id));
    for (let i = 0; i < 55; i++) {
      const ranAt = new Date(Date.UTC(2026, 10, 1, 0, i));
      const [ar] = await db()
        .insert(t.agentRuns)
        .values({ workspaceId, agentId: agent.id, source: 'ci', status: 'done', ranAt })
        .returning();
      await db().insert(t.ciRuns).values({
        ciInstallationId: inst!.id, agentRunId: ar!.id, workflowRunId: 5000 + i, runAttempt: 1,
        repo: REPO, prNumber: i, ranAt, status: 'succeeded', source: 'ci',
      });
    }
    const items = (await app.inject({ method: 'GET', url: '/ci/runs' })).json().items;
    expect(items).toHaveLength(50);
    expect(items[0].pr_number).toBe(54);
    expect(items[49].pr_number).toBe(5);
  });
});
