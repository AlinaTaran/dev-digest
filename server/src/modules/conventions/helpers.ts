import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';

/** Map a persisted `conventions` row to the public `ConventionCandidate` DTO. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    category: row.category,
    evidence_path: row.evidencePath ?? '',
    evidence_line_start: row.evidenceLineStart,
    evidence_line_end: row.evidenceLineEnd,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status as ConventionCandidate['status'],
  };
}
