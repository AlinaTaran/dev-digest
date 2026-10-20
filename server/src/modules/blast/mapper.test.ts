import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { mapBlast } from './mapper.js';
import type { BlastResult } from '../repo-intel/types.js';

const opts = { maxCallersPerSymbol: 20, bfsDepth: 2, indexedSha: 'abc123' };

const sym = (name: string, file = 'src/a.ts') => ({ name, file, kind: 'function' });
const caller = (viaSymbol: string, file: string, line: number, rank = 0.5, symbol = 'fn') => ({
  file,
  symbol,
  viaSymbol,
  line,
  rank,
});

function base(over: Partial<BlastResult> = {}): BlastResult {
  return { changedSymbols: [], callers: [], impactedEndpoints: [], ...over };
}

describe('mapBlast', () => {
  it('groups flat callers under their symbol and excludes declaring-file callers', () => {
    const out = mapBlast(
      base({
        changedSymbols: [sym('A'), sym('B', 'src/b.ts')],
        callers: [
          caller('A', 'src/x.ts', 1),
          caller('B', 'src/y.ts', 2),
          caller('A', 'src/a.ts', 9), // declaring file of A
        ],
      }),
      opts,
    );
    const a = out.downstream.find((d) => d.symbol === 'A')!;
    const b = out.downstream.find((d) => d.symbol === 'B')!;
    expect(a.callers.map((c) => c.file)).toEqual(['src/x.ts']);
    expect(b.callers.map((c) => c.file)).toEqual(['src/y.ts']);
    expect(BlastRadiusResponse.parse(out)).toBeTruthy();
  });

  it('applies the cap with callers_total and truncated', () => {
    const callers = Array.from({ length: 5 }, (_, i) => caller('A', `src/c${i}.ts`, i + 1, 1 - i / 10));
    const out = mapBlast(base({ changedSymbols: [sym('A')], callers, callerTotals: { A: 9 } }), {
      ...opts,
      maxCallersPerSymbol: 3,
    });
    const a = out.downstream[0]!;
    expect(a.callers).toHaveLength(3);
    expect(a.callers_total).toBe(9);
    expect(a.truncated).toBe(true);
    expect(out.stats.callers).toBe(9);
    expect(a.callers[0]!.file).toBe('src/c0.ts'); // rank DESC
  });

  it('attributes endpoints/crons per caller and per symbol separately', () => {
    const out = mapBlast(
      base({
        changedSymbols: [sym('A')],
        callers: [caller('A', 'src/s.ts', 1, 0.9), caller('A', 'src/t.ts', 2, 0.5)],
        impactByCallerFile: {
          'src/s.ts': { endpoints: ['GET /x'], crons: [] },
          'src/t.ts': { endpoints: ['POST /y'], crons: ['job:z'] },
        },
        impactBySymbol: { A: { endpoints: ['POST /y', 'GET /x', 'GET /hidden'], crons: ['job:z'] } },
      }),
      opts,
    );
    const a = out.downstream[0]!;
    expect(a.callers[0]!.endpoints).toEqual(['GET /x']);
    expect(a.callers[0]!.crons).toEqual([]);
    expect(a.callers[1]!.crons).toEqual(['job:z']);
    expect(a.endpoints_affected).toEqual(['GET /hidden', 'GET /x', 'POST /y']);
    expect(a.crons_affected).toEqual(['job:z']);
    expect(out.stats).toMatchObject({ endpoints: 3, crons: 1 });
  });

  it('falls back to factsByFile and to the union of caller lists', () => {
    const out = mapBlast(
      base({
        changedSymbols: [sym('A')],
        callers: [caller('A', 'src/s.ts', 1)],
        factsByFile: { 'src/s.ts': { endpoints: ['GET /f'], crons: ['job:f'] } },
      }),
      opts,
    );
    expect(out.downstream[0]!.callers[0]!.endpoints).toEqual(['GET /f']);
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /f']);
    expect(out.downstream[0]!.crons_affected).toEqual(['job:f']);
  });

  it('keeps a zero-caller symbol', () => {
    const out = mapBlast(base({ changedSymbols: [sym('Lonely')] }), opts);
    expect(out.downstream).toHaveLength(1);
    expect(out.downstream[0]).toMatchObject({ symbol: 'Lonely', callers: [], callers_total: 0, truncated: false, rank: 0 });
  });

  it('sorts by rank DESC, callers_total DESC, symbol ASC', () => {
    const out = mapBlast(
      base({
        changedSymbols: [sym('Z'), sym('Y'), sym('X'), sym('W')],
        callers: [
          caller('Z', 'src/1.ts', 1, 0.9),
          caller('Y', 'src/2.ts', 1, 0.5),
          caller('Y', 'src/3.ts', 1, 0.5),
          caller('X', 'src/4.ts', 1, 0.5),
        ],
      }),
      opts,
    );
    expect(out.downstream.map((d) => d.symbol)).toEqual(['Z', 'Y', 'X', 'W']);
  });

  it('degraded fallback input still yields flat impacted_endpoints and passes degraded/reason through', () => {
    const out = mapBlast(
      base({
        changedSymbols: [sym('A')],
        callers: [caller('A', 'src/s.ts', 1, 0)],
        impactedEndpoints: ['GET /flat'],
        degraded: true,
        reason: 'flag_off',
      }),
      { ...opts, indexedSha: null },
    );
    expect(out.impacted_endpoints).toEqual(['GET /flat']);
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('flag_off');
    expect(out.indexed_sha).toBeNull();
    expect(mapBlast(base({ degraded: true }), opts).reason).toBe('no_data');
    expect(mapBlast(base(), opts)).toMatchObject({ degraded: false, reason: null });
  });

  it('computes stats and a deterministic summary, and output parses against the contract', () => {
    const out = mapBlast(
      base({
        changedSymbols: [sym('A'), sym('A'), sym('B', 'src/b.ts')],
        callers: [caller('A', 'src/s.ts', 1), caller('B', 'src/t.ts', 2)],
        impactBySymbol: { A: { endpoints: ['GET /x'], crons: ['job:c'] } },
      }),
      opts,
    );
    expect(out.stats).toEqual({ symbols: 2, callers: 2, endpoints: 1, crons: 1 });
    expect(out.summary).toBe('2 changed symbol(s), 2 caller(s), 1 endpoint(s), 1 cron(s)');
    expect(out.max_callers_per_symbol).toBe(20);
    expect(out.bfs_depth).toBe(2);
    expect(out.indexed_sha).toBe('abc123');
    expect(() => BlastRadiusResponse.parse(out)).not.toThrow();
  });
});
