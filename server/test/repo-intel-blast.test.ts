import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { ResolvedCallerRow } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';

/**
 * Persistent-path blast: per-symbol cap, declaring-file exclusion, depth-2
 * endpoint reach, accurate degraded reasons + `source`. The service's `repo`
 * is patched (no Postgres), as in repo-intel-facade-degraded.test.ts.
 */

type Sym = { path: string; name: string; kind: string; line: number };
type Fact = { filePath: string; endpoints: string[]; crons: string[] };

function state(status: IndexState['status'], degradedReason?: IndexState['degradedReason']): IndexState {
  return {
    repoId: 'r1',
    status,
    filesIndexed: 1,
    filesSkipped: 0,
    durationMs: 0,
    lastIndexedSha: 'abc',
    indexerVersion: 2,
    updatedAt: new Date(0),
    degraded: status === 'degraded' || status === 'failed' ? true : undefined,
    degradedReason,
  };
}

function build(opts: {
  flag?: boolean;
  state?: IndexState | null;
  symbols?: Sym[];
  /** Resolved references: [fromPath, declFile, toSymbol, line, rank]. */
  refs?: [string, string, string, number, number][];
  facts?: Fact[];
}): RepoIntelService {
  const svc = new RepoIntelService({
    config: { repoIntelEnabled: opts.flag ?? true },
    db: {} as never,
    codeIndex: { symbols: async () => [], references: async () => [] } as never,
  } as never);
  const symbols = opts.symbols ?? [];
  const refs = opts.refs ?? [];
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => null,
    tryGetIndexState: async () => (opts.state === undefined ? state('full') : opts.state),
    getSymbolRows: async (_id: string, files: string[]) =>
      symbols.filter((s) => files.includes(s.path)),
    getResolvedCallers: async (_id: string, declFiles: string[], names: string[]) =>
      refs
        .filter(([, decl, to]) => declFiles.includes(decl) && names.includes(to))
        .map(([fromPath, declFile, toSymbol, line, rank]): ResolvedCallerRow => ({
          fromPath,
          declFile,
          toSymbol,
          line,
          rank,
        })),
    getFileFacts: async (_id: string, files: string[]) =>
      (opts.facts ?? []).filter((f) => files.includes(f.filePath)),
  };
  return svc;
}

const DECL = 'src/lib.ts';
const declSyms: Sym[] = [
  { path: DECL, name: 'A', kind: 'function', line: 1 },
  { path: DECL, name: 'B', kind: 'function', line: 20 },
];

describe('getBlastRadius — persistent index path', () => {
  it('(a) caps callers per symbol and reports uncapped totals', async () => {
    const refs: [string, string, string, number, number][] = [];
    for (let i = 0; i < 25; i += 1) refs.push([`src/a${i}.ts`, DECL, 'A', 1, i]);
    for (let i = 0; i < 3; i += 1) refs.push([`src/b${i}.ts`, DECL, 'B', 1, i]);
    const r = await build({ symbols: declSyms, refs }).getBlastRadius('r1', [DECL]);
    expect(r.callers.filter((c) => c.viaSymbol === 'A')).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(r.callers.filter((c) => c.viaSymbol === 'B')).toHaveLength(3);
    expect(r.callerTotals).toEqual({ A: 25, B: 3 });
    expect(r.source).toBe('index');
    expect(r.degraded).toBe(false);
  });

  it('(b) never returns a caller from the symbol’s own declaring file', async () => {
    const refs: [string, string, string, number, number][] = [
      [DECL, DECL, 'A', 5, 9],
      ['src/other.ts', DECL, 'A', 2, 1],
    ];
    const r = await build({ symbols: declSyms, refs }).getBlastRadius('r1', [DECL]);
    expect(r.callers.map((c) => c.file)).toEqual(['src/other.ts']);
    expect(r.callerTotals).toEqual({ A: 1 });
  });

  it('(c) reaches an endpoint two hops away (helper -> service -> route)', async () => {
    const symbols: Sym[] = [
      ...declSyms,
      { path: 'service.ts', name: 'doWork', kind: 'function', line: 1 },
      { path: 'routes.ts', name: 'register', kind: 'function', line: 1 },
    ];
    const refs: [string, string, string, number, number][] = [
      ['service.ts', DECL, 'A', 3, 1], // hop 1: doWork calls A
      ['routes.ts', 'service.ts', 'doWork', 4, 1], // hop 2: route handler calls doWork
    ];
    const facts: Fact[] = [{ filePath: 'routes.ts', endpoints: ['GET /x'], crons: ['0 * * * *'] }];
    const r = await build({ symbols, refs, facts }).getBlastRadius('r1', [DECL]);
    expect(r.callers.map((c) => c.file)).toEqual(['service.ts']);
    expect(r.impactBySymbol?.A?.endpoints).toEqual(['GET /x']);
    expect(r.impactBySymbol?.A?.crons).toEqual(['0 * * * *']);
    expect(r.impactByCallerFile?.['service.ts']?.endpoints).toEqual(['GET /x']);
    expect(r.impactedEndpoints).toEqual(['GET /x']);
    // hop-1 own facts stay empty: the endpoint is NOT attributed to service.ts directly.
    expect(r.factsByFile?.['service.ts']).toEqual({ endpoints: [], crons: [] });
  });

  it('(d) partial index → persistent data, degraded with index_partial', async () => {
    const refs: [string, string, string, number, number][] = [['src/o.ts', DECL, 'A', 2, 1]];
    const r = await build({ state: state('partial'), symbols: declSyms, refs }).getBlastRadius('r1', [DECL]);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe('index_partial');
    expect(r.source).toBe('index');
    expect(r.callers).toHaveLength(1);
  });
});

describe('getBlastRadius — fallback reasons', () => {
  it('(e) flag off → reason flag_off, source fallback', async () => {
    const r = await build({ flag: false }).getBlastRadius('r1', [DECL]);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe('flag_off');
    expect(r.source).toBe('fallback');
  });

  it('failed / degraded / absent index map to accurate reasons', async () => {
    const failed = await build({ state: state('failed', 'index_failed') }).getBlastRadius('r1', [DECL]);
    expect(failed.reason).toBe('index_failed');
    const big = await build({ state: state('degraded', 'repo_too_large') }).getBlastRadius('r1', [DECL]);
    expect(big.reason).toBe('repo_too_large');
    const none = await build({ state: null }).getBlastRadius('r1', [DECL]);
    expect(none.reason).toBe('no_data');
    expect(none.source).toBe('fallback');
  });

  it('never throws when the repository throws', async () => {
    const svc = build({});
    (svc as unknown as { repo: Record<string, unknown> }).repo.getSymbolRows = async () => {
      throw new Error('db down');
    };
    const r = await svc.getBlastRadius('r1', [DECL]);
    expect(r.degraded).toBe(true);
    expect(r.source).toBe('fallback');
  });
});
