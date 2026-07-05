import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills module — full CRUD + versions + stats + import, over a real Postgres.
 * Mirrors the shape of `agents-versions.it.test.ts`.
 */
d('skills module', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select()
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createSkillBody = {
    name: 'Branch Coverage Gate',
    description: 'Flag untested branches.',
    type: 'rubric' as const,
    body: 'Every new conditional needs a test for both branches.',
  };

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Agent-${Math.random().toString(36).slice(2)}`,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    return res.json().id as string;
  }

  it('creates a manual skill with defaults (enabled=true, version=1)', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: createSkillBody });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({
      name: 'Branch Coverage Gate',
      description: 'Flag untested branches.',
      type: 'rubric',
      source: 'manual',
      body: createSkillBody.body,
      enabled: true,
      version: 1,
    });
    expect(skill.evidence_files ?? null).toBeNull();

    const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ id: skill.id, name: 'Branch Coverage Gate' });
    await app.close();
  });

  it('defaults enabled=false for a non-manual source', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createSkillBody, name: 'Imported Rubric', source: 'extracted' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ source: 'extracted', enabled: false });
    await app.close();
  });

  it('an explicit enabled overrides the source-based default', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createSkillBody, name: 'Force Enabled', source: 'extracted', enabled: true },
    });
    expect(res.json()).toMatchObject({ source: 'extracted', enabled: true });
    await app.close();
  });

  it('404s for an unknown skill id', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${ghost}`, payload: { name: 'x' } }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${ghost}` })).statusCode).toBe(
      404,
    );
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${ghost}/versions` })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}/stats` })).statusCode).toBe(
      404,
    );
    await app.close();
  });

  it('GET /skills lists agent_count, updated by linking an agent', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createSkillBody });
    const skillId = created.json().id as string;
    const agentId = await createAgent(app);

    const before = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{
      id: string;
      agent_count: number;
    }>;
    expect(before.find((s) => s.id === skillId)?.agent_count).toBe(0);

    const link = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillId] },
    });
    expect(link.statusCode).toBe(200);

    const after = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{
      id: string;
      agent_count: number;
    }>;
    expect(after.find((s) => s.id === skillId)?.agent_count).toBe(1);
    await app.close();
  });

  it('update: only a body change bumps version + snapshots skill_versions', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createSkillBody });
    const skillId = created.json().id as string;

    // Name-only change: no version bump.
    const renamed = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { name: 'Branch Coverage Gate v2' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().version).toBe(1);

    // enabled-only change: no version bump.
    const toggled = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { enabled: false },
    });
    expect(toggled.json().version).toBe(1);

    let versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);

    // Body change: version bumps to 2 and a new skill_versions row appears.
    const rebodied = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'Updated body text.' },
    });
    expect(rebodied.statusCode).toBe(200);
    expect(rebodied.json().version).toBe(2);
    expect(rebodied.json().body).toBe('Updated body text.');

    versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({
      skill_id: skillId,
      version: 2,
      body: 'Updated body text.',
    });
    expect(versions[1]).toMatchObject({ version: 1, body: createSkillBody.body });
    expect(typeof versions[0].created_at).toBe('string');

    // Setting body to the SAME value again does not bump the version.
    const noop = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'Updated body text.' },
    });
    expect(noop.json().version).toBe(2);
    await app.close();
  });

  it('delete cascades skill_versions and agent_skills rows', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createSkillBody });
    const skillId = created.json().id as string;
    const agentId = await createAgent(app);
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillId] },
    });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    const { db } = pg.handle;
    const remainingVersions = await db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId));
    expect(remainingVersions).toHaveLength(0);

    const remainingLinks = await db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, skillId));
    expect(remainingLinks).toHaveLength(0);

    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}` })).statusCode).toBe(404);
    await app.close();
  });

  it('stats: used_by / agents / findings_by_category', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createSkillBody });
    const skillId = created.json().id as string;

    const agentRes = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Stats Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    const agentId = agentRes.json().id as string;
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillId] },
    });

    // No reviews yet: used_by reflects the link; findings empty.
    const emptyStats = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` })
    ).json();
    expect(emptyStats.used_by).toBe(1);
    expect(emptyStats.agents).toEqual([{ id: agentId, name: 'Stats Agent' }]);
    expect(emptyStats.findings_by_category).toEqual([]);

    // Insert a repo/PR/review/findings directly so stats has something to join.
    const { db } = pg.handle;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'stats-repo', fullName: 'acme/stats-repo' })
      .returning();
    const [pull] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'PR',
        author: 'x',
        branch: 'feat',
        base: 'main',
        headSha: 'abc',
      })
      .returning();
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pull!.id, agentId, kind: 'review' })
      .returning();
    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'test-coverage',
        title: 'Missing branch test',
        rationale: 'x',
        confidence: 0.8,
      },
      {
        reviewId: review!.id,
        file: 'a.ts',
        startLine: 2,
        endLine: 2,
        severity: 'CRITICAL',
        category: 'test-coverage',
        title: 'Missing branch test 2',
        rationale: 'x',
        confidence: 0.9,
      },
      {
        reviewId: review!.id,
        file: 'b.ts',
        startLine: 1,
        endLine: 1,
        severity: 'INFO',
        category: 'style',
        title: 'nit',
        rationale: 'x',
        confidence: 0.5,
      },
    ]);

    const stats = (await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` })).json();
    expect(stats.used_by).toBe(1);
    expect(stats.agents).toEqual([{ id: agentId, name: 'Stats Agent' }]);
    const byCategory: Record<string, number> = Object.fromEntries(
      stats.findings_by_category.map((f: { category: string; count: number }) => [
        f.category,
        f.count,
      ]),
    );
    expect(byCategory['test-coverage']).toBe(2);
    expect(byCategory['style']).toBe(1);
    await app.close();
  });

  it('import: extracts a preview from a .md file, unsaved (no id/version)', async () => {
    const app = await makeApp();
    const md = [
      '---',
      'name: Mock Overuse Gate',
      'description: Flag over-mocked tests.',
      'type: custom',
      '---',
      '',
      'Body content here.',
    ].join('\n');
    const content_base64 = Buffer.from(md, 'utf-8').toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'mock-overuse-gate.md', content_base64 },
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(preview).toMatchObject({
      name: 'Mock Overuse Gate',
      description: 'Flag over-mocked tests.',
      type: 'custom',
      source: 'extracted',
      ignored: [],
    });
    expect(preview.body).toContain('Body content here.');
    expect(preview.id).toBeUndefined();
    expect(preview.enabled).toBeUndefined();
    expect(preview.version).toBeUndefined();
    await app.close();
  });

  it('import: extracts SKILL.md from a .zip and reports the ignored script', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const skillMd = [
      '---',
      'name: Corner Case Checklist',
      'description: Checklist for edge cases.',
      'type: convention',
      '---',
      '',
      'Body from zip.',
    ].join('\n');
    const zip = zipSync({
      'SKILL.md': strToU8(skillMd),
      'scripts/run.sh': strToU8('#!/bin/sh\necho hi\n'),
    });
    const content_base64 = Buffer.from(zip).toString('base64');

    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'bundle.zip', content_base64 },
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(preview).toMatchObject({
      name: 'Corner Case Checklist',
      description: 'Checklist for edge cases.',
      type: 'convention',
      source: 'extracted',
      ignored: ['scripts/run.sh'],
    });
    expect(preview.body).toContain('Body from zip.');

    // Confirm-save flow: POST the preview to /skills, ending up disabled.
    const saved = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: preview.name,
        description: preview.description,
        type: preview.type,
        body: preview.body,
        source: preview.source,
      },
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.json()).toMatchObject({ source: 'extracted', enabled: false });
    await app.close();
  });

  it('import: a corrupt .zip is a client error (422), not a 500', async () => {
    const app = await makeApp();
    const content_base64 = Buffer.from('this is not a zip file', 'utf-8').toString('base64');
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'broken.zip', content_base64 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error?.code).toBe('validation_error');
    await app.close();
  });

  it('import: a decompression-bomb .zip is rejected with 422', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const huge = 'a'.repeat(2_000_000); // compresses tiny; declared uncompressed >> cap
    const zip = zipSync({ 'SKILL.md': strToU8(`# Bomb\n\n${huge}`) });
    const content_base64 = Buffer.from(zip).toString('base64');

    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'bomb.zip', content_base64 },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('update: concurrent body edits keep versions consistent (no lost snapshot)', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createSkillBody });
    const skillId = created.json().id as string;

    // Two concurrent body changes from the same base version (1).
    await Promise.all([
      app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: 'concurrent body A' } }),
      app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: 'concurrent body B' } }),
    ]);

    const skill = (await app.inject({ method: 'GET', url: `/skills/${skillId}` })).json();
    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json() as Array<{ version: number; body: string }>;

    // Both edits must have serialized into distinct versions: 1 -> 2 -> 3.
    expect(skill.version).toBe(3);
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    // The live body must match the newest snapshot (no divergence).
    expect(versions[0]!.body).toBe(skill.body);
    await app.close();
  });
});
