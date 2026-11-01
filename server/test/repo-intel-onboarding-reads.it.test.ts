/**
 * Onboarding Tour facade reads (getIndexedFiles / getFanIn / getEndpointFacts)
 * against real Postgres. Data source for AC-17/18/25/30.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('repo-intel onboarding reads', () => {
  let pg: PgFixture;
  let svc: RepoIntelService;
  let withRank: string;
  let symbolsOnly: string;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    const mk = async (name: string) => {
      const [r] = await db
        .insert(t.repos)
        .values({ workspaceId: ws!.id, owner: 'acme', name, fullName: `acme/${name}` })
        .returning();
      return r!.id;
    };
    withRank = await mk('ranked');
    symbolsOnly = await mk('symbols-only');

    const rank = (filePath: string, r: number) => ({
      repoId: withRank,
      filePath,
      pagerank: r,
      hotness: 0,
      rank: r,
      percentile: 50,
    });
    await db.insert(t.fileRank).values([rank('src/a.ts', 0.5), rank('src/b.ts', 0.3), rank('src/c.ts', 0.2)]);
    await db.insert(t.fileEdges).values([
      { repoId: withRank, fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { repoId: withRank, fromFile: 'src/c.ts', toFile: 'src/b.ts' },
      { repoId: withRank, fromFile: 'src/a.ts', toFile: 'src/c.ts' },
    ]);
    await db.insert(t.fileFacts).values([
      { repoId: withRank, filePath: 'src/routes/x.ts', endpoints: ['GET /x', 'POST /x'], crons: [] },
      { repoId: withRank, filePath: 'src/routes/y.ts', endpoints: ['GET /y'], crons: [] },
      { repoId: withRank, filePath: 'src/none.ts', endpoints: [], crons: [] },
    ]);
    const sym = (path: string, name: string) => ({
      repoId: symbolsOnly,
      path,
      name,
      kind: 'function',
      line: 1,
      endLine: 2,
      exported: true,
      signature: null,
      contentHash: 'h',
    });
    await db.insert(t.symbols).values([sym('lib/p.ts', 'one'), sym('lib/p.ts', 'two'), sym('lib/q.ts', 'three')]);

    svc = new RepoIntelService({ config: { repoIntelEnabled: true }, db } as never);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('getIndexedFiles: file_rank when present, distinct symbol paths when rank is empty', async () => {
    expect((await svc.getIndexedFiles(withRank)).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect((await svc.getIndexedFiles(symbolsOnly)).sort()).toEqual(['lib/p.ts', 'lib/q.ts']);
  });

  it('getFanIn: counts importers; a file with 0 importers is absent', async () => {
    const m = await svc.getFanIn(withRank, ['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(m.get('src/b.ts')).toBe(2);
    expect(m.get('src/c.ts')).toBe(1);
    expect(m.has('src/a.ts')).toBe(false);
    expect((await svc.getFanIn(withRank, [])).size).toBe(0);
  });

  it('getEndpointFacts: skips files without endpoints and honours the limit', async () => {
    const all = await svc.getEndpointFacts(withRank, 10);
    expect(all.map((f) => f.path)).toEqual(['src/routes/x.ts', 'src/routes/y.ts']);
    expect(all[0]!.endpoints).toEqual(['GET /x', 'POST /x']);
    expect(await svc.getEndpointFacts(withRank, 1)).toHaveLength(1);
  });

  it('returns empty results when repo-intel is disabled', async () => {
    const off = new RepoIntelService({ config: { repoIntelEnabled: false }, db: pg.handle.db } as never);
    expect(await off.getIndexedFiles(withRank)).toEqual([]);
    expect((await off.getFanIn(withRank, ['src/b.ts'])).size).toBe(0);
    expect(await off.getEndpointFacts(withRank, 5)).toEqual([]);
  });
});
