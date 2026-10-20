import { z } from 'zod';
import { BlastRadius, BlastCaller, DownstreamImpact, PrHistory } from './brief.js';

/** Mirrors repo-intel DegradedReason. */
export const BlastDegradedReason = z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

/** A direct (hop-1) caller. endpoints/crons = reach from this caller's file within bfs_depth hops. */
export const BlastCallerNode = BlastCaller.extend({
  rank: z.number(),
  endpoints: z.array(z.string()),
  crons: z.array(z.string()),
});
export type BlastCallerNode = z.infer<typeof BlastCallerNode>;

export const BlastDownstreamEntry = DownstreamImpact.extend({
  callers: z.array(BlastCallerNode),          // ≤ max_callers_per_symbol, rank DESC
  file: z.string(),                           // declaring file
  kind: z.string(),
  rank: z.number(),                           // max caller rank (0 on fallback)
  callers_total: z.number().int().nonnegative(), // distinct callers before the cap
  truncated: z.boolean(),                     // callers_total > callers.length
});
export type BlastDownstreamEntry = z.infer<typeof BlastDownstreamEntry>;

export const BlastStats = z.object({
  symbols: z.number().int().nonnegative(),
  callers: z.number().int().nonnegative(),
  endpoints: z.number().int().nonnegative(),
  crons: z.number().int().nonnegative(),
});
export type BlastStats = z.infer<typeof BlastStats>;

export const BlastRadiusResponse = BlastRadius.extend({
  downstream: z.array(BlastDownstreamEntry),  // sorted rank DESC, callers_total DESC, symbol ASC
  impacted_endpoints: z.array(z.string()),    // flat union (only source on the fallback path)
  stats: BlastStats,
  degraded: z.boolean(),
  reason: BlastDegradedReason.nullable(),
  max_callers_per_symbol: z.number().int().positive(), // = MAX_CALLERS_PER_SYMBOL
  bfs_depth: z.number().int().positive(),              // = BFS_DEPTH
  indexed_sha: z.string().nullable(),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;

export const PrHistoryReason = z.enum(['no_clone', 'shallow_history', 'git_failed']);
export type PrHistoryReason = z.infer<typeof PrHistoryReason>;

export const PrHistoryResponse = PrHistory.extend({
  degraded: z.boolean(),
  reason: PrHistoryReason.nullable(),
});
export type PrHistoryResponse = z.infer<typeof PrHistoryResponse>;
