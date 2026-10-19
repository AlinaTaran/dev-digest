import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ID, makeConvention, seedWorld } from '../helpers/fixtures';
import { createHarness, textOf, type Harness } from '../helpers/harness';

describe('get_conventions', () => {
  let h: Harness;
  afterEach(async () => {
    await h.close();
  });

  async function start(conventions = [makeConvention()]) {
    h = await createHarness();
    seedWorld(h.api);
    h.api.conventions[REPO_ID] = conventions;
  }

  it('returns accepted conventions with path:line evidence and never the snippet', async () => {
    await start([
      { ...makeConvention({ rule: 'Use named exports' }), evidence_snippet: 'SNIPPET_SECRET' } as never,
      makeConvention({ id: '2', rule: 'Hidden', status: 'pending' }),
      makeConvention({ id: '3', rule: 'No line', category: 'arch', evidence_line_start: null, evidence_line_end: null }),
    ]);
    const res = await h.callTool('get_conventions', { repo: 'acme/shop' });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as {
      conventions: { rule: string; evidence: string }[];
      count: number;
      pending: number;
    };
    expect(out.conventions.map((c) => c.evidence)).toEqual(['src/index.ts', 'src/index.ts:3']);
    expect(out.pending).toBe(1);
    expect(JSON.stringify(res)).not.toContain('SNIPPET_SECRET');
    expect(textOf(res)).not.toContain('Hidden');
  });

  it('filters by category and reports truncation', async () => {
    await start([
      makeConvention({ id: '1', rule: 'a', category: 'style' }),
      makeConvention({ id: '2', rule: 'b', category: 'Style' }),
      makeConvention({ id: '3', rule: 'c', category: 'arch' }),
    ]);
    const res = await h.callTool('get_conventions', { repo: 'acme/shop', category: 'style', limit: 1 });
    const out = res.structuredContent as { count: number; total_accepted: number; truncated: boolean };
    expect(out).toMatchObject({ count: 1, total_accepted: 3, truncated: true });
  });

  it('zero accepted is a non-error with a hint naming the pending count', async () => {
    await start([makeConvention({ status: 'pending' })]);
    const res = await h.callTool('get_conventions', { repo: 'acme/shop' });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { next: string }).next).toContain('(1 pending)');
  });

  it('unknown repo is an error that lists known repos', async () => {
    await start();
    const res = await h.callTool('get_conventions', { repo: 'ghost/none' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('acme/shop');
  });
});
