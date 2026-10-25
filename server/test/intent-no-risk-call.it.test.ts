import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { loadConfig } from '../src/platform/config.js';
import { buildApp } from '../src/app.js';
import { MockGitClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { defaultFeatureModel } from '../src/modules/settings/feature-models.js';
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[intent-no-risk-call] Docker not available — skipping integration tests.');
}

/** Records every structured call and answers the PrIntent schema. */
class IntentStub implements LLMProvider {
  readonly id = 'openrouter' as const;
  public requests: StructuredRequest<unknown>[] = [];
  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error('not used');
  }
  async embed(): Promise<number[][]> {
    return [];
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.requests.push(req as StructuredRequest<unknown>);
    const data = req.schema.parse({ intent: 'Add a thing', in_scope: ['the thing'], out_of_scope: [] });
    return { data, model: req.model, tokensIn: 10, tokensOut: 5, costUsd: 0, raw: '', attempts: 1 };
  }
}

d('intent: no risk call, no pr_brief access', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  let seq = 0;

  const newApp = async (llm: LLMProvider) => {
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: {}, trackedFiles: [], head: 'a'.repeat(40) }),
        secrets: new MockSecretsProvider({}),
        llm: { openrouter: llm },
      } as never,
    });
    apps.push(app);
    return app;
  };

  /** A repo + PR whose `pr_files` carry a patch, so the diff reconstructs without a clone. */
  const makePull = async () => {
    const name = `intent-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pull] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Add a thing',
        author: 'dev',
        branch: 'feat',
        base: 'main',
        headSha: 'b'.repeat(40),
        body: 'Adds a thing.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pull!.id,
      path: 'src/a.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -1,1 +1,2 @@\n a\n+b',
    });
    return pull!.id;
  };

  const briefRows = (prId: string) =>
    pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('cache-miss GET makes exactly one PrIntent call, returns risks [] and writes no pr_brief', async () => {
    const llm = new IntentStub();
    const app = await newApp(llm);
    const prId = await makePull();

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pr_id: prId, intent: 'Add a thing', risks: [] });
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0]!.schemaName).toBe('PrIntent');
    expect(llm.requests[0]!.model).toBe(defaultFeatureModel('review_intent').model);
    expect(await briefRows(prId)).toHaveLength(0);
  });

  it('a legacy pr_brief row is ignored: cached GET makes 0 calls, risks [], row untouched', async () => {
    const llm = new IntentStub();
    const app = await newApp(llm);
    const prId = await makePull();
    const legacy = { risks: [{ title: 'Auth', kind: 'security', severity: 'high', detail: 'x', files: [] }] };
    await pg.handle.db.insert(t.prIntent).values({ prId, intent: 'Cached', inScope: ['a'], outOfScope: [] });
    await pg.handle.db.insert(t.prBrief).values({ prId, json: legacy });

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ intent: 'Cached', risks: [] });
    expect(llm.requests).toHaveLength(0);
    const rows = await briefRows(prId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.json).toEqual(legacy);
  });

  it('POST recompute makes one call and writes no pr_brief', async () => {
    const llm = new IntentStub();
    const app = await newApp(llm);
    const prId = await makePull();

    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/intent/recompute` });
    expect(res.statusCode).toBe(200);
    expect(res.json().risks).toEqual([]);
    expect(llm.requests).toHaveLength(1);
    expect(await briefRows(prId)).toHaveLength(0);
  });
});
