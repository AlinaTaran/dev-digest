import type { EvalCaseActualOutput, EvalExpectation, Finding } from '@devdigest/shared';
import { findingMatches } from './matching.js';

export interface DroppedFinding {
  finding: Finding;
  reason: string;
}

export interface ScoreCaseInput {
  expectations: EvalExpectation[];
  /** K: findings that survived the grounding gate. */
  kept: Finding[];
  /** D: findings the grounding gate dropped. */
  dropped: DroppedFinding[];
}

export interface CaseCounts {
  matchedFind: number;
  findTotal: number;
  /** Kept findings matching at least one must_find. */
  tpKept: number;
  keptTotal: number;
  droppedTotal: number;
}

export interface CaseScore {
  recall: number;
  precision: number;
  citation_accuracy: number;
  pass: boolean;
  expected_count: number;
  got_count: number;
  actual_output: EvalCaseActualOutput;
  counts: CaseCounts;
}

/** Zero denominator -> 1 (vacuous truth). Never NaN. */
export function ratio(num: number, den: number): number {
  return den === 0 ? 1 : num / den;
}

/** Engine finding id when present, else a deterministic `k<index>`. */
function verdictId(f: Finding, index: number): string {
  return f.id ? f.id : `k${index}`;
}

/**
 * Pure, deterministic case scoring (AC-28..AC-31, AC-34). No I/O, no model.
 * Strict precision: any kept finding matching no must_find is a false positive.
 */
export function scoreCase({ expectations, kept, dropped }: ScoreCaseInput): CaseScore {
  const ids = kept.map(verdictId);
  const findExpectations = expectations.filter((e) => e.expect === 'must_find');

  const expectationResults = expectations.map((exp, index) => {
    const matched_finding_ids = kept.flatMap((f, i) => (findingMatches(f, exp) ? [ids[i]!] : []));
    return { index, matched: matched_finding_ids.length > 0, matched_finding_ids };
  });

  const matchedFind = expectations.reduce(
    (n, exp, i) => n + (exp.expect === 'must_find' && expectationResults[i]!.matched ? 1 : 0),
    0,
  );

  let tpKept = 0;
  let hitMustNotFlag = false;
  const finding_verdicts = kept.map((f, i) => {
    const matchesFind = findExpectations.some((e) => findingMatches(f, e));
    const hits = expectations.some((e) => e.expect === 'must_not_flag' && findingMatches(f, e));
    if (matchesFind) tpKept += 1;
    if (hits) hitMustNotFlag = true;
    return {
      finding_id: ids[i]!,
      verdict: matchesFind ? ('tp' as const) : ('fp' as const),
      hit_must_not_flag: hits,
    };
  });

  const counts: CaseCounts = {
    matchedFind,
    findTotal: findExpectations.length,
    tpKept,
    keptTotal: kept.length,
    droppedTotal: dropped.length,
  };

  const pass =
    matchedFind === findExpectations.length && // clause 1
    !hitMustNotFlag && // clause 2
    (expectations.length > 0 || kept.length === 0); // clause 3

  return {
    recall: ratio(matchedFind, counts.findTotal),
    precision: ratio(tpKept, counts.keptTotal),
    citation_accuracy: ratio(counts.keptTotal, counts.keptTotal + counts.droppedTotal),
    pass,
    expected_count: findExpectations.length,
    got_count: kept.length,
    actual_output: {
      kept,
      dropped: dropped.map((d) => ({ finding: d.finding, reason: d.reason })),
      expectations: expectationResults,
      finding_verdicts,
    },
    counts,
  };
}
