import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, and, count } from 'drizzle-orm';
import { RepoDocsError } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { FsRepoDocsStore } from '../src/adapters/fs/repo-docs.js';
import { estimateTokens, serializeBlock, specEntry } from '../src/modules/project-context/serialize.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

/** Any call to a GitHub/LLM collaborator fails the test (NFR-6, AC-65). */
function forbidden(name: string) {
  return new Proxy(
    {},
    {
      get: (_t, prop) => () => {
        throw new Error(`${name}.${String(prop)} must not be called by Project Context`);
      },
    },
  ) as never;
}

class FailingWriteStore extends FsRepoDocsStore {
  override async writeExisting(): Promise<void> {
    throw new RepoDocsError('io', 'disk full');
  }
}

d('project-context module', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneDir: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    cloneDir = await mkdtemp(join(tmpdir(), 'devdigest-ctx-'));
  });
  afterAll(async () => {
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  function makeApp(overrides: Record<string, unknown> = {}) {
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      DEVDIGEST_CLONE_DIR: cloneDir,
    } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ head: 'abc1234def' }),
        github: forbidden('github'),
        llm: { openai: forbidden('llm'), anthropic: forbidden('llm'), openrouter: forbidden('llm') },
        ...overrides,
      } as never,
    });
  }

  /** A repo row + a clone dir populated with `files` (relative posix path -> content). */
  async function makeRepo(files: Record<string, string | Buffer>, opts: { cloned?: boolean } = {}) {
    const name = `ctx-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: opts.cloned === false ? null : `${cloneDir}/acme/${name}`,
      })
      .returning();
    const root = join(cloneDir, 'acme', name);
    if (opts.cloned !== false) {
      await mkdir(root, { recursive: true });
      for (const [rel, content] of Object.entries(files)) {
        await mkdir(join(root, rel, '..'), { recursive: true });
        await writeFile(join(root, rel), content);
      }
    }
    return { id: repo!.id, root, name };
  }

  async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>) {
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

  async function makeSkill(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `Skill-${Math.random().toString(36).slice(2)}`, description: 'd', type: 'rubric', body: 'b' },
    });
    return res.json().id as string;
  }

  const FIXTURE = {
    'specs/a.md': '# A\n',
    'docs/x/b.md': '## Goals\nbe fast\n',
    'insights/c.md': 'insight',
    'src/d.md': 'not a context doc',
    'specs/e.txt': 'not markdown',
    'node_modules/pkg/docs/z.md': 'excluded dir',
  };

  // ------------------------------------------------------------------ listing

  it('lists matching docs sorted, typed, with tokens (AC-2, AC-3, AC-4, AC-30)', async () => {
    const app = await makeApp();
    const repo = await makeRepo(FIXTURE);
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.docs.map((x: { path: string }) => x.path)).toEqual([
      'docs/x/b.md',
      'insights/c.md',
      'specs/a.md',
    ]);
    expect(body).toMatchObject({
      degraded: false,
      reason: null,
      truncated: false,
      total_found: 3,
      clone_sha: 'abc1234def',
      globs: ['**/{specs,docs,insights}/**/*.md'],
    });
    const b = body.docs[0];
    expect(b).toMatchObject({ name: 'b.md', dir: 'docs/x', type: 'docs', too_large: false, used_by_agents: 0 });
    expect(b.tokens).toBe(estimateTokens('## Goals\nbe fast\n'));
  });

  it('a new file appears after reindex (AC-7)', async () => {
    const app = await makeApp();
    const repo = await makeRepo(FIXTURE);
    await writeFile(join(repo.root, 'specs', 'new.md'), 'new');
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/context/reindex` });
    expect(res.statusCode).toBe(200);
    expect(res.json().docs.map((x: { path: string }) => x.path)).toContain('specs/new.md');
  });

  it('degrades to not_cloned when there is no clone (AC-10) and is empty with no matches (AC-11)', async () => {
    const app = await makeApp();
    const none = await makeRepo({}, { cloned: false });
    const r1 = await app.inject({ method: 'GET', url: `/repos/${none.id}/context` });
    expect(r1.json()).toMatchObject({ degraded: true, reason: 'not_cloned', docs: [] });

    const empty = await makeRepo({ 'src/only.md': 'x' });
    const r2 = await app.inject({ method: 'GET', url: `/repos/${empty.id}/context` });
    expect(r2.json()).toMatchObject({ degraded: false, reason: null, docs: [], total_found: 0 });
  });

  it('caps the listing at 500 and flags truncated (NFR-1)', async () => {
    const app = await makeApp();
    const files: Record<string, string> = {};
    for (let i = 0; i < 600; i++) files[`docs/d${String(i).padStart(3, '0')}.md`] = `doc ${i}`;
    const repo = await makeRepo(files);
    const body = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(body.docs).toHaveLength(500);
    expect(body).toMatchObject({ truncated: true, total_found: 600 });
  });

  it('marks over-256KB docs too_large without reading them, and drops non-UTF-8 files (EC-2, EC-4)', async () => {
    const app = await makeApp();
    const repo = await makeRepo({
      'specs/big.md': 'x'.repeat(256 * 1024 + 1),
      'specs/bin.md': Buffer.from([0x61, 0x00, 0x62]),
      'specs/ok.md': 'ok',
    });
    const docs = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json().docs;
    expect(docs.map((x: { path: string }) => x.path)).toEqual(['specs/big.md', 'specs/ok.md']);
    expect(docs[0]).toMatchObject({ too_large: true, tokens: 0 });
  });

  it('applies workspace globs (AC-12) and rejects invalid ones with 400, keeping the old value (AC-13)', async () => {
    const app = await makeApp();
    const repo = await makeRepo({ ...FIXTURE, 'adr/0001.md': 'adr', 'a/adr/0002.md': 'adr2' });
    try {
      const ok = await app.inject({
        method: 'PUT',
        url: '/settings',
        payload: { project_context_globs: ['**/adr/**/*.md'] },
      });
      expect(ok.statusCode).toBe(200);
      const listed = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
      expect(listed.docs.map((x: { path: string }) => x.path)).toEqual(['a/adr/0002.md', 'adr/0001.md']);

      for (const bad of [[], ['/abs/*.md'], ['../x/*.md'], ['a/../b/*.md'], ['']]) {
        const res = await app.inject({ method: 'PUT', url: '/settings', payload: { project_context_globs: bad } });
        expect(res.statusCode, JSON.stringify(bad)).toBe(400);
        expect(res.json().error.code).toBe('invalid_project_context_globs');
      }
      const after = (await app.inject({ method: 'GET', url: '/settings' })).json();
      expect(after.project_context_globs).toEqual(['**/adr/**/*.md']);
    } finally {
      await pg.handle.db
        .delete(t.settings)
        .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'project_context_globs')));
    }
  });

  // ------------------------------------------------------------- attach: agent

  it('attaches in order, removes, reorders, and does not bump versions (AC-16/17/18/74)', async () => {
    const app = await makeApp();
    const repo = await makeRepo(FIXTURE);
    const agentId = await makeAgent(app);
    const before = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    const versionsBefore = await pg.handle.db
      .select({ n: count() })
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId));

    const put = (paths: string[]) =>
      app.inject({ method: 'PUT', url: `/agents/${agentId}/context`, payload: { repo_id: repo.id, paths } });

    let res = await put(['specs/a.md']);
    expect(res.statusCode).toBe(200);
    res = await put(['specs/a.md', 'docs/x/b.md']);
    expect(res.json().attached.map((x: { path: string }) => x.path)).toEqual(['specs/a.md', 'docs/x/b.md']);
    res = await put(['docs/x/b.md', 'specs/a.md']);
    let got = (await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${repo.id}` })).json();
    expect(got.attached.map((x: { path: string; position: number }) => [x.path, x.position])).toEqual([
      ['docs/x/b.md', 0],
      ['specs/a.md', 1],
    ]);
    res = await put(['specs/a.md']);
    got = res.json();
    expect(got.attached).toHaveLength(1);

    const after = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(after.version).toBe(before.version);
    const versionsAfter = await pg.handle.db
      .select({ n: count() })
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId));
    expect(versionsAfter[0]!.n).toBe(versionsBefore[0]!.n);
  });

  it('rejects the whole request for every invalid path variant and keeps the old set (AC-26)', async () => {
    const app = await makeApp();
    const repo = await makeRepo(FIXTURE);
    const agentId = await makeAgent(app);
    const put = (paths: string[]) =>
      app.inject({ method: 'PUT', url: `/agents/${agentId}/context`, payload: { repo_id: repo.id, paths } });
    expect((await put(['specs/a.md'])).statusCode).toBe(200);

    for (const bad of ['/specs/a.md', 'specs/../src/d.md', 'specs/e.txt', 'src/d.md', 'specs/a.md\u0000']) {
      const res = await put(['docs/x/b.md', bad]);
      expect(res.statusCode, bad).toBe(400);
      expect(res.json().error.code).toBe('invalid_context_path');
    }
    const dup = await put(['specs/a.md', 'specs/a.md']);
    expect(dup.statusCode).toBe(400);

    const got = (await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${repo.id}` })).json();
    expect(got.attached.map((x: { path: string }) => x.path)).toEqual(['specs/a.md']);
  });

  it('rejects more than 20 paths with 422 too_many_context_docs (AC-27)', async () => {
    const app = await makeApp();
    const repo = await makeRepo({});
    const agentId = await makeAgent(app);
    const paths = Array.from({ length: 21 }, (_, i) => `docs/d${i}.md`);
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context`,
      payload: { repo_id: repo.id, paths },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('too_many_context_docs');
  });

  it('rejects attaching a too-large doc with 413 (EC-2)', async () => {
    const app = await makeApp();
    const repo = await makeRepo({ 'specs/big.md': 'x'.repeat(256 * 1024 + 1) });
    const agentId = await makeAgent(app);
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context`,
      payload: { repo_id: repo.id, paths: ['specs/big.md'] },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('doc_too_large');
  });

  it('serializes concurrent replace-sets for one agent+repo (no PK violation, one set wins intact)', async () => {
    const app = await makeApp();
    const repo = await makeRepo(FIXTURE);
    const agentId = await makeAgent(app);
    const setA = ['specs/a.md', 'docs/x/b.md'];
    const setB = ['docs/x/b.md', 'specs/a.md'];
    const put = (paths: string[]) =>
      app.inject({ method: 'PUT', url: `/agents/${agentId}/context`, payload: { repo_id: repo.id, paths } });

    for (let i = 0; i < 5; i++) {
      const [ra, rb] = await Promise.all([put(setA), put(setB)]);
      expect([ra.statusCode, rb.statusCode]).toEqual([200, 200]);
      const got = (await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${repo.id}` })).json();
      const paths = got.attached.map((x: { path: string }) => x.path);
      expect([setA, setB]).toContainEqual(paths);
    }
  });

  it('shows a deleted doc as missing, and accepts it on PUT so others can be reordered (AC-28)', async () => {
    const app = await makeApp();
    const repo = await makeRepo(FIXTURE);
    const agentId = await makeAgent(app);
    const put = (paths: string[]) =>
      app.inject({ method: 'PUT', url: `/agents/${agentId}/context`, payload: { repo_id: repo.id, paths } });
    await put(['specs/a.md', 'docs/x/b.md']);
    await rm(join(repo.root, 'specs', 'a.md'));
    const res = await put(['docs/x/b.md', 'specs/a.md']);
    expect(res.statusCode).toBe(200);
    expect(res.json().attached).toEqual([
      { path: 'docs/x/b.md', position: 0, missing: false, tokens: estimateTokens('## Goals\nbe fast\n') },
      { path: 'specs/a.md', position: 1, missing: true, tokens: null },
    ]);
  });

  it('scopes attachments to the repo (AC-25) and 404s foreign/unknown ids', async () => {
    const app = await makeApp();
    const a = await makeRepo(FIXTURE);
    const b = await makeRepo(FIXTURE);
    const agentId = await makeAgent(app);
    await app.inject({ method: 'PUT', url: `/agents/${agentId}/context`, payload: { repo_id: a.id, paths: ['specs/a.md'] } });
    const forB = (await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${b.id}` })).json();
    expect(forB.attached).toEqual([]);
    expect(forB.total_tokens).toBe(0);

    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${ghost}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/context?repo_id=${a.id}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${ghost}/context`, payload: { repo_id: a.id, paths: [] } })).statusCode,
    ).toBe(404);
  });

  // ------------------------------------------------------------ skill + inherit

  it('skill attach persists, serializes, leaves evidence_files and version alone (AC-22/23/74/75)', async () => {
    const app = await makeApp();
    const repo = await makeRepo(FIXTURE);
    const skillId = await makeSkill(app);
    const [before] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skillId));
    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}/context`,
      payload: { repo_id: repo.id, paths: ['specs/a.md'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      attached: [{ path: 'specs/a.md', position: 0, missing: false }],
      serialized: '## Project context\n- specs/a.md',
    });
    const got = (await app.inject({ method: 'GET', url: `/skills/${skillId}/context?repo_id=${repo.id}` })).json();
    expect(got.attached).toHaveLength(1);

    const [after] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skillId));
    expect(after!.version).toBe(before!.version);
    expect(after!.evidenceFiles).toEqual(before!.evidenceFiles);
    const [{ n }] = await pg.handle.db
      .select({ n: count() })
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId));
    expect(n).toBe(1);
  });

  it('inherits enabled skills, dedupes, counts used-by distinct agents, and totals match the serialized block (AC-6/24/31/34-36)', async () => {
    const app = await makeApp();
    const repo = await makeRepo(FIXTURE);
    const agentA = await makeAgent(app);
    const agentB = await makeAgent(app);
    const skill = await makeSkill(app);

    await app.inject({ method: 'PUT', url: `/skills/${skill}/context`, payload: { repo_id: repo.id, paths: ['docs/x/b.md', 'specs/a.md'] } });
    await app.inject({ method: 'POST', url: `/agents/${agentB}/skills`, payload: { skill_ids: [skill] } });
    await app.inject({ method: 'PUT', url: `/agents/${agentA}/context`, payload: { repo_id: repo.id, paths: ['specs/a.md'] } });

    const a = (await app.inject({ method: 'GET', url: `/agents/${agentA}/context?repo_id=${repo.id}` })).json();
    expect(a.inherited).toEqual([]);

    const b = (await app.inject({ method: 'GET', url: `/agents/${agentB}/context?repo_id=${repo.id}` })).json();
    expect(b.attached).toEqual([]);
    expect(b.inherited.map((x: { path: string; skill_name: string }) => x.path)).toEqual(['docs/x/b.md', 'specs/a.md']);
    expect(b.inherited[0].skill_name).toMatch(/^Skill-/);
    expect(b.effective.map((x: { path: string }) => x.path)).toEqual(['docs/x/b.md', 'specs/a.md']);
    expect(b.total_tokens).toBe(
      estimateTokens(
        serializeBlock([specEntry('docs/x/b.md', FIXTURE['docs/x/b.md']), specEntry('specs/a.md', FIXTURE['specs/a.md'])]),
      ),
    );

    // Agent A also attaches b.md directly -> dedupe: first occurrence wins, flagged duplicate on inherited.
    await app.inject({ method: 'POST', url: `/agents/${agentA}/skills`, payload: { skill_ids: [skill] } });
    const a2 = (await app.inject({ method: 'GET', url: `/agents/${agentA}/context?repo_id=${repo.id}` })).json();
    expect(a2.effective.map((x: { path: string; source: unknown }) => [x.path, x.source])).toEqual([
      ['specs/a.md', 'agent'],
      ['docs/x/b.md', { skill_id: skill, skill_name: expect.stringMatching(/^Skill-/) }],
    ]);
    expect(a2.inherited.find((x: { path: string }) => x.path === 'specs/a.md').duplicate_of_attached).toBe(true);

    // Used by: specs/a.md is attached directly to A and (via skill) to B -> 2 agents; b.md only via skill -> 2 as well (A and B).
    const doc = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/doc?path=specs/a.md` })).json();
    expect(doc.used_by_agents).toHaveLength(2);
    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(list.docs.find((x: { path: string }) => x.path === 'specs/a.md').used_by_agents).toBe(2);

    // Disabled skill drops out of the effective set (AC-36).
    await app.inject({ method: 'PUT', url: `/skills/${skill}`, payload: { enabled: false } });
    const b2 = (await app.inject({ method: 'GET', url: `/agents/${agentB}/context?repo_id=${repo.id}` })).json();
    expect(b2.inherited).toEqual([]);
    expect(b2.effective).toEqual([]);
    expect(b2.total_tokens).toBe(0);
  });

  // ---------------------------------------------------------------- doc + save

  it('returns doc content + hash and rejects bad/missing/unreadable/too-large reads (AC-5, AC-67)', async () => {
    const app = await makeApp();
    await writeFile(join(cloneDir, 'acme-secrets.json'), '{"k":"v"}');
    const repo = await makeRepo({
      ...FIXTURE,
      'specs/bin.md': Buffer.from([0x61, 0x00]),
      'specs/big.md': 'x'.repeat(256 * 1024 + 1),
    });
    await symlink('../../../acme-secrets.json', join(repo.root, 'specs', 'link.md'));
    const get = (path: string) =>
      app.inject({ method: 'GET', url: `/repos/${repo.id}/context/doc?path=${encodeURIComponent(path)}` });

    const ok = await get('docs/x/b.md');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      path: 'docs/x/b.md',
      content: '## Goals\nbe fast\n',
      type: 'docs',
      tokens: estimateTokens('## Goals\nbe fast\n'),
    });
    expect(ok.json().content_hash).toMatch(/^[0-9a-f]{64}$/);

    const cases: [string, number, string][] = [
      ['../../etc/passwd.md', 400, 'invalid_context_path'],
      ['/abs.md', 400, 'invalid_context_path'],
      ['specs/missing.md', 404, 'doc_not_found'],
      ['specs/bin.md', 422, 'doc_unreadable'],
      ['specs/big.md', 413, 'doc_too_large'],
      ['specs/link.md', 400, 'invalid_context_path'],
    ];
    for (const [p, status, code] of cases) {
      const r = await get(p);
      expect([p, r.statusCode, r.json().error.code]).toEqual([p, status, code]);
    }
  });

  it('saves to disk without git, GitHub or LLM calls, and the new hash round-trips (AC-65, AC-66, NFR-6)', async () => {
    const app = await makeApp();
    const repo = await makeRepo(FIXTURE);
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo.root }).toString();
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'init');
    const headBefore = git('rev-parse', 'HEAD').trim();

    const doc = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/doc?path=docs/x/b.md` })).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/context/doc`,
      payload: { path: 'docs/x/b.md', content: '## Goals\nbe very fast\n', base_hash: doc.content_hash },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      path: 'docs/x/b.md',
      tokens: estimateTokens('## Goals\nbe very fast\n'),
      size_bytes: Buffer.byteLength('## Goals\nbe very fast\n'),
    });
    expect(await readFile(join(repo.root, 'docs/x/b.md'), 'utf8')).toBe('## Goals\nbe very fast\n');
    expect(git('rev-parse', 'HEAD').trim()).toBe(headBefore);
    expect(git('status', '--porcelain')).toContain('M docs/x/b.md');

    // The returned hash lets the next save through; the old one now conflicts.
    const again = await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/context/doc`,
      payload: { path: 'docs/x/b.md', content: 'v3', base_hash: res.json().content_hash },
    });
    expect(again.statusCode).toBe(200);
    const stale = await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/context/doc`,
      payload: { path: 'docs/x/b.md', content: 'v4', base_hash: doc.content_hash },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('doc_changed_on_disk');
    expect(await readFile(join(repo.root, 'docs/x/b.md'), 'utf8')).toBe('v3');
  });

  it('rejects unsafe/missing/oversized/NUL saves with no write (AC-67, AC-68, AC-73, AC-69)', async () => {
    const app = await makeApp();
    await writeFile(join(cloneDir, 'acme-secrets2.json'), 'SECRET');
    const repo = await makeRepo(FIXTURE);
    await symlink('../../../acme-secrets2.json', join(repo.root, 'specs', 'link.md'));
    const doc = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/doc?path=specs/a.md` })).json();
    const put = (path: string, content: string, base_hash = doc.content_hash) =>
      app.inject({ method: 'PUT', url: `/repos/${repo.id}/context/doc`, payload: { path, content, base_hash } });

    const cases: [string, string, number, string][] = [
      ['specs/a.txt', 'x', 400, 'invalid_context_path'],
      ['/specs/a.md', 'x', 400, 'invalid_context_path'],
      ['specs/../src/d.md', 'x', 400, 'invalid_context_path'],
      ['src/d.md', 'x', 400, 'invalid_context_path'],
      ['specs/link.md', 'pwned', 400, 'invalid_context_path'],
      ['specs/new.md', 'x', 404, 'doc_not_found'],
      ['specs/a.md', 'x'.repeat(256 * 1024 + 1), 413, 'doc_too_large'],
      ['specs/a.md', 'a\u0000b', 422, 'doc_unreadable'],
    ];
    for (const [p, c, status, code] of cases) {
      const r = await put(p, c);
      expect([p, r.statusCode, r.json().error.code]).toEqual([p, status, code]);
    }
    const changed = await put('specs/a.md', 'mine', 'deadbeef');
    expect(changed.statusCode).toBe(409);

    expect(await readFile(join(repo.root, 'specs/a.md'), 'utf8')).toBe('# A\n');
    expect(await readFile(join(cloneDir, 'acme-secrets2.json'), 'utf8')).toBe('SECRET');
    await expect(readFile(join(repo.root, 'specs/new.md'))).rejects.toThrow();
  });

  it('leaves the original intact and reports 500 doc_save_failed when the write fails (AC-70)', async () => {
    const app = await makeApp({ repoDocs: new FailingWriteStore(cloneDir) });
    const repo = await makeRepo(FIXTURE);
    const doc = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/doc?path=specs/a.md` })).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/context/doc`,
      payload: { path: 'specs/a.md', content: 'new', base_hash: doc.content_hash },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('doc_save_failed');
    expect(await readFile(join(repo.root, 'specs/a.md'), 'utf8')).toBe('# A\n');
  });
});
