import { describe, expect, it } from 'vitest';
import { BriefRisk, ReviewFocusItem, type BriefModelDraft } from '@devdigest/shared';
import { capModelStrings, groundBrief, type GroundContext } from './ground.js';

const ctx = (over: Partial<GroundContext> = {}): GroundContext => ({
  diff: new Map([
    ['src/config.ts', { ranges: [{ start: 10, len: 5 }], hasLines: true }],
    ['src/middleware/ratelimit.ts', { ranges: [{ start: 10, len: 80 }], hasLines: true }],
    ['img.png', { ranges: [], hasLines: false }],
    ['src/old.ts', { ranges: [], hasLines: false }],
    ['src/deep/file-249.ts', { ranges: [{ start: 1, len: 20 }], hasLines: true }],
  ]),
  blast: new Map([['src/server.ts', { callerLines: [88] }]]),
  ...over,
});

const risk = (refs: string[], severity: 'high' | 'medium' | 'low' = 'low', title = 'T') => ({
  kind: 'k',
  title,
  explanation: 'e',
  severity,
  file_refs: refs,
});
const draft = (risks: BriefModelDraft['risks'] = [], review_focus: BriefModelDraft['review_focus'] = []): BriefModelDraft => ({
  summary: 's',
  risks,
  review_focus,
});

describe('groundBrief', () => {
  it('normalizes paths and keeps ./ but not case variants (AC-56)', () => {
    const r = groundBrief(draft([risk(['./src/config.ts', 'Src/Config.ts'])]), ctx());
    expect(r.risks[0]!.file_refs).toEqual(['src/config.ts']);
    expect(r.dropped_refs).toBe(1);
  });

  it('drops risks with no surviving refs (AC-49) and unknown paths', () => {
    const r = groundBrief(draft([risk(['src/ghost.ts'])]), ctx());
    expect(r.risks).toEqual([]);
    expect(r.dropped_refs).toBe(1);
  });

  it('keeps overlapping line refs, bares others (AC-54), bares no-line files (AC-52)', () => {
    const r = groundBrief(
      draft([risk(['src/middleware/ratelimit.ts:12-18', 'src/middleware/ratelimit.ts:500-510', 'img.png:3', 'src/server.ts:88', 'src/server.ts:9'])]),
      ctx(),
    );
    expect(r.risks[0]!.file_refs).toEqual([
      'src/middleware/ratelimit.ts:12-18',
      'src/middleware/ratelimit.ts',
      'img.png',
    ]);
    const r2 = groundBrief(draft([risk(['src/server.ts:88', 'src/server.ts:9'])]), ctx());
    expect(r2.risks[0]!.file_refs).toEqual(['src/server.ts:88', 'src/server.ts']);
  });

  it('blast-only paths are not allowed when blast is null (EC-2)', () => {
    const r = groundBrief(draft([risk(['src/server.ts:88'])]), ctx({ blast: null }));
    expect(r.risks).toEqual([]);
  });

  it('caps refs at 3, risks at 6 and orders by severity (AC-33)', () => {
    const many = Array.from({ length: 8 }, (_, i) => risk(['src/config.ts'], i % 2 ? 'high' : 'low', `r${i}`));
    const r = groundBrief(draft(many), ctx());
    expect(r.risks).toHaveLength(6);
    expect(r.risks.slice(0, 4).every((x) => x.severity === 'high')).toBe(true);
    const refs = groundBrief(draft([risk(['src/config.ts:10', 'src/config.ts:11', 'src/config.ts', 'img.png', 'src/old.ts'])]), ctx());
    expect(refs.risks[0]!.file_refs.length).toBe(3);
  });

  it('focus: keeps, snaps, drops, dedupes, caps (AC-50..55, 58)', () => {
    const r = groundBrief(
      draft([], [
        { file: 'src/config.ts', line: 12, reason: 'in' },
        { file: './src/config.ts', line: 12, reason: 'dup' },
        { file: 'src/config.ts', line: 30, reason: 'snap' },
        { file: 'src/ghost.ts', line: 1, reason: 'ghost' },
        { file: 'img.png', line: 1, reason: 'nolines' },
        { file: 'src/server.ts', line: 80, reason: 'caller snap' },
        { file: 'src/config.ts', line: 0, reason: 'bad' },
      ]),
      ctx(),
    );
    expect(r.review_focus.map((f) => [f.file, f.line, f.line_adjusted])).toEqual([
      ['src/config.ts', 12, false],
      ['src/config.ts', 14, true],
      ['src/server.ts', 88, true],
    ]);
    expect(r.adjusted_lines).toBe(2);
    expect(r.dropped_refs).toBe(2);
    const many = Array.from({ length: 12 }, (_, i) => ({ file: 'src/middleware/ratelimit.ts', line: 10 + i, reason: 'x' }));
    expect(groundBrief(draft([], many), ctx()).review_focus).toHaveLength(8);
  });

  it('EC-6: a file beyond the prompt cap is still grounded', () => {
    const r = groundBrief(draft([], [{ file: 'src/deep/file-249.ts', line: 5, reason: 'x' }]), ctx());
    expect(r.review_focus).toHaveLength(1);
  });

  it('EC-22: deleted file ref becomes bare, focus item dropped', () => {
    const r = groundBrief(
      draft([risk(['src/old.ts:5'])], [{ file: 'src/old.ts', line: 5, reason: 'x' }]),
      ctx(),
    );
    expect(r.risks[0]!.file_refs).toEqual(['src/old.ts']);
    expect(r.review_focus).toEqual([]);
  });

  it('grounded output satisfies the contract field schemas', () => {
    const r = groundBrief(draft([risk(['src/config.ts:12'])], [{ file: 'src/config.ts', line: 12, reason: 'x' }]), ctx());
    expect(BriefRisk.safeParse(r.risks[0]).success).toBe(true);
    expect(ReviewFocusItem.safeParse(r.review_focus[0]).success).toBe(true);
  });
});

describe('capModelStrings', () => {
  const emoji = '\u{1F600}';
  it('cuts to the caps without leaving a lone surrogate, and then validates', () => {
    const d: BriefModelDraft = {
      summary: 's'.repeat(900),
      risks: [{ kind: 'k'.repeat(31), title: 't'.repeat(78) + emoji + 'x', explanation: 'e'.repeat(301), severity: 'high', file_refs: ['src/config.ts'] }],
      review_focus: [{ file: 'src/config.ts', line: 12, reason: 'r'.repeat(161) }],
    };
    const c = capModelStrings(d);
    expect(c.summary.length).toBe(600);
    expect(c.risks[0]!.kind.length).toBe(30);
    expect(c.risks[0]!.title.length).toBeLessThanOrEqual(80);
    expect(c.risks[0]!.title).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(c.risks[0]!.explanation.length).toBe(300);
    expect(c.review_focus[0]!.reason.length).toBe(160);
    const g = groundBrief(c, ctx());
    expect(BriefRisk.safeParse(g.risks[0]).success).toBe(true);
    expect(ReviewFocusItem.safeParse(g.review_focus[0]).success).toBe(true);
  });

  it('splitting case stays at cap-1 and identity on valid drafts', () => {
    const c = capModelStrings({ summary: 'a'.repeat(598) + emoji + 'z', risks: [], review_focus: [] });
    expect(c.summary.length).toBe(599);
    const ok = draft([risk(['src/config.ts'])], [{ file: 'src/config.ts', line: 1, reason: 'r' }]);
    expect(capModelStrings(ok)).toEqual(ok);
  });
});
