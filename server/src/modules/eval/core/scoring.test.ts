import { describe, expect, it } from 'vitest';
import type { EvalExpectation, Finding } from '@devdigest/shared';
import { findingMatches, normalizePath, normalizeRange } from './matching.js';
import { scoreCase } from './scoring.js';
import { aggregateRun, type AggregateCaseResult } from './aggregate.js';
import { buildEvalAlert } from './alert.js';

function f(file: string, start: number, end = start, id = `${file}:${start}`): Finding {
  return {
    id,
    severity: 'CRITICAL',
    category: 'security',
    title: 't',
    file,
    start_line: start,
    end_line: end,
    rationale: 'r',
    confidence: 0.9,
  } as Finding;
}
const find = (file: string, s: number, e?: number): EvalExpectation => ({
  expect: 'must_find',
  file,
  start_line: s,
  ...(e === undefined ? {} : { end_line: e }),
});
const notFlag = (file: string, s: number, e?: number): EvalExpectation => ({
  ...find(file, s, e),
  expect: 'must_not_flag',
});

describe('matching (AC-27)', () => {
  it('matches by exact path and overlapping lines', () => {
    expect(findingMatches(f('a.ts', 10, 12), find('a.ts', 12, 20))).toBe(true);
    expect(findingMatches(f('a.ts', 10, 12), find('a.ts', 13))).toBe(false);
    expect(findingMatches(f('b.ts', 10), find('a.ts', 10))).toBe(false);
    expect(findingMatches(f('./a.ts', 10), find('a.ts', 10))).toBe(true);
    expect(findingMatches(f('A.ts', 10), find('a.ts', 10))).toBe(false);
    expect(findingMatches(f('a.ts', 12, 10), find('a.ts', 11))).toBe(true); // reversed finding range
    expect(findingMatches(f('a.ts', 10), find('a.ts', 20, 9))).toBe(true); // reversed expectation range
    expect(normalizePath('././a.ts')).toBe('./a.ts');
    expect(normalizeRange(5)).toEqual({ start: 5, end: 5 });
  });
});

describe('scoreCase (AC-28..31, 34)', () => {
  it('recall: 1 of 2 must_find matched = 0.5; none = 1', () => {
    const r = scoreCase({ expectations: [find('a.ts', 1), find('b.ts', 1)], kept: [f('a.ts', 1)], dropped: [] });
    expect(r.recall).toBe(0.5);
    expect(r.pass).toBe(false);
    expect(scoreCase({ expectations: [], kept: [], dropped: [] }).recall).toBe(1);
  });

  it('strict precision: tp + must_not_flag hit + unrelated = 1/3 and fails', () => {
    const r = scoreCase({
      expectations: [find('a.ts', 1), notFlag('b.ts', 5)],
      kept: [f('a.ts', 1), f('b.ts', 5), f('c.ts', 9)],
      dropped: [],
    });
    expect(r.precision).toBeCloseTo(1 / 3);
    expect(r.pass).toBe(false); // clause 2
    expect(r.actual_output.finding_verdicts.map((v) => [v.verdict, v.hit_must_not_flag])).toEqual([
      ['tp', false],
      ['fp', true],
      ['fp', false],
    ]);
    expect(scoreCase({ expectations: [], kept: [], dropped: [] }).precision).toBe(1);
  });

  it('citation accuracy: 3 kept 1 dropped = 0.75; 0/0 = 1', () => {
    const r = scoreCase({
      expectations: [],
      kept: [f('a.ts', 1), f('a.ts', 2), f('a.ts', 3)],
      dropped: [{ finding: f('z.ts', 1), reason: 'not in diff' }],
    });
    expect(r.citation_accuracy).toBe(0.75);
    expect(r.actual_output.dropped[0]?.reason).toBe('not in diff');
    expect(scoreCase({ expectations: [], kept: [], dropped: [] }).citation_accuracy).toBe(1);
  });

  it('pass clauses: extra unrelated finding still passes; empty expectations + findings fails (EC-15)', () => {
    const extra = scoreCase({ expectations: [find('a.ts', 1)], kept: [f('a.ts', 1), f('x.ts', 3)], dropped: [] });
    expect(extra.pass).toBe(true);
    expect(extra.precision).toBe(0.5);

    const ec15 = scoreCase({ expectations: [], kept: [f('x.ts', 3)], dropped: [] });
    expect(ec15).toMatchObject({ pass: false, precision: 0, recall: 1 });

    expect(scoreCase({ expectations: [], kept: [], dropped: [] }).pass).toBe(true); // EC-14
  });

  it('EC-16: all dropped -> citation 0, precision 1, recall 0', () => {
    const r = scoreCase({
      expectations: [find('a.ts', 1)],
      kept: [],
      dropped: [{ finding: f('a.ts', 1), reason: 'x' }],
    });
    expect(r).toMatchObject({ citation_accuracy: 0, precision: 1, recall: 0, pass: false });
  });

  it('EC-4: full-file kind without line overlap does not match', () => {
    const full = { ...f('a.ts', 1), kind: 'secret_leak' } as Finding;
    expect(scoreCase({ expectations: [find('a.ts', 50)], kept: [full], dropped: [] }).recall).toBe(0);
  });

  it('assigns k<index> verdict ids when the finding has no id', () => {
    const r = scoreCase({ expectations: [], kept: [f('a.ts', 1, 1, '')], dropped: [] });
    expect(r.actual_output.finding_verdicts[0]?.finding_id).toBe('k0');
  });
});

describe('aggregateRun (AC-32, AC-41)', () => {
  const mk = (name: string, exps: EvalExpectation[], kept: Finding[], dropped: Finding[], cost: number | null) => {
    const s = scoreCase({ expectations: exps, kept, dropped: dropped.map((d) => ({ finding: d, reason: 'r' })) });
    return { name, pass: s.pass, error: null, counts: s.counts, cost_usd: cost } satisfies AggregateCaseResult;
  };

  it('micro-averages a hand-computed 3-case fixture', () => {
    // c1: find 2, matched 1, kept 2 (1 tp), dropped 0 -> counts 1/2, 1/2, 2/2
    // c2: find 1, matched 1, kept 1 (1 tp), dropped 1 -> 1/1, 1/1, 1/2
    // c3: no expectations, kept 0                       -> 0/0, 0/0, 0/0
    const results = [
      mk('c1', [find('a.ts', 1), find('b.ts', 1)], [f('a.ts', 1), f('q.ts', 1)], [], 0.1),
      mk('c2', [find('a.ts', 1)], [f('a.ts', 1)], [f('z.ts', 1)], 0.2),
      mk('c3', [], [], [], 0.3),
    ];
    const out = aggregateRun(results, 1234.4);
    expect(out.status).toBe('done');
    expect(out.metrics).toMatchObject({
      recall: 2 / 3,
      precision: 2 / 3,
      citation_accuracy: 3 / 4,
      traces_passed: 2,
      traces_total: 3,
      duration_ms: 1234,
    });
    expect(out.metrics?.cost_usd).toBeCloseTo(0.6);
  });

  it('errored cases: excluded from metrics, counted in total; partial / failed; null-poisoned cost', () => {
    const ok = mk('ok', [find('a.ts', 1)], [f('a.ts', 1)], [], 0.1);
    const bad: AggregateCaseResult = {
      name: 'bad', pass: false, counts: null, cost_usd: null,
      error: { reason: 'timeout', message: 'x' },
    };
    const partial = aggregateRun([ok, bad]);
    expect(partial).toMatchObject({ status: 'partial', cases_errored: 1 });
    expect(partial.metrics).toMatchObject({ recall: 1, traces_passed: 1, traces_total: 2, cost_usd: null });

    expect(aggregateRun([bad])).toEqual({ status: 'failed', cases_errored: 1, metrics: null });
    expect(aggregateRun([]).metrics).toBeNull();
  });

  it('property: never NaN, values within [0,1] (seeded PRNG)', () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % n;
    };
    const files = ['a.ts', 'b.ts', 'c.ts'];
    for (let iter = 0; iter < 200; iter++) {
      const results = Array.from({ length: rnd(5) }, (_, i) => {
        const exps = Array.from({ length: rnd(4) }, () =>
          (rnd(2) ? find : notFlag)(files[rnd(3)]!, 1 + rnd(5), 1 + rnd(5)),
        );
        const kept = Array.from({ length: rnd(4) }, () => f(files[rnd(3)]!, 1 + rnd(5), 1 + rnd(5), `k${iter}-${i}-${rnd(1e6)}`));
        const dropped = Array.from({ length: rnd(3) }, () => f('d.ts', 1));
        return mk(`c${i}`, exps, kept, dropped, rnd(2) ? 0.01 : null);
      });
      const m = aggregateRun(results).metrics;
      if (!m) continue;
      for (const v of [m.recall, m.precision, m.citation_accuracy]) {
        expect(Number.isNaN(v)).toBe(false);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('buildEvalAlert (AC-65)', () => {
  const base = { recall: 0.9, precision: 0.9, citation_accuracy: 0.9 };
  it('fires at a 0.02 drop, not at 0.019, joins multiple metrics', () => {
    expect(buildEvalAlert({ ...base, precision: 0.88 }, base, 7)).toBe('Precision dipped 2pts on v7');
    expect(buildEvalAlert({ ...base, precision: 0.881 }, base, 7)).toBeNull();
    expect(buildEvalAlert({ ...base, recall: 0.85, citation_accuracy: 0.8 }, base, 3)).toBe(
      'Recall dipped 5pts, Citation accuracy dipped 10pts on v3',
    );
    expect(buildEvalAlert({ ...base, precision: 1 }, base, 3)).toBeNull();
    expect(buildEvalAlert(base, null, 3)).toBeNull();
  });
});

describe('NFR-1 timing', () => {
  it('scores 50 findings x 50 expectations well under budget (median of 5)', () => {
    const exps = Array.from({ length: 50 }, (_, i) => find('a.ts', i * 10 + 1, i * 10 + 5));
    const kept = Array.from({ length: 50 }, (_, i) => f('a.ts', i * 10 + 3, i * 10 + 4, `id${i}`));
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      scoreCase({ expectations: exps, kept, dropped: [] });
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    expect(times[2]!).toBeLessThan(25); // spec target 5 ms; generous CI margin
  });
});
