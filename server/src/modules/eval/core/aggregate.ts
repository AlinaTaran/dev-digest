import type { EvalCaseError, EvalRun, EvalSuiteRunStatus } from '@devdigest/shared';
import { ratio, type CaseCounts } from './scoring.js';

export interface AggregateCaseResult {
  name: string;
  pass: boolean;
  /** Non-null when the case errored; such cases are excluded from metrics (AC-32/AC-40). */
  error: EvalCaseError | null;
  /** Scoring counts; ignored for errored cases. */
  counts: CaseCounts | null;
  cost_usd: number | null;
  expected?: unknown;
  actual?: unknown;
}

export interface AggregateRunOutput {
  status: Exclude<EvalSuiteRunStatus, 'running'>;
  cases_errored: number;
  /** `null` when every case errored (or there were none) (AC-41). */
  metrics: EvalRun | null;
}

/** Null-poisoning sum: one unknown cost makes the total unknown. */
export function sumCost(costs: (number | null)[]): number | null {
  let total = 0;
  for (const c of costs) {
    if (c === null) return null;
    total += c;
  }
  return total;
}

/**
 * Micro-average over non-error results (AC-32). `traces_total` counts all cases.
 * Pure; never yields NaN (zero denominator -> 1).
 */
export function aggregateRun(results: AggregateCaseResult[], durationMs = 0): AggregateRunOutput {
  const scored = results.filter((r) => r.error === null && r.counts !== null);
  const cases_errored = results.length - scored.length;

  if (scored.length === 0) {
    return { status: 'failed', cases_errored, metrics: null };
  }

  let matchedFind = 0;
  let findTotal = 0;
  let tpKept = 0;
  let keptTotal = 0;
  let droppedTotal = 0;
  for (const r of scored) {
    const c = r.counts!;
    matchedFind += c.matchedFind;
    findTotal += c.findTotal;
    tpKept += c.tpKept;
    keptTotal += c.keptTotal;
    droppedTotal += c.droppedTotal;
  }

  const metrics: EvalRun = {
    recall: ratio(matchedFind, findTotal),
    precision: ratio(tpKept, keptTotal),
    citation_accuracy: ratio(keptTotal, keptTotal + droppedTotal),
    traces_passed: results.filter((r) => r.pass && r.error === null).length,
    traces_total: results.length,
    duration_ms: Math.max(0, Math.round(durationMs)),
    cost_usd: sumCost(results.map((r) => r.cost_usd)),
    per_trace: results.map((r) => ({
      name: r.name,
      pass: r.pass && r.error === null,
      expected: r.expected ?? null,
      actual: r.actual ?? null,
    })),
  };

  return { status: cases_errored > 0 ? 'partial' : 'done', cases_errored, metrics };
}
