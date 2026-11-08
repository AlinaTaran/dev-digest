import type { EvalDashboard, EvalSuiteRun, EvalTrendPoint } from '@devdigest/shared';
import { buildEvalAlert } from './core/index.js';

type Metrics = NonNullable<EvalSuiteRun['metrics']>;
type Finished = EvalSuiteRun & { metrics: Metrics };

const isFinished = (r: EvalSuiteRun): r is Finished =>
  (r.status === 'done' || r.status === 'partial') && r.metrics !== null;

const ZERO_CURRENT: EvalDashboard['current'] = {
  recall: 0,
  precision: 0,
  citation_accuracy: 0,
  traces_passed: 0,
  traces_total: 0,
  cost_usd: null,
};

/**
 * Pure composition of an agent dashboard from its runs in the period (any order).
 * Failed/running runs are excluded from trend, current and deltas (EC-17); the delta is
 * `current - previous finished` in fractions (0 with a single finished run).
 */
export function buildAgentDashboard(
  agentId: string,
  casesTotal: number,
  runs: EvalSuiteRun[],
): EvalDashboard {
  const finished = runs
    .filter(isFinished)
    .sort((a, b) => a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id));
  const last = finished.at(-1);
  const prev = finished.length > 1 ? finished[finished.length - 2]! : undefined;

  const trend: EvalTrendPoint[] = finished.map((r) => ({
    run_id: r.id,
    agent_version: r.agent_version,
    ran_at: r.started_at,
    recall: r.metrics.recall,
    precision: r.metrics.precision,
    citation_accuracy: r.metrics.citation_accuracy,
    pass_rate: r.metrics.traces_total > 0 ? r.metrics.traces_passed / r.metrics.traces_total : 0,
    cost_usd: r.metrics.cost_usd,
  }));

  const delta = (k: 'recall' | 'precision' | 'citation_accuracy') =>
    last && prev ? Math.round((last.metrics[k] - prev.metrics[k]) * 1e6) / 1e6 : 0;

  return {
    owner_kind: 'agent',
    owner_id: agentId,
    cases_total: casesTotal,
    current: last
      ? {
          recall: last.metrics.recall,
          precision: last.metrics.precision,
          citation_accuracy: last.metrics.citation_accuracy,
          traces_passed: last.metrics.traces_passed,
          traces_total: last.metrics.traces_total,
          cost_usd: last.metrics.cost_usd,
        }
      : ZERO_CURRENT,
    delta: { recall: delta('recall'), precision: delta('precision'), citation_accuracy: delta('citation_accuracy') },
    trend,
    recent_runs: [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at)),
    alert: last && prev ? buildEvalAlert(last.metrics, prev.metrics, last.agent_version) : null,
  };
}
