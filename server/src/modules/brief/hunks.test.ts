import { describe, expect, it } from 'vitest';
import { buildDiffFacts, inRanges, mergeRanges, nearestInRanges, newSideRanges, rangesOverlap } from './hunks.js';

const patch = (...hdrs: string[]) => hdrs.map((h) => `${h}\n line`).join('\n');

describe('hunks', () => {
  it('reads header ranges; missing count is 1', () => {
    expect(newSideRanges(patch('@@ -1,2 +10,5 @@ fn', '@@ -9 +40 @@'))).toEqual([
      { start: 10, len: 5 },
      { start: 40, len: 1 },
    ]);
    expect(newSideRanges(null)).toEqual([]);
  });

  it('keeps in-range lines and snaps to the nearest (AC-51)', () => {
    const r = mergeRanges(newSideRanges(patch('@@ -1 +10,5 @@', '@@ -1 +40,3 @@')));
    expect(inRanges(13, r)).toBe(true);
    expect(nearestInRanges(30, r)).toBe(40);
    expect(nearestInRanges(1, r)).toBe(10);
    expect(nearestInRanges(26, [{ start: 20, len: 1 }, { start: 32, len: 1 }])).toBe(20);
    expect(rangesOverlap(14, 20, r)).toBe(true);
    expect(rangesOverlap(20, 30, r)).toBe(false);
  });

  it('EC-22: a deleted file has no new-side lines', () => {
    const { files } = buildDiffFacts(
      [{ path: 'src/old.ts', additions: 0, deletions: 12, patch: patch('@@ -1,12 +0,0 @@') }],
      () => 'core',
    );
    expect(files[0]!.hasLines).toBe(false);
  });

  it('EC-23: merges duplicate paths and drops unsafe ones', () => {
    const { files, dropped } = buildDiffFacts(
      [
        { path: 'a.ts', additions: 1, deletions: 2, patch: patch('@@ -1 +1,3 @@') },
        { path: 'a.ts', additions: 4, deletions: 0, patch: patch('@@ -1 +2,5 @@') },
        { path: 'bad\u0000.ts', additions: 1, deletions: 1, patch: null },
      ],
      () => 'wiring',
    );
    expect(dropped).toBe(1);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ additions: 5, deletions: 2, ranges: [{ start: 1, len: 6 }] });
  });

  it('AC-21: no patch line text reaches the facts', () => {
    const p = [
      '@@ -1,3 +1,3 @@',
      ' const a = "BRIEF_CTX_MARKER_42";',
      '-const b = "BRIEF_DEL_MARKER_42";',
      '+const c = "BRIEF_ADD_MARKER_42";',
    ].join('\n');
    const { files } = buildDiffFacts([{ path: 'a.ts', additions: 1, deletions: 1, patch: p }], () => 'core');
    const s = JSON.stringify(files);
    expect(s).not.toContain('BRIEF_ADD_MARKER_42');
    expect(s).not.toContain('BRIEF_DEL_MARKER_42');
    expect(s).not.toContain('BRIEF_CTX_MARKER_42');
  });
});
