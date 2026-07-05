import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

/**
 * Skills feature — wiring `AgentsRepository.linkedSkills` into
 * `ReviewRunExecutor.runOneAgent`. Verifies (via the persisted run trace's
 * `prompt_assembly.skills`, the same block reviewer-core renders as
 * "## Skills / rules"):
 *  - a manual, enabled skill's body appears verbatim
 *  - a disabled skill's body is entirely absent
 *  - an 'extracted' (non-manual) skill's body appears wrapped in
 *    `<untrusted source="skill:...">...</untrusted>`
 */
d('run-executor: skills wired into the review prompt', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  let repoSeq = 0;
  async function setupRepoAndPr() {
    const name = `skills-wiring-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 501,
        title: 'Add config value',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'A PR.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return { repo: repo!, pr: pr! };
  }

  async function insertSkill(values: {
    name: string;
    body: string;
    source: 'manual' | 'imported_url' | 'extracted' | 'community';
    enabled: boolean;
  }) {
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: values.name,
        description: `${values.name} description`,
        type: 'convention',
        source: values.source,
        body: values.body,
        enabled: values.enabled,
      })
      .returning();
    return skill!;
  }

  it('renders manual skill verbatim, omits disabled skill, wraps extracted skill as untrusted', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr();

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Skilled Reviewer',
          provider: 'openai',
          model: 'gpt-4.1',
          system_prompt: 'Review the diff.',
        },
      })
    ).json();

    const manualSkill = await insertSkill({
      name: 'branch-coverage-gate',
      body: 'MANUAL_SKILL_MARKER: flag any branch missing a test.',
      source: 'manual',
      enabled: true,
    });
    const disabledSkill = await insertSkill({
      name: 'disabled-rule',
      body: 'DISABLED_SKILL_MARKER: should never appear.',
      source: 'manual',
      enabled: false,
    });
    const extractedSkill = await insertSkill({
      name: 'imported-convention',
      body: 'EXTRACTED_SKILL_MARKER: some imported instruction.',
      source: 'extracted',
      enabled: true,
    });

    // Link in a specific order (order = index), mirroring `setSkills`.
    await pg.handle.db.insert(t.agentSkills).values([
      { agentId: agent.id, skillId: manualSkill.id, order: 0 },
      { agentId: agent.id, skillId: disabledSkill.id, order: 1 },
      { agentId: agent.id, skillId: extractedSkill.id, order: 2 },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    const skillsBlock = trace.prompt_assembly.skills as string;

    expect(skillsBlock).toBeTruthy();
    // Manual skill: verbatim, not wrapped.
    expect(skillsBlock).toContain('MANUAL_SKILL_MARKER: flag any branch missing a test.');
    // Disabled skill: absent entirely.
    expect(skillsBlock).not.toContain('DISABLED_SKILL_MARKER');
    // Extracted (non-manual) skill: wrapped as untrusted content.
    expect(skillsBlock).toContain(
      '<untrusted source="skill:imported-convention">\nEXTRACTED_SKILL_MARKER: some imported instruction.\n</untrusted>',
    );

    await app.close();
  });

  it('an agent with no linked skills omits the skills block entirely', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'No Skills Reviewer',
          provider: 'openai',
          model: 'gpt-4.1',
          system_prompt: 'Review the diff.',
        },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.skills).toBeNull();

    await app.close();
  });
});
