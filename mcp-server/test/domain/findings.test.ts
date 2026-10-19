import { describe, expect, it } from 'vitest';
import {
  countFindings,
  filterAndSort,
  runningResult,
  shapeReview,
  toFindingOut,
  truncate,
} from '../../src/domain/findings';
import { makeFinding, makeReview } from '../helpers/fixtures';

describe('findings helpers', () => {
  const findings = [
    makeFinding({ severity: 'SUGGESTION', title: 's', file: 'b.ts' }),
    makeFinding({ severity: 'CRITICAL', title: 'c', file: 'z.ts' }),
    makeFinding({ severity: 'WARNING', title: 'w2', file: 'b.ts', start_line: 9 }),
    makeFinding({ severity: 'WARNING', title: 'w1', file: 'a.ts' }),
  ];

  it('sorts CRITICAL -> SUGGESTION and filters by minimum severity', () => {
    expect(filterAndSort(findings).map((f) => f.title)).toEqual(['c', 'w1', 'w2', 's']);
    expect(filterAndSort(findings, 'WARNING').map((f) => f.title)).toEqual(['c', 'w1', 'w2']);
    expect(filterAndSort(findings, 'CRITICAL').map((f) => f.title)).toEqual(['c']);
  });

  it('counts all severities', () => {
    expect(countFindings(findings)).toEqual({ critical: 1, warning: 2, suggestion: 1 });
  });

  it('truncate keeps short text and ellipsizes long text within the limit', () => {
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('abcdefgh', 5)).toBe('abcd…');
  });

  it('concise omits rationale/suggestion; detailed adds them truncated; line formats', () => {
    const f = makeFinding({ rationale: 'r'.repeat(900), suggestion: 's'.repeat(900) });
    const concise = toFindingOut(f, 'concise');
    expect(concise).toEqual({ severity: 'WARNING', title: 'Something off', file: 'src/a.ts', line: '10-14', category: 'bug' });
    const detailed = toFindingOut(f, 'detailed');
    expect(detailed.rationale).toHaveLength(600);
    expect(detailed.suggestion).toHaveLength(400);
    expect(toFindingOut(makeFinding({ start_line: 7, end_line: 7 }), 'concise').line).toBe('7');
    expect(toFindingOut(makeFinding({ start_line: 7, end_line: null }), 'concise').line).toBe('7');
    expect(toFindingOut(makeFinding({ start_line: null, end_line: null, suggestion: null }), 'detailed')).toMatchObject({
      suggestion: null,
    });
    expect('line' in toFindingOut(makeFinding({ start_line: null, end_line: null }), 'concise')).toBe(false);
  });

  it('shapeReview counts over all findings, caps at limit and emits a NARROW hint', () => {
    const review = makeReview({
      findings: Array.from({ length: 30 }, (_, i) =>
        makeFinding({ severity: i < 25 ? 'WARNING' : 'SUGGESTION', title: `t${i}`, start_line: i }),
      ),
      summary: 'x'.repeat(500),
    });
    const r = shapeReview(review, { repo: 'acme/shop', pr: 42, limit: 20, severity: 'WARNING', format: 'concise' });
    expect(r.status).toBe('done');
    expect(r.counts).toEqual({ critical: 0, warning: 25, suggestion: 5 });
    expect(r.findings).toHaveLength(20);
    expect(r.truncated).toBe(true);
    expect(r.hint).toEqual({ code: 'NARROW', shown: 20, total: 25, max: 50 });
    expect(r.summary).toHaveLength(400);
    expect(r.agent).toBe('Security');
  });

  it('shapeReview is not truncated when everything fits', () => {
    const r = shapeReview(makeReview({ findings: [makeFinding()] }), {
      repo: 'acme/shop',
      pr: 42,
      limit: 20,
      format: 'concise',
    });
    expect(r.truncated).toBe(false);
    expect(r.hint).toBeUndefined();
  });

  it('runningResult carries a NEXT_POLL hint', () => {
    expect(runningResult({ repo: 'a/b', pr: 1, agent: 'X', run_id: 'r' })).toEqual({
      status: 'running',
      run_id: 'r',
      repo: 'a/b',
      pr: 1,
      agent: 'X',
      hint: { code: 'NEXT_POLL', repo: 'a/b', pr: 1, run_id: 'r' },
    });
  });
});
