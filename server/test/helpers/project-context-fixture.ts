import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as t from '../../src/db/schema.js';
import { MockLLMProvider } from '../../src/adapters/mocks.js';
import type { PgFixture } from './pg.js';
import type { Review, StructuredRequest, StructuredResult } from '@devdigest/shared';

type Db = PgFixture['handle']['db'];

export const DIFF = `diff --git a/api/x.ts b/api/x.ts
--- a/api/x.ts
+++ b/api/x.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

export const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'Fine.', score: 90, findings: [] };

let seq = 0;

/** A repo row + a populated clone dir (`<cloneDir>/acme/<name>`) + a PR touching `api/x.ts`. */
export async function makeRepoWithPr(
  db: Db,
  workspaceId: string,
  cloneDir: string,
  files: Record<string, string | Buffer>,
  opts: { cloned?: boolean } = {},
) {
  const name = `pcrun-${seq++}`;
  const cloned = opts.cloned !== false;
  const [repo] = await db
    .insert(t.repos)
    .values({
      workspaceId,
      owner: 'acme',
      name,
      fullName: `acme/${name}`,
      clonePath: cloned ? `${cloneDir}/acme/${name}` : null,
    })
    .returning();
  const root = join(cloneDir, 'acme', name);
  if (cloned) {
    await mkdir(root, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(join(root, rel, '..'), { recursive: true });
      await writeFile(join(root, rel), content);
    }
  }
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 700 + seq,
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
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'api/x.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr!, root };
}

/**
 * Recording LLM: keeps every request, reports `tokensIn` proportional to the
 * prompt length (so docs raise usage), and can await a hook mid-call (AC-49).
 */
export class RecordingLLM extends MockLLMProvider {
  public beforeReturn?: () => Promise<void>;

  constructor(review: Review = EMPTY_REVIEW) {
    super('openai', { structured: review });
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const res = await super.completeStructured(req);
    await this.beforeReturn?.();
    const chars = req.messages.reduce((n, m) => n + m.content.length, 0);
    return { ...res, tokensIn: Math.ceil(chars / 4) };
  }

  /** User message of the nth structured call. */
  userMessage(n = 0): string {
    const call = this.calls.filter((c) => c.method === 'completeStructured')[n];
    const req = call?.req as StructuredRequest<unknown> | undefined;
    return req?.messages.find((m) => m.role === 'user')?.content ?? '';
  }

  get structuredCalls(): number {
    return this.calls.filter((c) => c.method === 'completeStructured').length;
  }
}
