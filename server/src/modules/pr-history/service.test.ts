import { describe, it, expect, vi } from 'vitest';
import { PrHistoryService } from './service.js';
import type { Container } from '../../platform/container.js';

type Commit = { sha: string; message: string; author: string; date: string };

const commit = (sha: string, message: string, date: string, author = 'git-author'): Commit => ({
  sha,
  message,
  author,
  date,
});

interface Opts {
  clonePath?: string | null;
  commits?: Commit[] | Error;
  changed?: Record<string, string[]>; // by sha
  files?: string[];
  dbRows?: { number: number; title: string; author: string; body: string | null }[];
  gh?: 'throws' | Record<number, { title: string; author: string; body?: string | null }>;
}

function setup(o: Opts) {
  const diffNameOnly = vi.fn(async (_r: unknown, _b: string, head: string) => o.changed?.[head] ?? []);
  const github = vi.fn(async () => {
    if (o.gh === 'throws') throw new Error('no token');
    return {
      getPullRequest: async (_r: unknown, n: number) => {
        const d = (o.gh as Record<number, { title: string; author: string; body?: string | null }> | undefined)?.[n];
        if (!d) throw new Error('404');
        return d;
      },
    };
  });
  const container = {
    db: {},
    reviewRepo: {
      getPull: async () => ({ id: 'pr1', repoId: 'repo1', number: 100 }),
      getRepo: async () =>
        o.clonePath === null ? { owner: 'o', name: 'r', clonePath: null } : { owner: 'o', name: 'r', clonePath: '/x' },
      getPrFiles: async () => (o.files ?? ['a.ts', 'a.ts']).map((path) => ({ path })),
    },
    git: {
      log: async () => {
        if (o.commits instanceof Error) throw o.commits;
        return o.commits ?? [];
      },
      diffNameOnly,
    },
    github,
    llm: () => {
      throw new Error('must not call llm');
    },
  } as unknown as Container;
  const service = new PrHistoryService(container);
  const findPullsByNumbers = vi.fn(async () => o.dbRows ?? []);
  service.repo = { findPullsByNumbers } as unknown as typeof service.repo;
  return { service, findPullsByNumbers, github, diffNameOnly };
}

describe('PrHistoryService.build', () => {
  it('excludes current PR, drops no-overlap, caps at 5, sorts by date, logs history.read', async () => {
    const commits: Commit[] = [commit('s0', 'Merge pull request #100 from x/y', '2026-10-09T00:00:00Z')];
    const changed: Record<string, string[]> = { s0: ['a.ts'] };
    for (let i = 1; i <= 7; i++) {
      commits.push(commit(`s${i}`, `feat ${i} (#${i})`, `2026-09-0${i}T00:00:00Z`));
      changed[`s${i}`] = ['a.ts'];
    }
    commits.push(commit('s9', 'other (#9)', '2026-08-01T00:00:00Z'));
    changed.s9 = ['zzz.ts'];
    const { service } = setup({ commits, changed });
    const info = vi.fn();
    const res = await service.build('ws1', 'pr1', { info });

    expect(res.degraded).toBe(false);
    expect(res.history.map((h) => h.pr_number)).toEqual([7, 6, 5, 4, 3]);
    expect(res.history[0]!.files_overlap).toEqual(['a.ts']);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ event: 'history.read', found: 5 }), expect.any(String));
  });

  it('prefers DB over GitHub over commit; github() throwing still yields items', async () => {
    const commits = [
      commit('s1', 'Merge pull request #1 from x/y', '2026-09-03T00:00:00Z', 'c1'),
      commit('s2', 'two (#2)', '2026-09-02T00:00:00Z', 'c2'),
      commit('s3', 'three (#3)', '2026-09-01T00:00:00Z', 'c3'),
    ];
    const changed = { s1: ['a.ts'], s2: ['a.ts'], s3: ['a.ts'] };
    const dbRows = [{ number: 1, title: 'DB title', author: 'dbuser', body: '\nDB notes\nmore' }];
    const gh = { 1: { title: 'GH1', author: 'gh1' }, 2: { title: 'GH title', author: 'ghuser', body: 'GH notes' } };
    const a = setup({ commits, changed, dbRows, gh });
    const r1 = (await a.service.build('ws1', 'pr1')).history;
    expect(r1[0]).toMatchObject({ pr_number: 1, title: 'DB title', author: 'dbuser', notes: 'DB notes' });
    expect(r1[1]).toMatchObject({ pr_number: 2, title: 'GH title', author: 'ghuser', notes: 'GH notes' });
    expect(r1[2]).toMatchObject({ pr_number: 3, title: 'three', author: 'c3', notes: '' });

    const b = setup({ commits, changed, dbRows, gh: 'throws' });
    const r2 = (await b.service.build('ws1', 'pr1')).history;
    expect(r2.map((h) => h.title)).toEqual(['DB title', 'two', 'three']);
  });

  it('degrades: no_clone, shallow_history, git_failed', async () => {
    expect((await setup({ clonePath: null }).service.build('ws1', 'pr1')).reason).toBe('no_clone');
    const shallow = setup({ commits: [commit('s1', 'x (#1)', '2026-09-01T00:00:00Z')] });
    expect(await shallow.service.build('ws1', 'pr1')).toEqual({ history: [], degraded: true, reason: 'shallow_history' });
    const failed = setup({ commits: new Error('boom') });
    expect((await failed.service.build('ws1', 'pr1')).reason).toBe('git_failed');
  });

  describe('GitHub enrichment', () => {
    const commits = [
      commit('s1', 'one (#1)', '2026-09-03T00:00:00Z'),
      commit('s2', 'two (#2)', '2026-09-02T00:00:00Z'),
    ];
    const changed = { s1: ['a.ts'], s2: ['a.ts'] };

    function withGetPr(getPullRequest: (r: unknown, n: number) => Promise<unknown>) {
      const t = setup({ commits, changed });
      (t.service as unknown as { container: { github: unknown } }).container.github = async () => ({
        getPullRequest,
      });
      return t.service;
    }

    it('starts all lookups before any resolves', async () => {
      const started: number[] = [];
      const resolvers: (() => void)[] = [];
      const service = withGetPr(
        (_r, n) =>
          new Promise((resolve) => {
            started.push(n);
            resolvers.push(() => resolve({ title: `GH${n}`, author: 'u' }));
          }),
      );
      const p = service.build('ws1', 'pr1');
      await vi.waitFor(() => expect(started.sort()).toEqual([1, 2]));
      resolvers.forEach((r) => r());
      expect((await p).history.map((h) => h.title)).toEqual(['GH1', 'GH2']);
    });

    it('one failing lookup does not drop the others', async () => {
      const service = withGetPr(async (_r, n) => {
        if (n === 1) throw new Error('404');
        return { title: 'GH2', author: 'u' };
      });
      const { history } = await service.build('ws1', 'pr1');
      expect(history.map((h) => h.title)).toEqual(['one', 'GH2']);
    });

    it('serves repeated builds from cache without re-calling getPullRequest', async () => {
      const getPullRequest = vi.fn(async (_r: unknown, n: number) => ({ title: `GH${n}`, author: 'u' }));
      const service = withGetPr(getPullRequest);
      await service.build('ws1', 'pr1');
      expect(getPullRequest).toHaveBeenCalledTimes(2);
      const second = await service.build('ws1', 'pr1');
      expect(getPullRequest).toHaveBeenCalledTimes(2);
      expect(second.history.map((h) => h.title)).toEqual(['GH1', 'GH2']);
    });
  });
});
