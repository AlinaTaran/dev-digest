import { formatLine, truncate } from '../findings';
import type { UseCaseDeps } from '../ports';
import { resolveRepo } from '../resolve';
import type { Convention, ConventionOut, ConventionsResult } from '../types';

const DEFAULT_LIMIT = 50;
const RULE_MAX = 300;

export interface GetConventionsInput {
  repo: string;
  category?: string;
  /** Default 50 (1-100), applied by the use case. */
  limit?: number;
}

export type GetConventions = (
  input: GetConventionsInput,
  signal?: AbortSignal,
) => Promise<ConventionsResult>;

function toOut(c: Convention): ConventionOut {
  const line = formatLine(c.evidence_line_start, c.evidence_line_end);
  return {
    rule: truncate(c.rule, RULE_MAX),
    category: c.category,
    evidence: line === undefined ? c.evidence_path : `${c.evidence_path}:${line}`,
  };
}

/** Accepted conventions only (never the evidence snippet), sorted by category then rule. */
export function createGetConventions({ api }: UseCaseDeps): GetConventions {
  return async (input, signal) => {
    const repo = await resolveRepo(api, input.repo, signal);
    const all = await api.listConventions(repo.id, signal);
    const accepted = all.filter((c) => c.status === 'accepted');
    const pending = all.filter((c) => c.status === 'pending').length;

    const wanted = input.category?.trim().toLowerCase();
    const matched = (wanted ? accepted.filter((c) => c.category.toLowerCase() === wanted) : accepted)
      .map(toOut)
      .sort((a, b) => a.category.localeCompare(b.category) || a.rule.localeCompare(b.rule));

    const conventions = matched.slice(0, input.limit ?? DEFAULT_LIMIT);
    const result: ConventionsResult = {
      repo: repo.full_name,
      conventions,
      count: conventions.length,
      total_accepted: accepted.length,
      pending,
      truncated: matched.length > conventions.length,
    };
    if (accepted.length === 0) result.hint = { code: 'NO_CONVENTIONS', repo: repo.full_name, pending };
    return result;
  };
}
