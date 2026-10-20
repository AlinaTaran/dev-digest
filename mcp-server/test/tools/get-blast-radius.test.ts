import { afterEach, describe, expect, it } from 'vitest';
import { makeBlast, PR_ID, seedWorld } from '../helpers/fixtures';
import { createHarness, textOf, type Harness } from '../helpers/harness';

describe('get_blast_radius', () => {
  let h: Harness;
  afterEach(async () => {
    await h.close();
  });

  async function setup(blast = makeBlast()): Promise<void> {
    h = await createHarness();
    seedWorld(h.api);
    h.api.blasts[PR_ID] = blast;
  }

  it('returns the map with file:line callers via listRepos -> listPulls -> getBlast', async () => {
    await setup();
    const res = await h.callTool('get_blast_radius', { repo: 'acme/shop', pr: 42 });

    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({
      repo: 'acme/shop',
      pr: 42,
      degraded: false,
      reason: null,
      stats: { symbols: 2, callers: 2, endpoints: 2, crons: 1 },
      symbols: [
        {
          name: 'reviewToDto',
          kind: 'function',
          file: 'server/src/modules/reviews/helpers.ts',
          callers_total: 2,
          callers: [
            { name: 'listReviews', at: 'server/src/modules/reviews/service.ts:57' },
            { name: 'executeRun', at: 'server/src/modules/reviews/run-executor.ts:211' },
          ],
          endpoints: ['GET /pulls/:id/reviews', 'POST /pulls/:id/review'],
          crons: ['job:review-run'],
        },
        {
          name: 'parseX',
          kind: 'function',
          file: 'src/x.ts',
          callers_total: 0,
          callers: [],
          endpoints: [],
          crons: [],
        },
      ],
      impacted_endpoints: ['GET /pulls/:id/reviews', 'POST /pulls/:id/review'],
      truncated: false,
    });
    const text = textOf(res);
    expect(text).toContain('server/src/modules/reviews/service.ts:57 listReviews');
    expect(text).toContain('crons: job:review-run');
    expect(text).toContain('parseX (function) src/x.ts — no callers');
    expect(h.api.calls.map((c) => c.method)).toEqual(['listRepos', 'listPulls', 'getBlast']);
  });

  it('degraded index is a normal result whose next hint says Resync', async () => {
    await setup(makeBlast({ degraded: true, reason: 'index_partial' }));
    const res = await h.callTool('get_blast_radius', { repo: 'acme/shop', pr: 42 });

    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { degraded: boolean; reason: string; next: string };
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('index_partial');
    expect(out.next).toContain('Resync');
    expect(textOf(res)).toContain('Index incomplete (index_partial)');
  });

  it('unknown PR is an error that lists known PRs', async () => {
    await setup();
    const res = await h.callTool('get_blast_radius', { repo: 'acme/shop', pr: 999 });

    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Known PRs: #42');
    expect(h.api.count('getBlast')).toBe(0);
  });

  it('rejects a non-positive PR number at the schema boundary', async () => {
    h = await createHarness();
    const res = await h.callTool('get_blast_radius', { repo: 'acme/shop', pr: 0 }).catch((e) => e);
    // SDK v2 reports invalid arguments either as an isError result or a protocol error.
    const failed = res instanceof Error || (res as { isError?: boolean }).isError === true;
    expect(failed).toBe(true);
    expect(h.api.calls).toHaveLength(0);
  });
});
