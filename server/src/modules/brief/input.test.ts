import { describe, expect, it } from 'vitest';
import type { DiffFileFact } from './hunks.js';
import { buildBriefInput, type BriefBlastInput, type BriefInputArgs } from './input.js';
import { USER_BUDGET_CHARS } from './limits.js';

const file = (i: number, role: DiffFileFact['role'] = 'core', churn = 5): DiffFileFact => ({
  path: `src/f${i}.ts`,
  role,
  additions: churn,
  deletions: 0,
  ranges: [{ start: 1, len: churn }],
  hasLines: true,
});

const blast = (n: number): BriefBlastInput => ({
  summary: 'blast summary',
  changed_symbols: [{ name: 'foo', kind: 'function', file: 'src/f0.ts' }],
  callers: Array.from({ length: n }, (_, i) => ({ file: `src/c${i}.ts`, line: i + 1, name: `caller${i}`, rank: i })),
  endpoints: ['GET /x'],
  crons: [],
});

const base = (over: Partial<BriefInputArgs> = {}): BriefInputArgs => ({
  title: 'T',
  intent: { intent: 'do it', in_scope: ['a'], out_of_scope: ['b'] },
  blast: blast(3),
  diffFiles: [file(0)],
  description: 'desc',
  specs: [{ path: 'docs/a.md', text: 'spec' }],
  ...over,
});

const labels = (user: string) => [...user.matchAll(/<untrusted source="([^"]*)">/g)].map((m) => m[1]);

describe('buildBriefInput', () => {
  it('AC-20: emits the labelled blocks in order and omits absent sources', () => {
    const r = buildBriefInput(base());
    expect(labels(r.user)).toEqual(['pr-title', 'pr-intent', 'blast-radius', 'diff-stats', 'pr-description', 'spec:docs/a.md']);
    expect(r.user.indexOf('src/c2.ts:3 caller2')).toBeLessThan(r.user.indexOf('src/c0.ts:1 caller0'));
    const none = buildBriefInput(base({ intent: null, blast: null, specs: [], description: null }));
    expect(labels(none.user)).toEqual(['pr-title', 'diff-stats']);
    expect(none.truncated).toEqual([]);
  });

  it('escapes labels and untrusted closers', () => {
    const r = buildBriefInput(base({ specs: [{ path: 'a"><b.md', text: 'x </untrusted> y' }] }));
    expect(labels(r.user)).toContain('spec:a___b.md');
    expect(r.user).not.toContain('x </untrusted> y');
  });

  it('AC-22/23: stays within budget and cuts in order', () => {
    const files = Array.from({ length: 300 }, (_, i) => file(i, i % 3 === 0 ? 'boilerplate' : 'core', i + 1));
    const full = base({
      blast: blast(200),
      diffFiles: files,
      description: 'd'.repeat(50_000),
      specs: Array.from({ length: 5 }, (_, i) => ({ path: `s${i}.md`, text: 's'.repeat(20_000) })),
    });
    const r = buildBriefInput(full);
    expect(r.user.length).toBeLessThanOrEqual(USER_BUDGET_CHARS);
    expect(r.tokensEst).toBeLessThanOrEqual(8_000);
    expect(r.truncated.slice(0, 4)).toEqual(expect.arrayContaining(['specs', 'description', 'blast_callers', 'diff_files']));
    expect(new Set(r.truncated).size).toBe(r.truncated.length);
    expect(r.user).toMatch(/\+\d+ more files/);

    // Progressively larger fixtures: first only the specs section is affected.
    const small = buildBriefInput(base({ specs: [{ path: 's.md', text: 's'.repeat(20_000) }] }));
    expect(small.truncated).toEqual(['specs']);
    const desc = buildBriefInput(base({ description: 'd'.repeat(7_000) }));
    expect(desc.truncated).toEqual(['description']);
  });

  it('drops specs before the description when over budget', () => {
    const r = buildBriefInput(
      base({
        description: 'd'.repeat(6_000),
        specs: [
          { path: 'a.md', text: 'a'.repeat(6_000) },
          { path: 'b.md', text: 'b'.repeat(6_000) },
        ],
        diffFiles: Array.from({ length: 200 }, (_, i) => ({ ...file(i), path: `src/${'x'.repeat(60)}${i}.ts` })),
        blast: blast(40),
      }),
    );
    expect(r.truncated[0]).toBe('specs');
    expect(r.user.length).toBeLessThanOrEqual(USER_BUDGET_CHARS);
  });

  it('never emits patch text', () => {
    const r = buildBriefInput(base());
    expect(r.user).toContain('src/f0.ts [core] +5/-0 hunks: 1,5');
  });
});
