import { describe, it, expect } from 'vitest';
import { SmartDiffService } from './service.js';
import type { Container } from '../../platform/container.js';
import type { PullRow, FindingRow } from '../../db/rows.js';

/**
 * Hermetic unit tests — no Postgres, no clone. Fakes only `container.reviewRepo`
 * (mirrors the `conventions-extract.test.ts` "in-memory fake swapped onto the
 * service" idiom). `llm` throws if invoked, proving the service never calls it.
 */

type PrFileRow = { id: string; prId: string; path: string; additions: number; deletions: number; patch: string | null };

function fakePull(): PullRow {
  return { id: 'pr1', workspaceId: 'ws1' } as unknown as PullRow;
}

function fakeFinding(overrides: Partial<FindingRow>): FindingRow {
  return {
    id: 'f1',
    reviewId: 'r1',
    file: 'src/core.ts',
    startLine: 10,
    endLine: 12,
    severity: 'CRITICAL',
    category: 'bug',
    title: 't',
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifectaComponents: null,
    ...overrides,
  } as unknown as FindingRow;
}

function fakeContainer(opts: {
  pull?: PullRow | undefined;
  files: PrFileRow[];
  reviews: { review: { id: string }; findings: FindingRow[] }[];
}): Container {
  return {
    reviewRepo: {
      getPull: async () => opts.pull,
      getPrFiles: async () => opts.files,
      reviewsForPull: async () => opts.reviews,
    },
    llm: () => {
      throw new Error('SmartDiffService must never call container.llm()');
    },
  } as unknown as Container;
}

describe('SmartDiffService.build', () => {
  it('throws NotFoundError when the pull does not exist / is out of workspace scope', async () => {
    const container = fakeContainer({ pull: undefined, files: [], reviews: [] });
    const service = new SmartDiffService(container);

    await expect(service.build('ws1', 'missing-pr')).rejects.toThrow();
  });

  it('groups core -> wiring -> boilerplate, maps finding_lines from the latest review only, and never calls llm()', async () => {
    const files: PrFileRow[] = [
      { id: '1', prId: 'pr1', path: 'package-lock.json', additions: 50, deletions: 10, patch: null },
      { id: '2', prId: 'pr1', path: 'src/config.ts', additions: 5, deletions: 1, patch: null },
      { id: '3', prId: 'pr1', path: 'src/core.ts', additions: 20, deletions: 5, patch: null },
      { id: '4', prId: 'pr1', path: 'src/other.ts', additions: 100, deletions: 0, patch: null },
    ];
    const latestFindings = [
      fakeFinding({ file: 'src/core.ts', startLine: 10 }),
      fakeFinding({ file: 'src/core.ts', startLine: 10 }), // duplicate line, same file
      fakeFinding({ file: 'src/core.ts', startLine: 20 }),
    ];
    const staleFindings = [fakeFinding({ file: 'src/other.ts', startLine: 1 })];
    const reviews = [
      { review: { id: 'latest' }, findings: latestFindings },
      { review: { id: 'stale' }, findings: staleFindings },
    ];
    const container = fakeContainer({ pull: fakePull(), files, reviews });
    const service = new SmartDiffService(container);

    const result = await service.build('ws1', 'pr1');

    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);

    const coreGroup = result.groups.find((g) => g.role === 'core')!;
    // core.ts has findings, so it must sort ahead of other.ts (which has none from the latest review)
    expect(coreGroup.files.map((f) => f.path)).toEqual(['src/core.ts', 'src/other.ts']);
    const coreFile = coreGroup.files.find((f) => f.path === 'src/core.ts')!;
    expect(coreFile.finding_lines).toEqual([10, 20]); // deduped + ascending, latest review only
    const otherFile = coreGroup.files.find((f) => f.path === 'src/other.ts')!;
    expect(otherFile.finding_lines).toEqual([]); // stale review's finding must not leak in
    expect(coreFile.pseudocode_summary).toBeNull();

    const wiringGroup = result.groups.find((g) => g.role === 'wiring')!;
    expect(wiringGroup.files.map((f) => f.path)).toEqual(['src/config.ts']);

    const boilerplateGroup = result.groups.find((g) => g.role === 'boilerplate')!;
    expect(boilerplateGroup.files.map((f) => f.path)).toEqual(['package-lock.json']);
  });

  it('flags too_big and proposes one split per non-empty group when total lines exceed the threshold', async () => {
    const files: PrFileRow[] = [
      { id: '1', prId: 'pr1', path: 'src/core.ts', additions: 300, deletions: 50, patch: null },
      { id: '2', prId: 'pr1', path: 'package-lock.json', additions: 40, deletions: 20, patch: null },
    ];
    const container = fakeContainer({ pull: fakePull(), files, reviews: [] });
    const service = new SmartDiffService(container);

    const result = await service.build('ws1', 'pr1');

    expect(result.split_suggestion.total_lines).toBe(410);
    expect(result.split_suggestion.too_big).toBe(true);
    expect(result.split_suggestion.proposed_splits).toEqual([
      { name: 'core', files: ['src/core.ts'] },
      { name: 'boilerplate', files: ['package-lock.json'] },
    ]);
  });

  it('stays under the threshold and proposes no splits for a small PR', async () => {
    const files: PrFileRow[] = [
      { id: '1', prId: 'pr1', path: 'src/core.ts', additions: 10, deletions: 5, patch: null },
    ];
    const container = fakeContainer({ pull: fakePull(), files, reviews: [] });
    const service = new SmartDiffService(container);

    const result = await service.build('ws1', 'pr1');

    expect(result.split_suggestion.too_big).toBe(false);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });

  it('merges multiple pr_files rows for the same path into one file entry (PR #2 CLAUDE.md case)', async () => {
    const files: PrFileRow[] = [
      { id: '1', prId: 'pr1', path: 'CLAUDE.md', additions: 1, deletions: 0, patch: '@@ a @@' },
      { id: '2', prId: 'pr1', path: 'CLAUDE.md', additions: 0, deletions: 61, patch: '@@ b @@' },
      { id: '3', prId: 'pr1', path: 'src/core.ts', additions: 3, deletions: 0, patch: null },
    ];
    const container = fakeContainer({ pull: fakePull(), files, reviews: [] });
    const service = new SmartDiffService(container);

    const result = await service.build('ws1', 'pr1');

    const allFiles = result.groups.flatMap((g) => g.files);
    // No path appears twice → safe as the client's React keys.
    expect(new Set(allFiles.map((f) => f.path)).size).toBe(allFiles.length);
    const claude = allFiles.find((f) => f.path === 'CLAUDE.md')!;
    expect(claude.additions).toBe(1); // 1 + 0
    expect(claude.deletions).toBe(61); // 0 + 61
    // total_lines still counts every fragment's lines (sum is unchanged by merging).
    expect(result.split_suggestion.total_lines).toBe(1 + 61 + 3);
  });

  it('handles a PR with no reviews yet: all finding_lines empty, layout still valid', async () => {
    const files: PrFileRow[] = [
      { id: '1', prId: 'pr1', path: 'src/core.ts', additions: 10, deletions: 5, patch: null },
      { id: '2', prId: 'pr1', path: 'package-lock.json', additions: 1, deletions: 1, patch: null },
    ];
    const container = fakeContainer({ pull: fakePull(), files, reviews: [] });
    const service = new SmartDiffService(container);

    const result = await service.build('ws1', 'pr1');

    for (const group of result.groups) {
      for (const file of group.files) {
        expect(file.finding_lines).toEqual([]);
      }
    }
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'boilerplate']);
  });
});
