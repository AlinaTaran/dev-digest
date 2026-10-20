import { describe, it, expect, vi } from 'vitest';
import { BlastService } from './service.js';
import { NotFoundError } from '../../platform/errors.js';
import type { Container } from '../../platform/container.js';
import type { BlastResult } from '../repo-intel/types.js';

/** Hermetic: fakes only reviewRepo + repoIntel; `llm` throws to prove it is never called. */
function setup(opts: {
  pull?: { repoId: string } | undefined;
  paths?: string[];
  result?: Partial<BlastResult>;
  state?: { status: string; lastIndexedSha?: string };
}) {
  const getBlastRadius = vi.fn(async (): Promise<BlastResult> => ({
    changedSymbols: [{ name: 'A', file: 'src/a.ts', kind: 'function' }],
    callers: [],
    impactedEndpoints: [],
    ...opts.result,
  }));
  const getIndexState = vi.fn(async () => opts.state ?? { status: 'full', lastIndexedSha: 'sha1' });
  const container = {
    reviewRepo: {
      getPull: vi.fn(async () => opts.pull),
      getPrFiles: vi.fn(async () => (opts.paths ?? []).map((path) => ({ path }))),
    },
    repoIntel: { getBlastRadius, getIndexState },
    llm: () => {
      throw new Error('BlastService must never call container.llm()');
    },
    github: () => {
      throw new Error('BlastService must never call container.github()');
    },
  } as unknown as Container;
  return { service: new BlastService(container), getBlastRadius, getIndexState };
}

describe('BlastService.build', () => {
  it('throws NotFoundError for an unknown PR and never calls repoIntel', async () => {
    const { service, getBlastRadius, getIndexState } = setup({ pull: undefined });
    await expect(service.build('ws1', 'pr1')).rejects.toBeInstanceOf(NotFoundError);
    expect(getBlastRadius).not.toHaveBeenCalled();
    expect(getIndexState).not.toHaveBeenCalled();
  });

  it('dedupes pr_files paths and takes repoId from the pull row', async () => {
    const { service, getBlastRadius, getIndexState } = setup({
      pull: { repoId: 'repo-from-pull' },
      paths: ['src/a.ts', 'src/b.ts', 'src/a.ts'],
    });
    const out = await service.build('ws1', 'pr1');
    expect(getBlastRadius).toHaveBeenCalledWith('repo-from-pull', ['src/a.ts', 'src/b.ts']);
    expect(getIndexState).toHaveBeenCalledWith('repo-from-pull');
    expect(out.indexed_sha).toBe('sha1');
    expect(out.max_callers_per_symbol).toBe(20);
    expect(out.bfs_depth).toBe(2);
  });

  it('logs blast.read_index once with the source', async () => {
    const { service } = setup({ pull: { repoId: 'r1' }, paths: ['src/a.ts'], result: { source: 'index' } });
    const info = vi.fn();
    await service.build('ws1', 'pr1', { info });
    expect(info).toHaveBeenCalledTimes(1);
    const [obj] = info.mock.calls[0]!;
    expect(obj).toMatchObject({ event: 'blast.read_index', prId: 'pr1', repoId: 'r1', source: 'index', files: 1 });
  });

  it('derives source=fallback when degraded and indexed_sha is null for a degraded state', async () => {
    const { service } = setup({
      pull: { repoId: 'r1' },
      result: { degraded: true, reason: 'no_data' },
      state: { status: 'degraded', lastIndexedSha: 'stale' },
    });
    const info = vi.fn();
    const out = await service.build('ws1', 'pr1', { info });
    expect(out.indexed_sha).toBeNull();
    expect(out.degraded).toBe(true);
    expect(info.mock.calls[0]![0]).toMatchObject({ source: 'fallback', reason: 'no_data' });
  });
});
