import { describe, expect, it } from 'vitest';
import { FakeClock, FakeDevDigestApi, createSilentLogger } from '../../src/adapters/mocks';
import { createGetConventions } from '../../src/domain/use-cases/get-conventions';
import { REPO_ID, makeConvention, seedWorld } from '../helpers/fixtures';

function setup() {
  const api = new FakeDevDigestApi();
  seedWorld(api);
  const getConventions = createGetConventions({ api, clock: new FakeClock(), logger: createSilentLogger() });
  return { api, getConventions };
}

describe('getConventions use case', () => {
  it('keeps accepted only, sorts by category then rule, formats evidence', async () => {
    const { api, getConventions } = setup();
    api.conventions[REPO_ID] = [
      makeConvention({ id: '1', rule: 'b rule', category: 'style', evidence_line_start: 3, evidence_line_end: 3 }),
      makeConvention({ id: '2', rule: 'a rule', category: 'style', evidence_line_start: 5, evidence_line_end: 9 }),
      makeConvention({ id: '3', rule: 'z', category: 'arch', evidence_line_start: null, evidence_line_end: null }),
      makeConvention({ id: '4', rule: 'pending one', status: 'pending' }),
      makeConvention({ id: '5', rule: 'rejected one', status: 'rejected' }),
    ];
    const res = await getConventions({ repo: 'acme/shop' });
    expect(res.conventions).toEqual([
      { rule: 'z', category: 'arch', evidence: 'src/index.ts' },
      { rule: 'a rule', category: 'style', evidence: 'src/index.ts:5-9' },
      { rule: 'b rule', category: 'style', evidence: 'src/index.ts:3' },
    ]);
    expect(res).toMatchObject({ count: 3, total_accepted: 3, pending: 1, truncated: false });
    expect(res.hint).toBeUndefined();
  });

  it('filters by category case-insensitively, truncates long rules, applies limit', async () => {
    const { api, getConventions } = setup();
    api.conventions[REPO_ID] = [
      makeConvention({ id: '1', rule: 'x'.repeat(500), category: 'Style' }),
      makeConvention({ id: '2', rule: 'two', category: 'style' }),
      makeConvention({ id: '3', rule: 'three', category: 'arch' }),
    ];
    const res = await getConventions({ repo: 'acme/shop', category: 'STYLE', limit: 1 });
    expect(res.count).toBe(1);
    expect(res.total_accepted).toBe(3);
    expect(res.truncated).toBe(true);
    expect(res.conventions[0]?.rule.length).toBeLessThanOrEqual(300);
  });

  it('emits NO_CONVENTIONS with pending count when none accepted', async () => {
    const { api, getConventions } = setup();
    api.conventions[REPO_ID] = [makeConvention({ status: 'pending' }), makeConvention({ id: '2', status: 'pending' })];
    const res = await getConventions({ repo: 'acme/shop' });
    expect(res.conventions).toEqual([]);
    expect(res.hint).toEqual({ code: 'NO_CONVENTIONS', repo: 'acme/shop', pending: 2 });
  });
});
