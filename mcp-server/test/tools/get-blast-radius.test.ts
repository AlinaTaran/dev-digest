import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf, type Harness } from '../helpers/harness';

describe('get_blast_radius (stub)', () => {
  let h: Harness;
  afterEach(async () => {
    await h.close();
  });

  it('returns not_implemented without error and makes no API calls', async () => {
    h = await createHarness();
    const res = await h.callTool('get_blast_radius', { repo: 'acme/shop', pr: 42 });

    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({
      status: 'not_implemented',
      repo: 'acme/shop',
      pr: 42,
      message:
        'Blast radius is not implemented yet (planned from repo-intel). Do not retry; use get_findings for review impact.',
    });
    expect(textOf(res)).toContain('not_implemented');
    expect(h.api.calls).toHaveLength(0);
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
