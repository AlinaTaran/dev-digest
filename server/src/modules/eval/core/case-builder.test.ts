import { describe, expect, it } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../../adapters/index.js'; // test-only import (core itself stays adapter-free)
import {
  buildCaseFromFinding,
  extractFileFragment,
  slugifyCaseName,
  uniqueCaseName,
} from './case-builder.js';
import {
  expectationFileWarnings,
  inputFilesFrom,
  normalizeDiffText,
  validateDiffInput,
} from './diff-input.js';

const RAW = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 line1
+added2
 line3
 line4
diff --git a/src/a.tsx b/src/a.tsx
--- a/src/a.tsx
+++ b/src/a.tsx
@@ -1,1 +1,2 @@
 x
+y
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -10,2 +10,3 @@
 ten
+eleven
 twelve
diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -40,1 +41,2 @@
 forty
+forty-two
diff --git a/gone.ts b/gone.ts
--- a/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-a
-b
`;
const diff = parseUnifiedDiff(RAW);

const finding = (over: Partial<Finding> = {}) =>
  ({
    id: 'f1', severity: 'CRITICAL', category: 'security', title: 'Hardcoded Stripe secret key in commit',
    file: 'src/a.ts', start_line: 2, end_line: 2, rationale: 'r', confidence: 0.9, ...over,
  }) as Finding;

const base = (over: Record<string, unknown> = {}) => {
  const fragment = extractFileFragment(diff, 'src/a.ts');
  return {
    finding: finding(),
    decision: 'accepted' as const,
    review: { id: 'r1', agent_id: 'ag1' },
    pull: { number: 7, title: 'PR', body: 'b'.repeat(5000), head_sha: 'abc' },
    repoFullName: 'o/r',
    fragment,
    parsedFragment: parseUnifiedDiff(fragment ?? ''),
    ownerKind: 'agent' as const,
    ownerId: 'ag1',
    existingNames: [] as string[],
    ...over,
  };
};

describe('slug / unique name (AC-8)', () => {
  it('slugifies and suffixes', () => {
    expect(slugifyCaseName('Hardcoded Stripe secret key in commit')).toBe('hardcoded-stripe-secret-key-in-commit');
    expect(slugifyCaseName('  --Привіт!!  ')).toBe('case');
    expect(slugifyCaseName('a'.repeat(59) + ' bbb')).toHaveLength(59);
    expect(slugifyCaseName('x'.repeat(100))).toHaveLength(60);
    expect(uniqueCaseName('x', [])).toBe('x');
    expect(uniqueCaseName('x', ['x'])).toBe('x-2');
    expect(uniqueCaseName('x', ['x', 'x-2'])).toBe('x-3');
  });
});

describe('extractFileFragment (D19, EC-6, AC-11)', () => {
  it('slices only the exact path, merges duplicates, normalises headers', () => {
    const frag = extractFileFragment(diff, 'src/a.ts')!;
    expect(frag).not.toContain('a.tsx');
    expect(frag).not.toContain('b.ts');
    expect(frag.startsWith('diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3')).toBe(true);
    expect(frag).toContain('@@ -40,1 +41,2 @@'); // merged second section
    const parsed = parseUnifiedDiff(frag);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.hunks).toHaveLength(2);
    expect(extractFileFragment(diff, './src/a.ts')).toBe(frag);
  });
  it('returns null for unknown path or hunk-less section', () => {
    expect(extractFileFragment(diff, 'nope.ts')).toBeNull();
    expect(extractFileFragment({ raw: 'diff --git a/x b/x\nBinary files differ\n', files: [] }, 'x')).toBeNull();
  });
});

describe('buildCaseFromFinding (AC-3/4/6, EC-5/7, AC-11)', () => {
  it('accepted -> must_find; keeps only the finding file; truncates body; records source', () => {
    const r = buildCaseFromFinding(base());
    if (!r.ok) throw new Error('expected ok');
    const v = r.value;
    expect(v.expected_output).toEqual([
      { expect: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2, severity: 'CRITICAL', category: 'security', title: finding().title },
    ]);
    expect(v.name).toBe('hardcoded-stripe-secret-key-in-commit');
    expect(v.input_files).toEqual([{ path: 'src/a.ts', additions: 2, deletions: 0 }]);
    expect(v.input_meta.body).toHaveLength(4000);
    expect(v.input_meta.source).toEqual({ finding_id: 'f1', review_id: 'r1', agent_id: 'ag1', decision: 'accepted' });
    expect(v.source_finding_id).toBe('f1');
    expect(v.warnings).toEqual([]);
  });
  it('dismissed -> must_not_flag; name collision gets -2', () => {
    const r = buildCaseFromFinding(
      base({ decision: 'dismissed', existingNames: ['hardcoded-stripe-secret-key-in-commit'] }),
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.expected_output[0]!.expect).toBe('must_not_flag');
    expect(r.value.name).toBe('hardcoded-stripe-secret-key-in-commit-2');
  });
  it('warns when the finding line is outside every hunk (EC-5)', () => {
    const r = buildCaseFromFinding(base({ finding: finding({ start_line: 99, end_line: 99 }) }));
    expect(r.ok && r.value.warnings).toEqual(['finding_line_outside_fragment']);
  });
  it('rejects no patch, deleted-only, and > 256 KB', () => {
    expect(buildCaseFromFinding(base({ fragment: null }))).toEqual({ ok: false, reason: 'no_diff' });
    const del = extractFileFragment(diff, 'gone.ts');
    expect(
      buildCaseFromFinding(base({ fragment: del, parsedFragment: parseUnifiedDiff(del ?? '') })),
    ).toEqual({ ok: false, reason: 'no_diff' });
    expect(buildCaseFromFinding(base({ fragment: 'x'.repeat(262_145) }))).toEqual({ ok: false, reason: 'too_large' });
  });
});

describe('diff-input (AC-21, AC-22, EC-23, EC-24)', () => {
  it('normalises CRLF and validates', () => {
    expect(normalizeDiffText('a\r\nb\rc')).toBe('a\nb\nc');
    expect(validateDiffInput('', parseUnifiedDiff(''))[0]?.path).toBe('input_diff');
    expect(validateDiffInput('nonsense', parseUnifiedDiff('nonsense'))[0]?.message).toMatch(/no hunk/i);
    expect(validateDiffInput(RAW, diff)).toEqual([]);
    expect(validateDiffInput('x'.repeat(262_145), diff)[0]?.message).toMatch(/exceeds/);
  });
  it('derives input files and warns about missing expectation files', () => {
    expect(inputFilesFrom(diff).map((f) => f.path)).toEqual(['src/a.ts', 'src/a.tsx', 'src/b.ts', 'src/a.ts']);
    const w = expectationFileWarnings(
      [{ expect: 'must_find', file: './src/b.ts', start_line: 1 }, { expect: 'must_find', file: 'zzz.ts', start_line: 1 }],
      diff,
    );
    expect(w).toEqual([{ index: 1, path: '[1].file', message: 'file not in diff' }]);
  });
});
