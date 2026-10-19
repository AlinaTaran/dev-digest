import type {
  BlastCallerNode,
  BlastDownstreamEntry,
  BlastRadiusResponse,
  ChangedSymbol,
} from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

export interface MapBlastOpts {
  maxCallersPerSymbol: number;
  bfsDepth: number;
  indexedSha: string | null;
}

type Impact = { endpoints: string[]; crons: string[] };

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort(cmp);

/**
 * Pure mapper: flat repo-intel `BlastResult` -> grouped `BlastRadiusResponse`.
 * Deterministic (no LLM, no I/O); the summary line is built here, not by a model.
 */
export function mapBlast(r: BlastResult, opts: MapBlastOpts): BlastRadiusResponse {
  // 1. Dedupe changed symbols by file:name, sorted by file then name.
  const changedByKey = new Map<string, ChangedSymbol>();
  for (const s of r.changedSymbols) {
    const key = `${s.file}:${s.name}`;
    if (!changedByKey.has(key)) changedByKey.set(key, { name: s.name, file: s.file, kind: s.kind });
  }
  const changed = [...changedByKey.values()].sort((a, b) => cmp(a.file, b.file) || cmp(a.name, b.name));

  // 2. Declaring files per symbol name; first declaration wins for file/kind.
  const declFilesByName = new Map<string, Set<string>>();
  const firstDecl = new Map<string, ChangedSymbol>();
  for (const s of changed) {
    const set = declFilesByName.get(s.name) ?? new Set<string>();
    set.add(s.file);
    declFilesByName.set(s.name, set);
    if (!firstDecl.has(s.name)) firstDecl.set(s.name, s);
  }

  // 3. Group callers by viaSymbol.
  const rowsByName = new Map<string, BlastResult['callers']>();
  for (const c of r.callers) {
    const list = rowsByName.get(c.viaSymbol) ?? [];
    list.push(c);
    rowsByName.set(c.viaSymbol, list);
  }

  const emptyImpact = (): Impact => ({ endpoints: [], crons: [] });
  const downstream: BlastDownstreamEntry[] = [];

  for (const [name, decl] of firstDecl) {
    const declFiles = declFilesByName.get(name) ?? new Set<string>();
    const seen = new Set<string>();
    const rows = (rowsByName.get(name) ?? [])
      .filter((c) => !declFiles.has(c.file))
      .filter((c) => {
        const key = `${c.file}:${c.line}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.rank - a.rank || cmp(a.file, b.file) || a.line - b.line);

    const shownRows = rows.slice(0, opts.maxCallersPerSymbol);
    const callers: BlastCallerNode[] = shownRows.map((c) => {
      const facts: Impact = r.impactByCallerFile?.[c.file] ?? r.factsByFile?.[c.file] ?? emptyImpact();
      return {
        name: c.symbol,
        file: c.file,
        line: c.line,
        rank: c.rank,
        endpoints: uniqSorted(facts.endpoints),
        crons: uniqSorted(facts.crons),
      };
    });

    const callersTotal = Math.max(r.callerTotals?.[name] ?? 0, rows.length);
    const symbolImpact = r.impactBySymbol?.[name];
    const endpointsAffected = uniqSorted(symbolImpact?.endpoints ?? callers.flatMap((c) => c.endpoints));
    const cronsAffected = uniqSorted(symbolImpact?.crons ?? callers.flatMap((c) => c.crons));

    downstream.push({
      symbol: name,
      file: decl.file,
      kind: decl.kind,
      rank: shownRows.reduce((m, c) => Math.max(m, c.rank), 0),
      callers,
      callers_total: callersTotal,
      truncated: callersTotal > callers.length,
      endpoints_affected: endpointsAffected,
      crons_affected: cronsAffected,
    });
  }

  downstream.sort((a, b) => b.rank - a.rank || b.callers_total - a.callers_total || cmp(a.symbol, b.symbol));

  const impactedEndpoints = uniqSorted([...r.impactedEndpoints, ...downstream.flatMap((d) => d.endpoints_affected)]);
  const crons = uniqSorted(downstream.flatMap((d) => d.crons_affected));
  const stats = {
    symbols: changed.length,
    callers: downstream.reduce((n, d) => n + d.callers_total, 0),
    endpoints: impactedEndpoints.length,
    crons: crons.length,
  };
  const degraded = r.degraded ?? false;

  return {
    changed_symbols: changed,
    downstream,
    impacted_endpoints: impactedEndpoints,
    summary: `${stats.symbols} changed symbol(s), ${stats.callers} caller(s), ${stats.endpoints} endpoint(s), ${stats.crons} cron(s)`,
    stats,
    degraded,
    reason: r.reason ?? (degraded ? 'no_data' : null),
    max_callers_per_symbol: opts.maxCallersPerSymbol,
    bfs_depth: opts.bfsDepth,
    indexed_sha: opts.indexedSha,
  };
}
