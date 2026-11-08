import { loadConfig } from '../../src/platform/config.js';
import { buildApp } from '../../src/app.js';
import * as t from '../../src/db/schema.js';
import { MockSecretsProvider } from '../../src/adapters/mocks.js';
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import type { PgFixture } from './pg.js';

type Db = PgFixture['handle']['db'];
export type App = Awaited<ReturnType<typeof buildApp>>;

/** Review-prompt section markers that must NOT appear in an eval prompt (AC-36). */
export const FORBIDDEN_MARKERS = [
  '## Repo skeleton',
  '## Callers of changed symbols',
  '## Project context',
  '## Intent',
  '## Relevant memory',
];

export const FIXTURE_DIFF_MARKER = 'FIXTURE_DIFF_MARKER_7c1e';

export interface StubFinding {
  file: string;
  start_line: number;
  end_line?: number;
  title?: string;
}

type Behavior = 'ok' | 'throw' | 'invalid' | 'never' | 'gate';

/**
 * Inline eval LLM stub. `behaviors[i]` governs the i-th call (default `ok`); `findings` are
 * returned for every successful call. Tracks calls, captured messages and peak concurrency.
 */
export class EvalStubLLM implements LLMProvider {
  readonly id = 'openrouter' as const;
  requests: StructuredRequest<unknown>[] = [];
  inflight = 0;
  peak = 0;
  private gate: Promise<void>;
  release!: () => void;

  constructor(
    public findings: StubFinding[] = [],
    public behaviors: Behavior[] = [],
    private delayMs = 0,
    private defaultBehavior: Behavior = 'ok',
  ) {
    this.gate = new Promise<void>((r) => (this.release = r));
  }

  get calls(): number {
    return this.requests.length;
  }
  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(_r: CompletionRequest): Promise<CompletionResult> {
    throw new Error('not used');
  }
  async embed(): Promise<number[][]> {
    return [];
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const idx = this.requests.length;
    this.requests.push(req as StructuredRequest<unknown>);
    const mode = this.behaviors[idx] ?? this.defaultBehavior;
    this.inflight++;
    this.peak = Math.max(this.peak, this.inflight);
    try {
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      if (mode === 'throw') throw new Error('provider exploded');
      if (mode === 'invalid') throw new Error('OpenRouter structured output failed schema validation for Review');
      if (mode === 'never') return await new Promise<never>(() => undefined);
      if (mode === 'gate') await this.gate;
      const data = req.schema.parse({
        verdict: 'comment',
        summary: 's',
        score: 80,
        findings: this.findings.map((f, i) => ({
          id: `f${i}`,
          severity: 'WARNING',
          category: 'bug',
          title: f.title ?? 'stub finding',
          file: f.file,
          start_line: f.start_line,
          end_line: f.end_line ?? f.start_line,
          rationale: 'r',
          confidence: 0.9,
        })),
      });
      return { data, model: req.model, tokensIn: 10, tokensOut: 5, costUsd: 0.001, raw: '', attempts: 1 };
    } finally {
      this.inflight--;
    }
  }
  messages(i = 0): ChatMessage[] {
    return (this.requests[i]?.messages as ChatMessage[] | undefined) ?? [];
  }
  allText(i = 0): string {
    return this.messages(i)
      .map((m) => m.content)
      .join('\n');
  }
}

export interface AppOpts {
  llm?: LLMProvider | null;
}

export function makeApp(pg: PgFixture, opts: AppOpts = {}): Promise<App> {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
  return buildApp({
    config,
    db: pg.handle.db,
    overrides: {
      secrets: new MockSecretsProvider({}),
      ...(opts.llm === null ? {} : { llm: { openrouter: opts.llm } }),
    } as never,
  });
}

export const FILE_A = 'src/a.ts';
export const FILE_B = 'src/b.ts';
export const FILE_C = 'src/c.ts';

function patch(marker: string): string {
  return [
    '@@ -1,3 +1,5 @@',
    ' const a = 1;',
    `+const secret = "${marker}";`,
    '+const b = 2;',
    ' const c = 3;',
    ' const d = 4;',
    '',
  ].join('\n');
}

export interface Fixture {
  repoId: string;
  prId: string;
  reviewId: string;
  agentId: string;
  accepted: string;
  dismissed: string;
  undecided: string;
  noPatchFinding: string;
  foreignFinding: string;
}

let seq = 0;

/** A PR with 3 `pr_files` (+1 without a patch), a review with `agent_id`, decided findings. */
export async function seedFixture(db: Db, workspaceId: string, agentId: string): Promise<Fixture> {
  const name = `evalfx-${Date.now()}-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Add secrets',
      author: 'dev',
      branch: 'feat',
      base: 'main',
      headSha: 'b'.repeat(40),
      body: 'PR body',
    })
    .returning();
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: FILE_A, additions: 2, deletions: 0, patch: patch(FIXTURE_DIFF_MARKER) },
    { prId: pr!.id, path: FILE_B, additions: 2, deletions: 0, patch: patch('b-marker') },
    { prId: pr!.id, path: FILE_C, additions: 2, deletions: 0, patch: patch('c-marker') },
    { prId: pr!.id, path: 'src/binary.png', additions: 0, deletions: 0, patch: null },
  ]);
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId: pr!.id, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 80, model: 'm' })
    .returning();
  const mk = (file: string, title: string, extra: Partial<typeof t.findings.$inferInsert> = {}) => ({
    reviewId: review!.id,
    file,
    startLine: 2,
    endLine: 2,
    severity: 'WARNING',
    category: 'bug',
    title,
    rationale: 'r',
    confidence: 0.9,
    ...extra,
  });
  const rows = await db
    .insert(t.findings)
    .values([
      mk(FILE_A, 'Hardcoded Stripe secret key in commit', { acceptedAt: new Date() }),
      mk(FILE_B, 'Looks suspicious but is fine', { dismissedAt: new Date() }),
      mk(FILE_C, 'Undecided finding'),
      mk('src/binary.png', 'Finding in a file without a patch', { acceptedAt: new Date() }),
    ])
    .returning();

  // Foreign workspace PR + finding (AC-13).
  const [ws2] = await db.insert(t.workspaces).values({ name: `foreign-${name}` } as never).returning();
  const [repo2] = await db
    .insert(t.repos)
    .values({ workspaceId: ws2!.id, owner: 'acme', name: `${name}-x`, fullName: `acme/${name}-x` })
    .returning();
  const [pr2] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId: ws2!.id,
      repoId: repo2!.id,
      number: 2,
      title: 'x',
      author: 'dev',
      branch: 'f',
      base: 'main',
      headSha: 'c'.repeat(40),
    })
    .returning();
  const [review2] = await db
    .insert(t.reviews)
    .values({ workspaceId: ws2!.id, prId: pr2!.id, agentId: null, kind: 'review' })
    .returning();
  const [foreign] = await db
    .insert(t.findings)
    .values(mk(FILE_A, 'Foreign', { reviewId: review2!.id, acceptedAt: new Date() }))
    .returning();

  return {
    repoId: repo!.id,
    prId: pr!.id,
    reviewId: review!.id,
    agentId,
    accepted: rows[0]!.id,
    dismissed: rows[1]!.id,
    undecided: rows[2]!.id,
    noPatchFinding: rows[3]!.id,
    foreignFinding: foreign!.id,
  };
}

/** A valid diff body for hand-made cases. */
export const VALID_DIFF = `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n${patch('manual')}`;

export async function waitRun(app: App, runId: string, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
    const body = res.json();
    if (body.eval_run.status !== 'running') return body;
    if (Date.now() > end) throw new Error(`run still running after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
