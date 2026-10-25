import * as t from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/platform/config.js';
import { MockGitClient, MockRepoDocsStore, MockSecretsProvider } from '../../src/adapters/mocks.js';
import type { PgFixture } from './pg.js';
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';

type Db = PgFixture['handle']['db'];

export type StubMode = 'ok' | 'throw' | 'invalid' | 'never' | 'gate';

export interface StubOutput {
  summary: string;
  risks: { kind: string; title: string; explanation: string; severity: 'high' | 'medium' | 'low'; file_refs: string[] }[];
  review_focus: { file: string; line: number; reason: string }[];
}

export const DEFAULT_OUTPUT: StubOutput = {
  summary: 'Adds a config value.',
  risks: [{ kind: 'security', title: 'Key in config', explanation: 'Check it.', severity: 'high', file_refs: ['src/a.ts:2'] }],
  review_focus: [{ file: 'src/a.ts', line: 2, reason: 'Start here.' }],
};

/** Records every structured call; answers per `mode`. `gate` blocks until `release()`. */
export class StubBriefLLM implements LLMProvider {
  readonly id = 'openrouter' as const;
  public requests: StructuredRequest<unknown>[] = [];
  public mode: StubMode = 'ok';
  public output: StubOutput = DEFAULT_OUTPUT;
  private gate!: () => void;
  private gated = new Promise<void>((r) => (this.gate = r));

  constructor(opts: { mode?: StubMode; output?: StubOutput } = {}) {
    if (opts.mode) this.mode = opts.mode;
    if (opts.output) this.output = opts.output;
  }

  release(): void {
    this.gate();
  }
  get calls(): number {
    return this.requests.length;
  }
  /** Every message of every call, joined. */
  get messages(): string {
    return this.requests.flatMap((r) => r.messages.map((m) => m.content)).join('\n');
  }

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
    const mode = this.mode;
    if (mode === 'throw') throw new Error('provider exploded');
    if (mode === 'never') await new Promise<never>(() => undefined);
    if (mode === 'gate') await this.gated;
    // `invalid` returns an over-long summary the schema-caps schema rejects (defensive re-parse).
    const data = (mode === 'invalid' ? { ...this.output, summary: 'x'.repeat(700) } : this.output) as unknown as T;
    return { data, model: req.model, tokensIn: 100, tokensOut: 20, costUsd: 0.001, raw: '', attempts: 1 };
  }
}

export interface MakeAppOpts {
  llm?: LLMProvider;
  timeoutMs?: number;
  secrets?: MockSecretsProvider;
  repoDocs?: MockRepoDocsStore;
}

export function makeApp(pg: PgFixture, opts: MakeAppOpts = {}) {
  return buildApp({
    config: loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      ...(opts.timeoutMs ? { BRIEF_TIMEOUT_MS: String(opts.timeoutMs) } : {}),
    } as NodeJS.ProcessEnv),
    db: pg.handle.db,
    overrides: {
      git: new MockGitClient({ files: {}, trackedFiles: [], head: 'a'.repeat(40) }),
      secrets: opts.secrets ?? new MockSecretsProvider({}),
      ...(opts.llm ? { llm: { openrouter: opts.llm } } : {}),
      ...(opts.repoDocs ? { repoDocs: opts.repoDocs } : {}),
    } as never,
  });
}

export const MARKERS = { add: 'BRIEF_ADD_MARKER_42', del: 'BRIEF_DEL_MARKER_42', ctx: 'BRIEF_CTX_MARKER_42' } as const;

/** One hunk (new side 1-4) carrying the three markers on a context, an added and a removed line. */
export const MARKER_PATCH = [
  '@@ -1,3 +1,4 @@',
  ` const ctx = "${MARKERS.ctx}";`,
  `+const added = "${MARKERS.add}";`,
  ' const second = 2;',
  `-const removed = "${MARKERS.del}";`,
  ' const last = 4;',
].join('\n');

let seq = 0;

export interface MakePrOpts {
  workspaceId: string;
  files?: { path: string; additions?: number; deletions?: number; patch: string | null }[];
  body?: string | null;
  headSha?: string;
}

/** A repo + PR (+ `pr_files`). Default: `src/a.ts` with a 4-line new-side hunk. */
export async function makePr(db: Db, opts: MakePrOpts) {
  const name = `brief-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId: opts.workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: `/tmp/brief/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId: opts.workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Add a config value',
      author: 'dev',
      branch: 'feat',
      base: 'main',
      headSha: opts.headSha ?? 'b'.repeat(40),
      body: opts.body === undefined ? 'FIXTURE_DESCRIPTION_TEXT explains the change.' : opts.body,
    })
    .returning();
  const files = opts.files ?? [{ path: 'src/a.ts', additions: 2, deletions: 1, patch: MARKER_PATCH }];
  for (const f of files) {
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: f.path,
      additions: f.additions ?? 1,
      deletions: f.deletions ?? 0,
      patch: f.patch,
    });
  }
  return { repo: repo!, pr: pr! };
}
