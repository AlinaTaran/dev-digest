import type { UseCaseDeps } from '../ports';
import { resolvePr, resolveRepo } from '../resolve';
import type { Blast, BlastRadiusResult, BlastSymbolOut } from '../types';

/** MCP-only output budget for changed symbols (the API does not cap this). */
const MAX_SYMBOLS = 30;
/** MCP-only output budget for callers per symbol; the API-reported cap can only lower it. */
const DEFAULT_MAX_CALLERS = 20;
/** MCP-only output budget for endpoints/crons per symbol and for impacted_endpoints. */
const MAX_LIST_ITEMS = 50;

export interface GetBlastRadiusInput {
  repo: string;
  pr: number;
}

export type GetBlastRadius = (
  input: GetBlastRadiusInput,
  signal?: AbortSignal,
) => Promise<BlastRadiusResult>;

/** Callers are capped at the smaller of the API cap and the MCP budget; lists at MAX_LIST_ITEMS. */
function toSymbol(d: Blast['downstream'][number], maxCallers: number | null): BlastSymbolOut {
  const callerCap = Math.min(maxCallers ?? DEFAULT_MAX_CALLERS, DEFAULT_MAX_CALLERS);
  return {
    name: d.symbol,
    kind: d.kind,
    file: d.file,
    callers_total: d.callers_total,
    callers: d.callers
      .slice(0, callerCap)
      .map((c) => ({ name: c.name, at: `${c.file}:${c.line}` })),
    endpoints: d.endpoints_affected.slice(0, MAX_LIST_ITEMS),
    crons: d.crons_affected.slice(0, MAX_LIST_ITEMS),
  };
}

/** Server order is kept (rank DESC); stats are passed through so they equal the UI. */
export function createGetBlastRadius({ api }: UseCaseDeps): GetBlastRadius {
  return async (input, signal) => {
    const repo = await resolveRepo(api, input.repo, signal);
    const pull = await resolvePr(api, repo, input.pr, signal);
    const blast = await api.getBlast(pull.id, signal);

    const truncated =
      blast.downstream.length > MAX_SYMBOLS ||
      blast.impacted_endpoints.length > MAX_LIST_ITEMS ||
      blast.downstream.some(
        (d) => d.endpoints_affected.length > MAX_LIST_ITEMS || d.crons_affected.length > MAX_LIST_ITEMS,
      );
    const result: BlastRadiusResult = {
      repo: repo.full_name,
      pr: pull.number,
      degraded: blast.degraded,
      reason: blast.reason,
      stats: blast.stats,
      symbols: blast.downstream.slice(0, MAX_SYMBOLS).map((d) => toSymbol(d, blast.max_callers_per_symbol)),
      impacted_endpoints: blast.impacted_endpoints.slice(0, MAX_LIST_ITEMS),
      truncated,
    };
    // One hint per result: an incomplete index is the more actionable one.
    if (blast.degraded) {
      result.hint = {
        code: 'BLAST_DEGRADED',
        repo: repo.full_name,
        repo_id: repo.id,
        pr: pull.number,
        reason: blast.reason,
      };
    } else if (truncated) {
      result.hint = { code: 'BLAST_TRUNCATED', shown: Math.min(MAX_SYMBOLS, blast.downstream.length), total: blast.downstream.length };
    }
    return result;
  };
}
