import { describe, expect, it } from 'vitest';
import { FakeDevDigestApi, FakeClock, createSilentLogger } from '../../src/adapters/mocks';
import { createGetBlastRadius } from '../../src/domain/use-cases/get-blast-radius';
import type { Blast } from '../../src/domain/types';
import { makeBlast, PR_ID, seedWorld } from '../helpers/fixtures';

function setup(blast: Blast) {
  const api = new FakeDevDigestApi();
  seedWorld(api);
  api.blasts[PR_ID] = blast;
  const run = createGetBlastRadius({ api, clock: new FakeClock(), logger: createSilentLogger() });
  return { api, run };
}

const symbol = (i: number, callers = 0): Blast['downstream'][number] => ({
  symbol: `sym${i}`,
  file: 'a.ts',
  kind: 'function',
  callers_total: callers,
  callers: Array.from({ length: callers }, (_, n) => ({ name: `c${n}`, file: 'b.ts', line: n + 1 })),
  endpoints_affected: [],
  crons_affected: [],
});

describe('getBlastRadius use case', () => {
  it('maps callers to file:line, keeps server order and passes stats through unchanged', async () => {
    const blast = makeBlast({ stats: { symbols: 9, callers: 8, endpoints: 7, crons: 6 } });
    const { run } = setup(blast);
    const r = await run({ repo: 'acme/shop', pr: 42 });

    expect(r.stats).toEqual({ symbols: 9, callers: 8, endpoints: 7, crons: 6 });
    expect(r.symbols.map((s) => s.name)).toEqual(['reviewToDto', 'parseX']);
    expect(r.symbols[0]?.callers[0]?.at).toBe('server/src/modules/reviews/service.ts:57');
    expect(r.hint).toBeUndefined();
    expect(r.truncated).toBe(false);
  });

  it('re-applies the API-reported callers cap but keeps callers_total', async () => {
    const { run } = setup(makeBlast({ downstream: [symbol(0, 25)], max_callers_per_symbol: 20 }));
    const r = await run({ repo: 'acme/shop', pr: 42 });
    expect(r.symbols[0]?.callers).toHaveLength(20);
    expect(r.symbols[0]?.callers_total).toBe(25);
  });

  it('caps callers at the 20 MCP budget when the API reports no cap or a higher one', async () => {
    for (const max of [null, 40]) {
      const { run } = setup(makeBlast({ downstream: [symbol(0, 25)], max_callers_per_symbol: max }));
      const r = await run({ repo: 'acme/shop', pr: 42 });
      expect(r.symbols[0]?.callers).toHaveLength(20);
      expect(r.symbols[0]?.callers_total).toBe(25);
    }
  });

  it('caps endpoints, crons and impacted_endpoints at 50 and sets truncated', async () => {
    const many = Array.from({ length: 60 }, (_, i) => `GET /e${i}`);
    const sym = { ...symbol(0), endpoints_affected: many, crons_affected: many };
    const { run } = setup(makeBlast({ downstream: [sym], impacted_endpoints: many }));
    const r = await run({ repo: 'acme/shop', pr: 42 });
    expect(r.symbols[0]?.endpoints).toHaveLength(50);
    expect(r.symbols[0]?.crons).toHaveLength(50);
    expect(r.impacted_endpoints).toHaveLength(50);
    expect(r.truncated).toBe(true);
  });

  it('caps symbols at 30 with truncated + BLAST_TRUNCATED', async () => {
    const downstream = Array.from({ length: 35 }, (_, i) => symbol(i));
    const { run } = setup(makeBlast({ downstream }));
    const r = await run({ repo: 'acme/shop', pr: 42 });
    expect(r.symbols).toHaveLength(30);
    expect(r.truncated).toBe(true);
    expect(r.hint).toEqual({ code: 'BLAST_TRUNCATED', shown: 30, total: 35 });
  });

  it('emits BLAST_DEGRADED when the index is incomplete', async () => {
    const { run } = setup(makeBlast({ degraded: true, reason: 'no_data' }));
    const r = await run({ repo: 'acme/shop', pr: 42 });
    expect(r.hint).toMatchObject({ code: 'BLAST_DEGRADED', pr: 42, reason: 'no_data' });
  });
});
