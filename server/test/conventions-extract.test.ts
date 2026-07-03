import { describe, it, expect } from 'vitest';
import { verifyCandidate, type SampleFile } from '../src/modules/conventions/verify.js';
import { ConventionsService } from '../src/modules/conventions/service.js';
import type { ConventionsRepository, ConventionsRepoRef } from '../src/modules/conventions/repository.js';
import type { ConventionExtractionCandidate } from '../src/modules/conventions/schemas.js';
import type { ConventionRow } from '../src/db/rows.js';
import type { Container } from '../src/platform/container.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * Conventions extractor — unit tests (verification item #1 in
 * docs/conventions-extractor-plan.md). Hermetic: no Postgres, no clone. The
 * model is a MockLLMProvider fixture; the repository is a plain in-memory
 * fake swapped onto the service (mirrors `repo-intel-facade-degraded.test.ts`
 * / `repo-intel-resync.test.ts`'s "patch the private `repo` field" idiom).
 */

const SAMPLE_FILE: SampleFile = {
  path: 'src/utils/format.ts',
  content: [
    '// utils',
    'export function formatCurrency(value: number): string {',
    '  return `$${value.toFixed(2)}`;',
    '}',
    '',
  ].join('\n'),
};

describe('verifyCandidate (pure evidence check)', () => {
  it('keeps a candidate whose file/line/snippet genuinely match the sample', () => {
    const ok = verifyCandidate(
      {
        evidence_path: 'src/utils/format.ts',
        evidence_line_start: 2,
        evidence_line_end: 3,
        evidence_snippet: 'return `$${value.toFixed(2)}`;',
      },
      [SAMPLE_FILE],
    );
    expect(ok).toBe(true);
  });

  it('discards a candidate referencing a file not in the samples', () => {
    const ok = verifyCandidate(
      {
        evidence_path: 'src/utils/unknown.ts',
        evidence_line_start: 2,
        evidence_snippet: 'return `$${value.toFixed(2)}`;',
      },
      [SAMPLE_FILE],
    );
    expect(ok).toBe(false);
  });

  it('discards a candidate whose snippet does not appear in the file', () => {
    const ok = verifyCandidate(
      {
        evidence_path: 'src/utils/format.ts',
        evidence_line_start: 2,
        evidence_snippet: 'this text does not exist anywhere in the file',
      },
      [SAMPLE_FILE],
    );
    expect(ok).toBe(false);
  });

  it('discards a candidate with an out-of-range line number', () => {
    const ok = verifyCandidate(
      {
        evidence_path: 'src/utils/format.ts',
        evidence_line_start: 999,
        evidence_snippet: 'return `$${value.toFixed(2)}`;',
      },
      [SAMPLE_FILE],
    );
    expect(ok).toBe(false);
  });

  it('tolerates a small off-by-few line number (±3 slack)', () => {
    const ok = verifyCandidate(
      {
        evidence_path: 'src/utils/format.ts',
        evidence_line_start: 4, // actual snippet is on line 3, off by one
        evidence_snippet: 'return `$${value.toFixed(2)}`;',
      },
      [SAMPLE_FILE],
    );
    expect(ok).toBe(true);
  });

  it('matches anywhere in the file when no line numbers are given', () => {
    const ok = verifyCandidate(
      {
        evidence_path: 'src/utils/format.ts',
        evidence_snippet: 'export function formatCurrency',
      },
      [SAMPLE_FILE],
    );
    expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ConventionsService.extract — fakes for repository/container.
// ---------------------------------------------------------------------------

function fakeDb(settingsRows: { key: string; value: unknown }[] = []) {
  return {
    select: () => ({
      from: () => ({
        where: async () => settingsRows,
      }),
    }),
  };
}

function fakeContainer(opts: { configFiles?: Record<string, string>; sampleFiles?: SampleFile[]; llm: MockLLMProvider }): Container {
  return {
    db: fakeDb(),
    git: {
      readFile: async (_repo: unknown, path: string) => {
        if (opts.configFiles && path in opts.configFiles) return opts.configFiles[path];
        throw new Error(`ENOENT: ${path}`);
      },
    },
    repoIntel: {
      getConventionSampleFiles: async () => opts.sampleFiles ?? [],
    },
    llm: async () => opts.llm,
  } as unknown as Container;
}

/** In-memory fake repository — records inserts/deletes so re-scan behavior is assertable. */
function fakeRepo(initialRows: ConventionRow[] = [], repoRef?: ConventionsRepoRef) {
  let rows = [...initialRows];
  let nextId = 1;
  const impl = {
    async getRepoRef(): Promise<ConventionsRepoRef | undefined> {
      return repoRef ?? { owner: 'acme', name: 'widgets', clonePath: '/mock/clones/acme/widgets' };
    },
    async insertMany(
      workspaceId: string,
      repoId: string,
      candidates: ConventionExtractionCandidate[],
    ): Promise<ConventionRow[]> {
      const inserted = candidates.map(
        (c) =>
          ({
            id: `new-${nextId++}`,
            workspaceId,
            repoId,
            rule: c.rule,
            category: c.category,
            evidencePath: c.evidence_path,
            evidenceLineStart: c.evidence_line_start ?? null,
            evidenceLineEnd: c.evidence_line_end ?? null,
            evidenceSnippet: c.evidence_snippet,
            confidence: c.confidence,
            accepted: false,
            status: 'pending',
          }) as unknown as ConventionRow,
      );
      rows.push(...inserted);
      return inserted;
    },
    async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
      return rows.filter((r) => r.workspaceId === workspaceId && r.repoId === repoId);
    },
    async updateFields(): Promise<ConventionRow | undefined> {
      throw new Error('not used in these tests');
    },
    async deletePendingByRepo(workspaceId: string, repoId: string): Promise<void> {
      rows = rows.filter(
        (r) => !(r.workspaceId === workspaceId && r.repoId === repoId && r.status === 'pending'),
      );
    },
  };
  return { impl: impl as unknown as ConventionsRepository, getRows: () => rows };
}

function withFakeRepo(service: ConventionsService, repo: ConventionsRepository): ConventionsService {
  (service as unknown as { repo: ConventionsRepository }).repo = repo;
  return service;
}

describe('ConventionsService.extract', () => {
  it('persists a verified candidate as a pending row', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            {
              category: 'formatting',
              rule: 'Currency values are formatted with toFixed(2) and a $ prefix.',
              evidence_path: 'src/utils/format.ts',
              evidence_line_start: 2,
              evidence_line_end: 3,
              evidence_snippet: 'return `$${value.toFixed(2)}`;',
              confidence: 0.9,
            },
          ],
        },
      },
    });
    const container = fakeContainer({ sampleFiles: [SAMPLE_FILE], llm });
    const { impl, getRows } = fakeRepo();
    const service = withFakeRepo(new ConventionsService(container), impl);

    const result = await service.extract('ws1', 'repo1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rule: 'Currency values are formatted with toFixed(2) and a $ prefix.',
      status: 'pending',
      evidence_path: 'src/utils/format.ts',
    });
    expect(getRows()).toHaveLength(1);
    expect(getRows()[0]!.status).toBe('pending');
  });

  it('discards a candidate whose evidence file/line/snippet do not check out', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            {
              category: 'formatting',
              rule: 'A convention with fabricated evidence.',
              evidence_path: 'src/utils/does-not-exist.ts',
              evidence_line_start: 1,
              evidence_snippet: 'this snippet does not exist',
              confidence: 0.8,
            },
            {
              category: 'formatting',
              rule: 'A convention whose snippet does not match the real file.',
              evidence_path: 'src/utils/format.ts',
              evidence_line_start: 2,
              evidence_snippet: 'totally made up text',
              confidence: 0.8,
            },
          ],
        },
      },
    });
    const container = fakeContainer({ sampleFiles: [SAMPLE_FILE], llm });
    const { impl, getRows } = fakeRepo();
    const service = withFakeRepo(new ConventionsService(container), impl);

    const result = await service.extract('ws1', 'repo1');

    expect(result).toHaveLength(0);
    expect(getRows()).toHaveLength(0);
  });

  it('re-running extract replaces prior pending rows but leaves accepted/rejected rows untouched', async () => {
    const existingRows = [
      {
        id: 'accepted-1',
        workspaceId: 'ws1',
        repoId: 'repo1',
        rule: 'A previously accepted convention.',
        category: 'style',
        evidencePath: 'src/utils/format.ts',
        evidenceLineStart: 2,
        evidenceLineEnd: 3,
        evidenceSnippet: 'return `$${value.toFixed(2)}`;',
        confidence: 0.95,
        accepted: true,
        status: 'accepted',
      },
      {
        id: 'rejected-1',
        workspaceId: 'ws1',
        repoId: 'repo1',
        rule: 'A previously rejected convention.',
        category: 'style',
        evidencePath: 'src/utils/format.ts',
        evidenceLineStart: 2,
        evidenceLineEnd: 3,
        evidenceSnippet: 'return `$${value.toFixed(2)}`;',
        confidence: 0.4,
        accepted: false,
        status: 'rejected',
      },
      {
        id: 'stale-pending-1',
        workspaceId: 'ws1',
        repoId: 'repo1',
        rule: 'A stale pending convention from a prior scan.',
        category: 'style',
        evidencePath: 'src/utils/format.ts',
        evidenceLineStart: 2,
        evidenceLineEnd: 3,
        evidenceSnippet: 'return `$${value.toFixed(2)}`;',
        confidence: 0.5,
        accepted: false,
        status: 'pending',
      },
    ] as unknown as ConventionRow[];

    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            {
              category: 'formatting',
              rule: 'A freshly proposed convention.',
              evidence_path: 'src/utils/format.ts',
              evidence_line_start: 2,
              evidence_line_end: 3,
              evidence_snippet: 'return `$${value.toFixed(2)}`;',
              confidence: 0.9,
            },
          ],
        },
      },
    });
    const container = fakeContainer({ sampleFiles: [SAMPLE_FILE], llm });
    const { impl, getRows } = fakeRepo(existingRows);
    const service = withFakeRepo(new ConventionsService(container), impl);

    await service.extract('ws1', 'repo1');

    const rows = getRows();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId['accepted-1']).toBeDefined();
    expect(byId['rejected-1']).toBeDefined();
    expect(byId['stale-pending-1']).toBeUndefined(); // replaced
    const freshRows = rows.filter((r) => r.status === 'pending');
    expect(freshRows).toHaveLength(1);
    expect(freshRows[0]!.rule).toBe('A freshly proposed convention.');
  });
});
