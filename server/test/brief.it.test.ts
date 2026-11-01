import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { PrBrief } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import {
  DEFAULT_OUTPUT,
  MARKER_PATCH,
  MARKERS,
  StubBriefLLM,
  makeApp,
  makePr,
} from './helpers/brief-fixture.js';
import { seed } from '../src/db/seed.js';
import { SEED_PR_BRIEF } from '../src/db/seed-brief.js';
import * as t from '../src/db/schema.js';
import { MockRepoDocsStore, MockSecretsProvider } from '../src/adapters/mocks.js';
import { defaultFeatureModel } from '../src/modules/settings/feature-models.js';
import { inRanges, newSideRanges } from '../src/modules/brief/hunks.js';
import { BriefRepository } from '../src/modules/brief/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

type App = Awaited<ReturnType<typeof makeApp>>;

class RecordingDocs extends MockRepoDocsStore {
  public reads: string[] = [];
  override async read(...args: Parameters<MockRepoDocsStore['read']>) {
    this.reads.push(args[1]);
    return super.read(...args);
  }
}

d('brief module', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const apps: App[] = [];

  const newApp = async (opts: Parameters<typeof makeApp>[1] = {}) => {
    const app = await makeApp(pg, opts);
    apps.push(app);
    return app;
  };
  const pr = (o: Partial<Parameters<typeof makePr>[1]> = {}) => makePr(pg.handle.db, { workspaceId, ...o });
  const get = (app: App, id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
  const post = (app: App, id: string) => app.inject({ method: 'POST', url: `/pulls/${id}/brief/generate` });
  const storedRow = async (id: string) =>
    (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, id)))[0];
  const settled = async (app: App, id: string) => {
    for (let i = 0; i < 100; i++) {
      if (!(await get(app, id)).json().generating) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('generation never settled');
  };

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

  it('GET without a brief answers null with 0 LLM calls; a legacy row reads as null (AC-2, AC-3)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const { pr: p } = await pr();
    const res = await get(app, p.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pr_id: p.id, brief: null, generating: false, stale: false, current_head_sha: p.headSha });

    await pg.handle.db.insert(t.prBrief).values({ prId: p.id, json: { risks: [] } });
    const legacy = await get(app, p.id);
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json().brief).toBeNull();
    expect(llm.calls).toBe(0);
  });

  it('POST generates, stores and replays identically; regenerate replaces (AC-5, AC-10, AC-12, AC-59)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const { pr: p } = await pr();

    const res = await post(app, p.id);
    expect(res.statusCode).toBe(200);
    const first = res.json();
    expect(first.brief.meta.head_sha).toBe(p.headSha);
    expect(first.brief.meta.model).toEqual({
      provider: defaultFeatureModel('risk_brief').provider,
      model: defaultFeatureModel('risk_brief').model,
    });
    expect(llm.calls).toBe(1);
    expect(llm.requests[0]!.model).toBe(defaultFeatureModel('risk_brief').model);

    const a = (await get(app, p.id)).json();
    const b = (await get(app, p.id)).json();
    expect(a).toEqual(b);
    expect(a.brief).toEqual(first.brief);
    expect(llm.calls).toBe(1);

    llm.output = { ...DEFAULT_OUTPUT, summary: 'A different summary.' };
    await new Promise((r) => setTimeout(r, 5));
    const again = (await post(app, p.id)).json();
    expect(llm.calls).toBe(2);
    expect(again.brief.summary).toBe('A different summary.');
    expect(again.brief.meta.generated_at > first.brief.meta.generated_at).toBe(true);
  });

  it('concurrent POSTs share one call; GET during it reports generating (AC-8, AC-9)', async () => {
    const llm = new StubBriefLLM({ mode: 'gate' });
    const app = await newApp({ llm });
    const { pr: p } = await pr();

    const one = post(app, p.id);
    await vi.waitFor(() => expect(llm.calls).toBe(1));
    const two = post(app, p.id);
    expect((await get(app, p.id)).json().generating).toBe(true);
    llm.release();
    const [r1, r2] = await Promise.all([one, two]);
    expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
    expect(llm.calls).toBe(1);
    expect(r1.json().brief.meta.generated_at).toBe(r2.json().brief.meta.generated_at);
  });

  it('a timeout keeps the old brief, joins instead of a 2nd call, and never saves late (AC-14, EC-17)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm, timeoutMs: 200 });
    const { pr: p } = await pr();
    const existing = (await post(app, p.id)).json().brief;
    expect(llm.calls).toBe(1);

    llm.mode = 'gate';
    llm.output = { ...DEFAULT_OUTPUT, summary: 'LATE ANSWER' };
    const t1 = await post(app, p.id);
    expect(t1.statusCode).toBe(502);
    expect(t1.json().error).toMatchObject({ code: 'brief_generation_failed', details: { reason: 'timeout' } });
    expect(llm.calls).toBe(2);

    const mid = (await get(app, p.id)).json();
    expect(mid.generating).toBe(true);
    expect(mid.brief).toEqual(existing);

    const t2 = await post(app, p.id);
    expect(t2.statusCode).toBe(502);
    expect(t2.json().error.details.reason).toBe('timeout');
    expect(llm.calls).toBe(2);

    llm.release();
    await settled(app, p.id);
    expect((await get(app, p.id)).json().brief).toEqual(existing);

    llm.mode = 'ok';
    llm.output = { ...DEFAULT_OUTPUT, summary: 'Fresh.' };
    const t3 = await post(app, p.id);
    expect(t3.statusCode).toBe(200);
    expect(t3.json().brief.summary).toBe('Fresh.');
    expect(llm.calls).toBe(3);
  });

  it('never commits a write that straddles the deadline, and passes the remaining deadline to the LLM (AC-14, P-4, P-5)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm, timeoutMs: 400 });
    const { pr: p } = await pr();
    const existing = (await post(app, p.id)).json().brief;
    expect(llm.requests[0]!.timeoutMs).toBeGreaterThan(0);
    expect(llm.requests[0]!.timeoutMs).toBeLessThanOrEqual(400);

    const orig = BriefRepository.prototype.upsertBriefUnless;
    vi.spyOn(BriefRepository.prototype, 'upsertBriefUnless').mockImplementation(function (this: BriefRepository, id, brief, canCommit) {
      // The row is written inside the tx; the deadline passes before the commit decision.
      return orig.call(this, id, { ...brief, summary: 'LATE WRITE' }, () => {
        const end = Date.now() + 500;
        while (Date.now() < end);
        return canCommit();
      });
    });
    llm.output = { ...DEFAULT_OUTPUT, summary: 'LATE ANSWER' };
    const res = await post(app, p.id);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.details.reason).toBe('timeout');
    await settled(app, p.id);
    expect((await get(app, p.id)).json().brief).toEqual(existing);
  });

  it('maps DB/internal failures to 500 and logs the original without PR text (P-3, NFR-8)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const { pr: p } = await pr();
    const logged: Record<string, unknown>[] = [];
    vi.spyOn(app.log, 'error').mockImplementation(((o: Record<string, unknown>) => {
      logged.push(o);
    }) as never);
    vi.spyOn(BriefRepository.prototype, 'upsertBriefUnless').mockRejectedValue(
      Object.assign(new Error('Failed query: insert ... params: SECRET_PR_TEXT'), { code: '57P01' }),
    );
    const res = await post(app, p.id);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('internal_error');
    expect(logged[0]).toMatchObject({ event: 'brief.generate.error', pr_id: p.id, stage: 'internal', error_code: '57P01' });
    expect(JSON.stringify(logged)).not.toContain('SECRET_PR_TEXT');
  });

  it('maps failures and keeps the stored brief (AC-15)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const { pr: p } = await pr();
    await post(app, p.id);
    const before = (await storedRow(p.id))!.json;

    llm.mode = 'throw';
    const failed = await post(app, p.id);
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error.details.reason).toBe('llm_failed');

    llm.mode = 'invalid';
    const invalid = await post(app, p.id);
    expect(invalid.statusCode).toBe(502);
    expect(invalid.json().error.details.reason).toBe('invalid_output');
    expect((await storedRow(p.id))!.json).toEqual(before);
  });

  it('409 llm_not_configured and pr_not_synced, with no LLM call (AC-16, AC-17)', async () => {
    const noKey = await newApp({ secrets: new MockSecretsProvider({}) });
    const { pr: p } = await pr();
    const res = await post(noKey, p.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'brief_unavailable', details: { reason: 'llm_not_configured' } });

    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const { pr: empty } = await pr({ files: [] });
    const ns = await post(app, empty.id);
    expect(ns.statusCode).toBe(409);
    expect(ns.json().error.details.reason).toBe('pr_not_synced');
    expect(llm.calls).toBe(0);
  });

  it('scopes to the workspace: a foreign PR is 404 on GET and POST (AC-18)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${Date.now()}` }).returning();
    const { pr: foreign } = await makePr(pg.handle.db, { workspaceId: ws2!.id });
    expect((await get(app, foreign.id)).statusCode).toBe(404);
    expect((await post(app, foreign.id)).statusCode).toBe(404);
    expect(llm.calls).toBe(0);
  });

  it('uses the risk_brief override model (AC-19)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const { pr: p } = await pr();
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' } } },
    });
    expect(put.statusCode).toBe(200);
    try {
      const res = await post(app, p.id);
      expect(llm.requests[0]!.model).toBe('z-ai/glm-4.7-flash');
      expect(res.json().brief.meta.model.model).toBe('z-ai/glm-4.7-flash');
    } finally {
      await pg.handle.db
        .delete(t.settings)
        .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    }
  });

  it('sends labelled blocks and never any patch text (AC-20, AC-21)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const { pr: p } = await pr();
    await post(app, p.id);
    const msgs = llm.messages;
    expect(msgs).toContain('diff-stats');
    expect(msgs).toContain('pr-title');
    for (const m of Object.values(MARKERS)) expect(msgs).not.toContain(m);

    const msgLines = new Set(msgs.split('\n'));
    const patchLines = MARKER_PATCH.split('\n')
      .filter((l) => !l.startsWith('@@'))
      .map((l) => l.slice(1))
      .filter((l) => l.trim().length > 0);
    for (const l of patchLines) expect(msgLines.has(l)).toBe(false);
  });

  it('truncates oversized specs under the 8000-token budget (AC-23)', async () => {
    const llm = new StubBriefLLM();
    const files: Record<string, string> = {};
    for (let i = 0; i < 6; i++) files[`docs/s${i}.md`] = 'spec text line. '.repeat(1400);
    const app = await newApp({ llm, repoDocs: new MockRepoDocsStore(files) });
    const { pr: p, repo } = await pr();
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: `Brief-A-${Date.now()}`, provider: 'openai', model: 'm', systemPrompt: 'x' } as never)
      .returning();
    await pg.handle.db
      .insert(t.agentContextDocs)
      .values(Object.keys(files).map((path, position) => ({ agentId: agent!.id, repoId: repo.id, path, position })));
    try {
      const res = await post(app, p.id);
      expect(res.statusCode).toBe(200);
      const meta = res.json().brief.meta;
      expect(meta.input_truncated).toContain('specs');
      expect(meta.input_tokens_est).toBeLessThanOrEqual(8000);
    } finally {
      await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, agent!.id));
    }
  });

  it('degrades with every input missing: one call, saved, no pr_intent row (AC-24, AC-26)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const { pr: p } = await pr({ body: '   ' });
    const res = await post(app, p.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().brief.meta.missing_inputs).toEqual(['intent', 'blast', 'specs', 'description']);
    expect(llm.calls).toBe(1);
    expect(await storedRow(p.id)).toBeDefined();
    expect(await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, p.id))).toHaveLength(0);
  });

  it('drops refs to files outside the diff (AC-57)', async () => {
    const llm = new StubBriefLLM({
      output: {
        ...DEFAULT_OUTPUT,
        risks: [
          ...DEFAULT_OUTPUT.risks,
          { kind: 'x', title: 'Ghost', explanation: 'e', severity: 'low', file_refs: ['src/ghost.ts:3'] },
        ],
      },
    });
    const app = await newApp({ llm });
    const { pr: p } = await pr();
    const brief = (await post(app, p.id)).json().brief;
    expect(brief.meta.dropped_refs).toBeGreaterThanOrEqual(1);
    expect(brief.risks.risks.map((r: { title: string }) => r.title)).not.toContain('Ghost');
  });

  it('flags a stale brief after the head moves, with 0 calls (AC-60, AC-61)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const { pr: p } = await pr();
    await post(app, p.id);
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'c'.repeat(40) }).where(eq(t.pullRequests.id, p.id));
    const r1 = (await get(app, p.id)).json();
    const r2 = (await get(app, p.id)).json();
    expect(r1).toMatchObject({ stale: true, current_head_sha: 'c'.repeat(40) });
    expect(r2.stale).toBe(true);
    expect(llm.calls).toBe(1);
  });

  it('logs one brief.generate line with llm_calls 1 and no PR text (NFR-4, NFR-8)', async () => {
    const llm = new StubBriefLLM();
    const app = await newApp({ llm });
    const { pr: p } = await pr();
    const logged: unknown[][] = [];
    for (const level of ['info', 'warn', 'error'] as const) {
      vi.spyOn(app.log, level).mockImplementation(((...args: unknown[]) => {
        logged.push(args);
      }) as never);
    }
    await post(app, p.id);
    const gen = logged.map((a) => a[0] as Record<string, unknown>).filter((o) => o?.event === 'brief.generate');
    expect(gen).toHaveLength(1);
    expect(gen[0]).toMatchObject({
      pr_id: p.id,
      llm_calls: 1,
      outcome: 'ok',
      joined_inflight: false,
      schema_mode: 'schema-caps',
      input_tokens_est: expect.any(Number),
      tokens_in: 100,
      ms: expect.any(Number),
    });
    const text = JSON.stringify(logged);
    expect(text).not.toContain('FIXTURE_DESCRIPTION_TEXT');
    expect(text).not.toContain(DEFAULT_OUTPUT.summary);
  });

  it('unions enabled agents docs in creation order and skips unsafe paths unread (Q2, NFR-9)', async () => {
    const llm = new StubBriefLLM();
    const docs = new RecordingDocs({
      'docs/one.md': '# one',
      'docs/two.md': '# two',
      'docs/three.md': '# three',
      'docs/off.md': '# off',
      '.env': 'SECRET=1',
    });
    const app = await newApp({ llm, repoDocs: docs });
    const { pr: p, repo } = await pr();
    const mk = async (name: string) =>
      (
        await pg.handle.db
          .insert(t.agents)
          .values({ workspaceId, name: `${name}-${Date.now()}`, provider: 'openai', model: 'm', systemPrompt: 'x' } as never)
          .returning()
      )[0]!;
    const a1 = await mk('Q2a');
    const a2 = await mk('Q2b');
    const off = await mk('Q2off');
    await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, off.id));
    const attach = (agentId: string, paths: string[]) =>
      pg.handle.db
        .insert(t.agentContextDocs)
        .values(paths.map((path, position) => ({ agentId, repoId: repo.id, path, position })));
    await attach(a1.id, ['docs/one.md', '.env', 'docs/two.md']);
    await attach(a2.id, ['docs/two.md', 'docs/three.md']);
    await attach(off.id, ['docs/off.md']);
    try {
      const meta = (await post(app, p.id)).json().brief.meta;
      expect(meta.specs_used).toEqual(['docs/one.md', 'docs/two.md', 'docs/three.md']);
      expect(meta.specs_skipped).toEqual([{ path: '.env', reason: 'rejected path' }]);
      expect(docs.reads).not.toContain('.env');
      expect(docs.reads).not.toContain('docs/off.md');
      expect(meta.missing_inputs).not.toContain('specs');
    } finally {
      await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, a1.id));
      await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, a2.id));
    }
  });

  it('seeds a valid, non-stale brief for PR #482 whose focus line sits in a patched hunk (NFR-11)', async () => {
    expect(PrBrief.safeParse(SEED_PR_BRIEF).success).toBe(true);
    await seed(pg.handle.db); // idempotent re-run
    const [repo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    const [seeded] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));
    const app = await newApp();
    const res = (await get(app, seeded!.id)).json();
    expect(res.brief).not.toBeNull();
    expect(res.stale).toBe(false);

    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, seeded!.id));
    for (const f of res.brief.review_focus as { file: string; line: number }[]) {
      const row = files.find((x) => x.path === f.file)!;
      expect(row.patch).not.toBeNull();
      expect(inRanges(f.line, newSideRanges(row.patch))).toBe(true);
    }
    const cfg = files.find((x) => x.path === 'src/config.ts')!;
    const lines = cfg.patch!.split('\n').filter((l) => !l.startsWith('@@'));
    expect(lines.filter((l) => l.startsWith('+')).length).toBe(cfg.additions);
    expect(lines.filter((l) => l.startsWith('-')).length).toBe(cfg.deletions);
    expect(files.filter((x) => x.patch !== null).map((x) => x.path)).toEqual(['src/config.ts']);
  });

  it('re-seeding replaces a legacy pr_brief row but never a real brief', async () => {
    const [repo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    const [seeded] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));
    const prId = seeded!.id;
    const read = async () =>
      (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId)))[0]!.json;

    await pg.handle.db.update(t.prBrief).set({ json: { risks: ['legacy'] } }).where(eq(t.prBrief.prId, prId));
    await seed(pg.handle.db);
    expect(PrBrief.safeParse(await read()).success).toBe(true);

    const real = { ...SEED_PR_BRIEF, summary: 'user-generated' };
    await pg.handle.db.update(t.prBrief).set({ json: real }).where(eq(t.prBrief.prId, prId));
    await seed(pg.handle.db);
    expect(await read()).toEqual(real);
  });
});
