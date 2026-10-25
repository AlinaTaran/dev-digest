import { loadConfig } from '../../src/platform/config.js';
import { buildApp } from '../../src/app.js';
import * as t from '../../src/db/schema.js';
import { MockGitClient, MockSecretsProvider } from '../../src/adapters/mocks.js';
import type { OnboardingDraft } from '../../src/modules/onboarding/draft-schema.js';
import type {
  ChatMessage,
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  RepoRef,
} from '@devdigest/shared';
import type { PgFixture } from './pg.js';

type Db = PgFixture['handle']['db'];
export type App = Awaited<ReturnType<typeof buildApp>>;

export const SHA = 'a'.repeat(40);
export const README_TOKEN = 'UNIQUE-README-TOKEN-8f3a';

/** Indexed files of the fixture repo. */
export const INDEXED = ['src/server.ts', 'src/auth.ts', 'src/db.ts', 'src/util.ts'];
/** Import edges: db.ts has fan-in 3, auth.ts has fan-in 1. */
export const EDGES: [string, string][] = [
  ['src/server.ts', 'src/auth.ts'],
  ['src/server.ts', 'src/db.ts'],
  ['src/auth.ts', 'src/db.ts'],
  ['src/util.ts', 'src/db.ts'],
];

export const FILES: Record<string, string> = {
  'README.md': `# Demo\n${README_TOKEN}\nRun pnpm run dev.\n`,
  'package.json': JSON.stringify({ scripts: { dev: 'tsx watch src/server.ts', start: 'node dist/server.js' } }),
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  '.env.example': 'API_KEY=super-secret-value\nPORT=3000\n',
};
export const TRACKED = [
  ...INDEXED,
  'README.md',
  'package.json',
  'pnpm-lock.yaml',
  '.env',
  '.env.example',
  'docker-compose.yml',
];

/** MockGitClient that records every `readFile` path and can throw for chosen ones. */
export class RecordingGit extends MockGitClient {
  public reads: string[] = [];
  constructor(private throwFor: string[] = [], files: Record<string, string> = FILES, tracked = TRACKED) {
    super({ files, trackedFiles: tracked, head: SHA });
  }
  override async readFile(repo: RepoRef, path: string): Promise<string> {
    this.reads.push(path);
    if (this.throwFor.includes(path)) throw new Error(`path escapes clone: ${path}`);
    return super.readFile(repo, path);
  }
}

type Mode = 'ok' | 'throw' | 'never' | 'gate';

/** Inline LLM stub: valid draft, throws, never resolves, or waits on `release()`. */
export class StubLLM implements LLMProvider {
  readonly id = 'openrouter' as const;
  public requests: StructuredRequest<unknown>[] = [];
  private gate: Promise<void>;
  public release!: () => void;

  constructor(
    private mode: Mode = 'ok',
    private draft: OnboardingDraft = goodDraft(),
  ) {
    this.gate = new Promise<void>((r) => (this.release = r));
  }

  get structuredCalls(): number {
    return this.requests.length;
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
    if (this.mode === 'throw') throw new Error('provider exploded');
    if (this.mode === 'never') return new Promise<never>(() => undefined);
    if (this.mode === 'gate') await this.gate;
    const data = req.schema.parse(this.draft);
    return { data, model: req.model, tokensIn: 1200, tokensOut: 300, costUsd: 0.002, raw: '', attempts: 1 };
  }
  userMessage(): string {
    const msgs = this.requests[0]?.messages as ChatMessage[] | undefined;
    return msgs?.find((m) => m.role === 'user')?.content ?? '';
  }
}

export function goodDraft(over: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    architecture: {
      summary_md: 'Requests enter `src/server.ts`, pass `src/auth.ts` and persist via `src/db.ts`.',
      diagram: {
        nodes: [
          { id: 'srv', label: 'Server', kind: 'entrypoint', path: 'src/server.ts' },
          { id: 'auth', label: 'Auth', kind: 'middleware', path: 'src/auth.ts' },
          { id: 'db', label: 'DB', kind: 'datastore', path: 'src/db.ts' },
        ],
        edges: [
          { from: 'srv', to: 'auth', label: null },
          { from: 'auth', to: 'db', label: 'SQL' },
        ],
      },
    },
    critical_paths: [
      { path: 'src/db.ts', why: 'Database access' },
      { path: 'src/auth.ts', why: 'Authentication' },
    ],
    run_locally: [{ command: 'pnpm run dev', source_path: 'package.json', note: 'Start with reload' }],
    reading_path: [
      { path: 'src/server.ts', why: 'Entry point' },
      { path: 'src/db.ts', why: 'Persistence' },
    ],
    first_tasks: [
      { title: 'Test the auth module', path: 'src/auth.ts', complexity: 'low' },
      { title: 'Document src', path: 'src', complexity: 'low' },
      { title: 'Add a logger', path: 'src/logger.ts', complexity: 'medium' },
    ],
    ...over,
  };
}

let seq = 0;

export interface RepoOpts {
  cloned?: boolean;
  /** `null` → no `repo_index_state` row. */
  indexStatus?: 'full' | 'partial' | null;
  edges?: boolean;
  sha?: string;
}

/** A repo + (optionally) its index rows: state, `file_rank`, `file_edges`, `file_facts`. */
export async function makeIndexedRepo(db: Db, workspaceId: string, opts: RepoOpts = {}) {
  const name = `onb-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({
      workspaceId,
      owner: 'acme',
      name,
      fullName: `acme/${name}`,
      clonePath: opts.cloned === false ? null : `/tmp/clones/acme/${name}`,
    })
    .returning();
  const repoId = repo!.id;
  const status = opts.indexStatus === undefined ? 'full' : opts.indexStatus;
  if (status) {
    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: opts.sha ?? SHA,
      indexerVersion: 1,
      status,
      filesIndexed: INDEXED.length,
    });
    await db.insert(t.fileRank).values(
      INDEXED.map((filePath, i) => ({
        repoId,
        filePath,
        pagerank: 0.4 - i * 0.1,
        hotness: 0,
        rank: 0.4 - i * 0.1,
        percentile: 90 - i,
      })),
    );
    if (opts.edges !== false) {
      await db.insert(t.fileEdges).values(EDGES.map(([fromFile, toFile]) => ({ repoId, fromFile, toFile })));
    }
    await db.insert(t.fileFacts).values({
      repoId,
      filePath: 'src/server.ts',
      endpoints: ['GET /health'],
      crons: [],
    });
  }
  return { id: repoId, owner: 'acme', name };
}

export interface AppOpts {
  llm?: LLMProvider | null;
  git?: MockGitClient;
  timeoutMs?: number;
}

export function makeApp(pg: PgFixture, opts: AppOpts = {}): Promise<App> {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ONBOARDING_TIMEOUT_MS: String(opts.timeoutMs ?? 20_000),
  } as NodeJS.ProcessEnv);
  return buildApp({
    config,
    db: pg.handle.db,
    overrides: {
      git: opts.git ?? new RecordingGit(),
      // Never touch a real key: an empty provider makes `llm('openrouter')` throw ConfigError.
      secrets: new MockSecretsProvider({}),
      ...(opts.llm === null ? {} : { llm: { openrouter: opts.llm ?? new StubLLM() } }),
    } as never,
  });
}

/** Poll `GET` until the generation leaves `generating` (never sleeps blindly). */
export async function pollSettled(app: App, repoId: string, timeoutMs = 8000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    const body = res.json();
    if (body.generation && body.generation.status !== 'generating') return body;
    if (Date.now() > end) throw new Error(`generation still ${body.generation?.status} after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

export async function generateAndSettle(app: App, repoId: string) {
  const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
  if (res.statusCode !== 202) throw new Error(`POST → ${res.statusCode} ${res.body}`);
  return pollSettled(app, repoId);
}
