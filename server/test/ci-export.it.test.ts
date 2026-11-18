import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeCiApp, createAgent, REPO } from './helpers/ci-fixture.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { loadRunner } from '../src/modules/ci/runner.js';
import type { BundleRunner } from '../src/modules/ci/bundle.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('ci export (preview + export + agent CI tab)', () => {
  let pg: PgFixture;
  // The real `agent-runner/dist/` (build it first: `cd agent-runner && pnpm build`).
  let runner: BundleRunner;
  const runnerEntry = () => runner.files.find((f) => f.path === 'index.js')!.contents;
  beforeAll(async () => {
    runner = await loadRunner();
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const body = { repo: REPO };

  it('previews 6 path kinds for an agent with skills, none for skill-less, with 0 LLM/GitHub calls', async () => {
    const github = new MockGitHubClient();
    const { app, llm } = await makeCiApp(pg, github);
    const withSkills = await createAgent(app, 'openrouter', ['Alpha', 'Beta']);
    const res = await app.inject({ method: 'POST', url: `/agents/${withSkills.id}/ci/preview`, payload: body });
    expect(res.statusCode).toBe(200);
    const paths = (res.json().files as { path: string }[]).map((f) => f.path);
    expect(paths).toHaveLength(6);
    expect(paths.filter((p) => p.startsWith('.devdigest/skills/'))).toHaveLength(2);
    const runnerFile = res.json().files.find((f: { path: string }) => f.path === '.devdigest/runner/index.js');
    expect(runnerFile).toMatchObject({ contents: '', editable: false, version: runner.version });

    const bare = await createAgent(app);
    const bareRes = await app.inject({ method: 'POST', url: `/agents/${bare.id}/ci/preview`, payload: body });
    expect(bareRes.json().files).toHaveLength(4);

    expect(llm.calls).toHaveLength(0);
    expect(github.committed).toHaveLength(0);
    expect(github.openedPrs).toHaveLength(0);
    await app.close();
  });

  it('rejects non-openrouter agents with 422 unsupported_provider and unknown repos with repo_not_connected', async () => {
    const { app } = await makeCiApp(pg, new MockGitHubClient());
    const oa = await createAgent(app, 'openai');
    const res = await app.inject({ method: 'POST', url: `/agents/${oa.id}/ci/preview`, payload: body });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('unsupported_provider');

    const ok = await createAgent(app);
    const bad = await app.inject({
      method: 'POST',
      url: `/agents/${ok.id}/export-ci`,
      payload: { repo: 'nobody/nothing' },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('repo_not_connected');
    await app.close();
  });

  it('open_pr commits only to devdigest/ci, opens one PR, reuses it, honours the workflow override', async () => {
    const github = new MockGitHubClient();
    const { app, llm } = await makeCiApp(pg, github);
    const agent = await createAgent(app);

    const first = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { ...body, action: 'open_pr', workflow_override: 'name: hand-edited\n' },
    });
    expect(first.statusCode).toBe(200);
    expect(github.committed).toHaveLength(1);
    expect(github.committed[0]).toMatchObject({ branch: 'devdigest/ci', base: 'main' });
    const committed = github.committed[0]!.files;
    expect(committed.find((f) => f.path.endsWith('.yml'))!.contents).toBe('name: hand-edited\n');
    expect(committed.find((f) => f.path === '.devdigest/runner/index.js')!.contents).toBe(runnerEntry());
    // Every dist file ships (ncc chunks too), not just the entry.
    expect(
      committed.filter((f) => f.path.startsWith('.devdigest/runner/')).map((f) => f.path.replace('.devdigest/runner/', '')).sort(),
    ).toEqual(runner.files.map((f) => f.path).sort());
    expect(github.openedPrs).toHaveLength(1);
    expect(github.openedPrs[0]).toMatchObject({ title: 'Add DevDigest CI review', head: 'devdigest/ci', base: 'main' });
    expect(first.json().pr_url).toBe('https://github.com/mock/mock/pull/1');
    // Response does not echo the large runner text.
    expect(first.json().files.find((f: { path: string }) => f.path === '.devdigest/runner/index.js').contents).toBe('');

    const second = await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci`, payload: body });
    expect(second.statusCode).toBe(200);
    expect(github.committed).toHaveLength(2);
    expect(github.openedPrs).toHaveLength(1);
    expect(second.json().pr_url).toBe(first.json().pr_url);

    const ci = await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci` });
    expect(ci.json().installations).toHaveLength(1);
    expect(ci.json().installations[0]).toMatchObject({
      repo: REPO,
      runner_version: runner.version,
      pr_url: first.json().pr_url,
      recent_runs: [],
    });
    expect(ci.json().installations[0].workflow_file).toMatch(/^devdigest-review-.+\.yml$/);
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('a GitHub failure returns 502 with the reason and stores no installation', async () => {
    const github = new MockGitHubClient({ errors: { commitFiles: new Error('Resource not accessible (403)') } });
    const { app } = await makeCiApp(pg, github);
    const agent = await createAgent(app);
    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci`, payload: body });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toContain('Resource not accessible');
    const ci = await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci` });
    expect(ci.json().installations).toEqual([]);
    await app.close();
  });

  it('zip returns the 6 path kinds, touches no GitHub and stores an installation without a PR', async () => {
    const github = new MockGitHubClient();
    const { app } = await makeCiApp(pg, github);
    const agent = await createAgent(app, 'openrouter', ['Gamma']);
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { ...body, action: 'zip' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="devdigest-ci-.+\.zip"/);
    const files = unzipSync(new Uint8Array(res.rawPayload));
    const names = Object.keys(files);
    expect(names).toHaveLength(4 + runner.files.length); // manifest, skill, memory, workflow + runner files
    expect(names.some((n) => n.startsWith('.github/workflows/devdigest-review-'))).toBe(true);
    expect(strFromU8(files['.devdigest/runner/index.js']!)).toBe(runnerEntry());
    expect(github.committed).toHaveLength(0);
    expect(github.openedPrs).toHaveLength(0);

    const ci = await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci` });
    expect(ci.json().installations[0]).toMatchObject({ repo: REPO, pr_url: null });
    await app.close();
  });

  it('a changed ci_fail_on shows up on GET /agents/:id/ci', async () => {
    const { app } = await makeCiApp(pg, new MockGitHubClient());
    const agent = await createAgent(app);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci` })).json().ci_fail_on).toBe('critical');
    const put = await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { ci_fail_on: 'warning' } });
    expect(put.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci` })).json().ci_fail_on).toBe('warning');
    await app.close();
  });
});
