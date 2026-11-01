import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Onboarding } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { SEED_ONBOARDING_TOUR } from '../src/db/seed-onboarding.js';
import * as t from '../src/db/schema.js';
import { JobRunner } from '../src/platform/jobs.js';
import { TimeoutError } from '../src/platform/resilience.js';
import { loadConfig } from '../src/platform/config.js';
import {
  README_TOKEN,
  RecordingGit,
  StubLLM,
  generateAndSettle,
  goodDraft,
  makeApp,
  makeIndexedRepo,
  pollSettled,
  type App,
} from './helpers/onboarding-fixture.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

d('onboarding module', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const apps: App[] = [];

  const newApp = async (...args: Parameters<typeof makeApp> extends [unknown, ...infer R] ? R : never) => {
    const app = await makeApp(pg, ...args);
    apps.push(app);
    return app;
  };
  const repo = (opts?: Parameters<typeof makeIndexedRepo>[2]) => makeIndexedRepo(pg.handle.db, workspaceId, opts);
  const getTour = async (app: App, repoId: string) =>
    (await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json();
  const post = (app: App, repoId: string) =>
    app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });

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

  it('GET with no tour returns tour null and makes zero LLM calls (AC-9)', async () => {
    const llm = new StubLLM();
    const app = await newApp({ llm });
    const r = await repo();
    const body = await getTour(app, r.id);
    expect(body).toMatchObject({
      repo_id: r.id,
      tour: null,
      generation: null,
      stale: false,
      availability: { can_generate: true, reason: null },
    });
    expect(llm.structuredCalls).toBe(0);
  });

  it('answers 404 for unknown and foreign-workspace repos on GET and POST (AC-5)', async () => {
    const app = await newApp();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${randomUUID()}` }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'x', name: 'y', fullName: `x/y-${randomUUID()}`, clonePath: '/tmp/x' })
      .returning();
    for (const id of [randomUUID(), foreign!.id]) {
      const g = await app.inject({ method: 'GET', url: `/repos/${id}/onboarding` });
      const p = await post(app, id);
      expect(g.statusCode).toBe(404);
      expect(g.json().error.code).toBe('repo_not_found');
      expect(p.statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: '/repos/not-a-uuid/onboarding' })).statusCode).toBe(422);
  });

  it('POST returns 202 generating before a slow LLM resolves, then completes with one call (AC-10, AC-12, NFR-5)', async () => {
    const llm = new StubLLM('gate');
    const app = await newApp({ llm });
    const r = await repo();
    const res = await post(app, r.id);
    expect(res.statusCode).toBe(202);
    expect(res.json().generation).toMatchObject({ status: 'generating', finished_at: null, error_reason: null });
    expect((await getTour(app, r.id)).generation.status).toBe('generating');

    llm.release();
    const done = await pollSettled(app, r.id);
    expect(done.generation.status).toBe('done');
    const tour = Onboarding.parse(done.tour);
    expect(new Date(tour.generated_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(tour).toMatchObject({ source_sha: 'a'.repeat(40), index_status: 'full', degraded: false, reasons: [] });
    expect(tour.model).toEqual({ provider: 'openrouter', model: expect.any(String) });
    expect(llm.structuredCalls).toBe(1);
    expect(tour.sections.map((s) => s.kind)).toEqual([
      'architecture',
      'critical_paths',
      'run_locally',
      'reading_path',
      'first_tasks',
    ]);
  });

  it('two concurrent POSTs share one generation and one LLM call (AC-13)', async () => {
    const llm = new StubLLM('gate');
    const app = await newApp({ llm });
    const r = await repo();
    const [a, b] = await Promise.all([post(app, r.id), post(app, r.id)]);
    expect([a.statusCode, b.statusCode]).toEqual([202, 202]);
    expect(a.json().generation.id).toBe(b.json().generation.id);
    llm.release();
    await pollSettled(app, r.id);
    expect(llm.structuredCalls).toBe(1);
  });

  it('a never-resolving LLM ends failed/timeout and the old tour stays (AC-14)', async () => {
    const r = await repo();
    const first = await newApp();
    const ok = await generateAndSettle(first, r.id);
    await first.close();
    apps.pop();

    const app = await newApp({ llm: new StubLLM('never'), timeoutMs: 300 });
    const settled = await generateAndSettle(app, r.id);
    expect(settled.generation).toMatchObject({ status: 'failed', error_reason: 'timeout' });
    expect(settled.tour.generated_at).toBe(ok.tour.generated_at);
  });

  it('a JobRunner-level timeout is recorded as failed/timeout, not internal (AC-14)', async () => {
    const r = await repo();
    const app = await newApp();
    vi.spyOn(JobRunner.prototype, 'enqueue').mockImplementation(async () => ({
      id: randomUUID(),
      done: Promise.reject(new TimeoutError(120_000)),
    }));
    const settled = await generateAndSettle(app, r.id);
    expect(settled.generation).toMatchObject({ status: 'failed', error_reason: 'timeout' });
  });

  it('clamps ONBOARDING_TIMEOUT_MS below the JobRunner hard timeout', () => {
    const cfg = loadConfig({ ...process.env, NODE_ENV: 'test', ONBOARDING_TIMEOUT_MS: '600000' } as NodeJS.ProcessEnv);
    expect(cfg.onboardingTimeoutMs).toBeLessThan(120_000);
  });

  it('a generating row left by a dead process becomes failed/interrupted on boot (AC-15)', async () => {
    const r = await repo();
    await pg.handle.db.insert(t.onboarding).values({
      repoId: r.id,
      generationId: randomUUID(),
      generationStatus: 'generating',
      generationStartedAt: new Date(Date.now() - 600_000),
    });
    const app = await newApp();
    const body = await getTour(app, r.id);
    expect(body.generation).toMatchObject({ status: 'failed', error_reason: 'interrupted' });
    expect(body.generation.finished_at).not.toBeNull();
  });

  it('GET expires an overdue generating row to failed/timeout', async () => {
    const r = await repo();
    const app = await newApp({ timeoutMs: 1000 });
    await pg.handle.db.insert(t.onboarding).values({
      repoId: r.id,
      generationId: randomUUID(),
      generationStatus: 'generating',
      generationStartedAt: new Date(Date.now() - 600_000),
    });
    expect((await getTour(app, r.id)).generation).toMatchObject({ status: 'failed', error_reason: 'timeout' });
  });

  it('a throwing LLM keeps the previous tour and records failed/llm_failed (AC-16, AC-48 branch 2)', async () => {
    const r = await repo();
    const first = await newApp();
    const ok = await generateAndSettle(first, r.id);
    await first.close();
    apps.pop();

    const app = await newApp({ llm: new StubLLM('throw') });
    const settled = await generateAndSettle(app, r.id);
    expect(settled.generation).toMatchObject({ status: 'failed', error_reason: 'llm_failed' });
    expect(settled.tour).toEqual(ok.tour);
  });

  it('a throwing LLM with no tour stores the deterministic tour (AC-48 branch 1, AC-49)', async () => {
    const r = await repo();
    const llm = new StubLLM('throw');
    const app = await newApp({ llm });
    const settled = await generateAndSettle(app, r.id);
    expect(settled.generation.status).toBe('done');
    const tour = Onboarding.parse(settled.tour);
    expect(tour).toMatchObject({ degraded: true, reasons: ['llm_failed'], model: null, dropped_refs: 0 });
    const [arch, critical, run, reading, tasks] = tour.sections;
    expect(arch.summary_md).toBeNull();
    expect(arch.diagram).toBeNull();
    expect(arch.top_dirs).toEqual([{ path: 'src', files: 4 }]);
    expect(critical.items.map((i) => i.path)).toEqual(['src/server.ts', 'src/auth.ts', 'src/db.ts', 'src/util.ts']);
    expect(critical.items.every((i) => i.why === null)).toBe(true);
    expect(critical.items.find((i) => i.path === 'src/db.ts')?.fan_in).toBe(3);
    expect(run.steps.map((s) => s.command)).toEqual(['pnpm run dev', 'pnpm run start']);
    expect(run.steps[0]).toMatchObject({ source_path: 'package.json' });
    expect(reading.steps.length).toBeGreaterThan(0);
    expect(tasks).toMatchObject({ tasks: [], empty_reason: 'needs_llm' });
    expect(llm.structuredCalls).toBe(1);
  });

  it('no OpenRouter key stores a degraded tour with llm_unavailable (AC-47)', async () => {
    const r = await repo();
    const app = await newApp({ llm: null });
    const settled = await generateAndSettle(app, r.id);
    expect(settled.generation.status).toBe('done');
    expect(settled.tour).toMatchObject({ degraded: true, reasons: ['llm_unavailable'], model: null });
  });

  it('drops ungrounded paths the model invents and counts them (AC-20)', async () => {
    const r = await repo();
    const draft = goodDraft({
      critical_paths: [
        { path: 'src/ghost.ts', why: 'invented' },
        { path: 'src/db.ts', why: 'real' },
      ],
      reading_path: [{ path: 'src/ghost.ts', why: 'invented' }],
    });
    const app = await newApp({ llm: new StubLLM('ok', draft) });
    const { tour } = await generateAndSettle(app, r.id);
    expect(tour.dropped_refs).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(tour)).not.toContain('ghost');
    expect(tour.sections[1].items.map((i: { path: string }) => i.path)).toEqual(['src/db.ts']);
  });

  it('fan_in comes from the import graph, never from the model (AC-30)', async () => {
    const r = await repo();
    const app = await newApp();
    const { tour } = await generateAndSettle(app, r.id);
    const byPath = Object.fromEntries(tour.sections[1].items.map((i: { path: string; fan_in: number }) => [i.path, i.fan_in]));
    expect(byPath['src/db.ts']).toBe(3);
    expect(byPath['src/auth.ts']).toBe(1);
  });

  it('marks the tour stale after the index moves, with no LLM call on GET (AC-42, AC-43)', async () => {
    const r = await repo();
    const llm = new StubLLM();
    const app = await newApp({ llm });
    const first = await generateAndSettle(app, r.id);
    expect(first.stale).toBe(false);
    const calls = llm.structuredCalls;
    await pg.handle.db
      .update(t.repoIndexState)
      .set({ lastIndexedSha: 'b'.repeat(40) })
      .where(eq(t.repoIndexState.repoId, r.id));
    const body = await getTour(app, r.id);
    expect(body).toMatchObject({ stale: true, current_index_sha: 'b'.repeat(40) });
    expect(body.tour.source_sha).toBe('a'.repeat(40));
    expect(llm.structuredCalls).toBe(calls);
  });

  it('refuses with 409 not_cloned when the repo has no clone (AC-44)', async () => {
    const r = await repo({ cloned: false });
    const llm = new StubLLM();
    const app = await newApp({ llm });
    const res = await post(app, r.id);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: { code: 'onboarding_unavailable', message: expect.any(String), reason: 'not_cloned' },
    });
    expect((await getTour(app, r.id)).availability).toEqual({ can_generate: false, reason: 'not_cloned' });
    expect(llm.structuredCalls).toBe(0);
  });

  it('refuses with 409 no_index when the repo is not indexed (AC-45)', async () => {
    const r = await repo({ indexStatus: null });
    const app = await newApp();
    const res = await post(app, r.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'onboarding_unavailable', reason: 'no_index' });
    expect((await getTour(app, r.id)).availability.reason).toBe('no_index');
  });

  it('a partial index yields a degraded tour with index_partial (AC-46)', async () => {
    const r = await repo({ indexStatus: 'partial' });
    const app = await newApp();
    const { tour } = await generateAndSettle(app, r.id);
    expect(tour).toMatchObject({ degraded: true, index_status: 'partial' });
    expect(tour.reasons).toContain('index_partial');
  });

  it('an empty import graph adds no_import_graph (EC-5)', async () => {
    const r = await repo({ edges: false });
    const app = await newApp();
    const { tour } = await generateAndSettle(app, r.id);
    expect(tour.reasons).toContain('no_import_graph');
    expect(tour.degraded).toBe(true);
  });

  it('a stored row in an older shape reads as no tour (NFR-11)', async () => {
    const r = await repo();
    await pg.handle.db.insert(t.onboarding).values({
      repoId: r.id,
      json: { sections: [{ kind: 'overview', title: 'Old', body: 'x', links: [] }] },
      generatedAt: new Date(),
    });
    const app = await newApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${r.id}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tour: null, stale: false });
  });

  it('logs GET timing and the generate fields without leaking file contents (NFR-2, NFR-8)', async () => {
    const r = await repo();
    const app = await newApp();
    const logged: unknown[][] = [];
    for (const level of ['info', 'warn', 'error'] as const) {
      vi.spyOn(app.log, level).mockImplementation(((...args: unknown[]) => {
        logged.push(args);
      }) as never);
    }
    await generateAndSettle(app, r.id);
    const events = logged.map((a) => a[0] as Record<string, unknown>).filter((o) => o && typeof o === 'object');
    const get = events.find((e) => e.event === 'onboarding.get');
    expect(get).toMatchObject({ repo_id: r.id, ms: expect.any(Number) });
    const gen = events.find((e) => e.event === 'onboarding.generate');
    expect(gen).toMatchObject({
      repo_id: r.id,
      generation_id: expect.any(String),
      source_sha: 'a'.repeat(40),
      files_indexed: 4,
      index_status: 'full',
      model: expect.stringContaining('openrouter/'),
      input_tokens_est: expect.any(Number),
      tokens_in: 1200,
      tokens_out: 300,
      dropped_refs: 0,
      outcome: 'done',
      ms: expect.any(Number),
    });
    expect(gen?.counts).toBeDefined();
    const text = JSON.stringify(logged);
    expect(text).not.toContain(README_TOKEN);
    expect(text).not.toContain('super-secret-value');
  });

  it('skips a README the confined reader refuses and still succeeds (NFR-9)', async () => {
    const r = await repo();
    const git = new RecordingGit(['README.md']);
    const app = await newApp({ git });
    const settled = await generateAndSettle(app, r.id);
    expect(settled.generation.status).toBe('done');
    expect(git.reads).toContain('README.md');
  });

  it('never reads .env and sends only env-template names to the model (NFR-9)', async () => {
    const r = await repo();
    const git = new RecordingGit();
    const llm = new StubLLM();
    const app = await newApp({ git, llm });
    await generateAndSettle(app, r.id);
    expect(git.reads).not.toContain('.env');
    expect(git.reads).toContain('.env.example');
    const prompt = llm.userMessage();
    expect(prompt).toContain('API_KEY=');
    expect(prompt).not.toContain('super-secret-value');
    expect(prompt).toContain('<untrusted');
  });

  it('cascades the row when the repo is deleted (EC-22)', async () => {
    const r = await repo();
    const app = await newApp();
    await generateAndSettle(app, r.id);
    expect(await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, r.id))).toHaveLength(1);
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, r.id));
    expect(await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, r.id))).toHaveLength(0);
  });

  it('seeds a contract-valid tour for the demo repo with Regenerate unavailable', async () => {
    expect(() => Onboarding.parse(SEED_ONBOARDING_TOUR)).not.toThrow();
    const app = await newApp();
    const [demo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    const body = await getTour(app, demo!.id);
    expect(body.tour).toEqual(SEED_ONBOARDING_TOUR);
    expect(body).toMatchObject({
      stale: false,
      current_index_sha: null,
      availability: { can_generate: false, reason: 'not_cloned' },
    });
    expect(body.tour.sections[1].items.map((i: { path: string }) => i.path)).toContain('src/middleware/auth.ts');
  });
});
