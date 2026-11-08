import { EVAL_ALERT_DROP } from '@devdigest/shared';

export interface AlertMetrics {
  recall: number;
  precision: number;
  citation_accuracy: number;
}

const LABELS: [keyof AlertMetrics, string][] = [
  ['recall', 'Recall'],
  ['precision', 'Precision'],
  ['citation_accuracy', 'Citation accuracy'],
];

/**
 * AC-65: names every metric that dropped >= 2 points vs the previous finished run,
 * e.g. `Precision dipped 2pts on v7`. Pure template; `null` when nothing dipped.
 */
export function buildEvalAlert(
  last: AlertMetrics | null,
  previous: AlertMetrics | null,
  version: number,
): string | null {
  if (!last || !previous) return null;
  const parts: string[] = [];
  for (const [key, label] of LABELS) {
    // Round to avoid float noise (0.82 - 0.80 = 0.0199999...).
    const drop = Math.round((previous[key] - last[key]) * 1e6) / 1e6;
    if (drop >= EVAL_ALERT_DROP) {
      parts.push(`${label} dipped ${Math.round(drop * 100)}pts`);
    }
  }
  return parts.length === 0 ? null : `${parts.join(', ')} on v${version}`;
}
