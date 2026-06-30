import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Finding } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { PriceBook } from '../../platform/price-book.js';
import * as t from '../../db/schema.js';

/** Per-PR review aggregate for the list endpoint (score ring, findings preview, cost). */
export interface PrReviewMeta {
  /** Worst (lowest) score across the PR's current per-agent reviews; null until reviewed. */
  score: number | null;
  /** Severity counts across those reviews; null until reviewed. */
  findings: { CRITICAL: number; WARNING: number; SUGGESTION: number } | null;
  /** Full findings across those reviews, for the list's hover preview; null until reviewed. */
  latestFindings: Finding[] | null;
  /** Cumulative cost across all the PR's done runs; null when no priced run exists. */
  costUsd: number | null;
}

type SeverityCounts = { CRITICAL: number; WARNING: number; SUGGESTION: number };

/**
 * SCORE + FINDINGS + cumulative COST per PR, computed on read (no FK denorm);
 * the list is small, so IN-queries + JS grouping is cheap. Returns a map keyed
 * by PR id — PRs with no review are simply absent (callers default to null).
 *
 * A PR's CURRENT review state = the latest review of EACH agent (re-runs create
 * new review rows; the newest per agent is "current"). We aggregate findings +
 * score across that set, not just the single most-recent review — otherwise a
 * PR whose last run happened to be a clean approve from one agent would hide
 * another agent's still-open findings.
 */
export async function loadPrReviewMeta(
  db: Db,
  priceBook: PriceBook,
  prIds: string[],
): Promise<Map<string, PrReviewMeta>> {
  const result = new Map<string, PrReviewMeta>();
  if (prIds.length === 0) return result;

  // 1. Current review per (pr, agent), and the PR's worst score across them.
  const currentReviewIdsByPr = new Map<string, string[]>();
  const scoreByPr = new Map<string, number | null>();
  const reviewRows = await db
    .select({ prId: t.reviews.prId, agentId: t.reviews.agentId, score: t.reviews.score, id: t.reviews.id })
    .from(t.reviews)
    .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
    .orderBy(desc(t.reviews.createdAt));
  // Newest-first → first seen per (pr, agent) is that agent's current review.
  const seenPrAgent = new Set<string>();
  for (const rv of reviewRows) {
    const agentKey = `${rv.prId}:${rv.agentId ?? 'null'}`;
    if (seenPrAgent.has(agentKey)) continue;
    seenPrAgent.add(agentKey);
    const ids = currentReviewIdsByPr.get(rv.prId) ?? [];
    ids.push(rv.id);
    currentReviewIdsByPr.set(rv.prId, ids);
    if (rv.score != null) {
      const prev = scoreByPr.get(rv.prId);
      scoreByPr.set(rv.prId, prev == null ? rv.score : Math.min(prev, rv.score));
    } else if (!scoreByPr.has(rv.prId)) {
      scoreByPr.set(rv.prId, null);
    }
  }

  // 2. Findings across each PR's current reviews: severity counts (badges) and
  //    the full findings (so the list can preview them on hover).
  const countsByReview = new Map<string, SeverityCounts>();
  const fullFindingsByReview = new Map<string, Finding[]>();
  const currentReviewIds = [...currentReviewIdsByPr.values()].flat();
  if (currentReviewIds.length > 0) {
    const findingRows = await db
      .select({
        reviewId: t.findings.reviewId,
        id: t.findings.id,
        severity: t.findings.severity,
        category: t.findings.category,
        title: t.findings.title,
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        rationale: t.findings.rationale,
        confidence: t.findings.confidence,
        kind: t.findings.kind,
      })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, currentReviewIds));
    for (const f of findingRows) {
      const counts = countsByReview.get(f.reviewId) ?? { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
      const sev = f.severity as 'CRITICAL' | 'WARNING' | 'SUGGESTION';
      if (sev === 'CRITICAL' || sev === 'WARNING' || sev === 'SUGGESTION') {
        counts[sev]++;
      }
      countsByReview.set(f.reviewId, counts);

      const list = fullFindingsByReview.get(f.reviewId) ?? [];
      list.push({
        id: f.id,
        severity: f.severity as Finding['severity'],
        category: f.category as Finding['category'],
        title: f.title,
        file: f.file,
        start_line: f.startLine,
        end_line: f.endLine,
        rationale: f.rationale,
        confidence: f.confidence,
        kind: f.kind as Finding['kind'],
      });
      fullFindingsByReview.set(f.reviewId, list);
    }
  }

  // 3. Cumulative cost per PR: sum the resolved cost over all done runs.
  const costByPr = new Map<string, number>();
  const runRows = await db
    .select({
      prId: t.agentRuns.prId,
      costUsd: t.agentRuns.costUsd,
      model: t.agentRuns.model,
      tokensIn: t.agentRuns.tokensIn,
      tokensOut: t.agentRuns.tokensOut,
    })
    .from(t.agentRuns)
    .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')));
  for (const run of runRows) {
    if (!run.prId) continue;
    const c = priceBook.resolve(run.costUsd, run.model, run.tokensIn, run.tokensOut);
    if (c == null) continue;
    costByPr.set(run.prId, (costByPr.get(run.prId) ?? 0) + c);
  }

  for (const prId of prIds) {
    const reviewIds = currentReviewIdsByPr.get(prId) ?? [];
    const reviewed = reviewIds.length > 0;
    const costUsd = costByPr.has(prId) ? costByPr.get(prId)! : null;
    if (!reviewed) {
      if (costUsd != null) {
        result.set(prId, { score: null, findings: null, latestFindings: null, costUsd });
      }
      continue;
    }
    const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    const list: Finding[] = [];
    for (const rid of reviewIds) {
      const c = countsByReview.get(rid);
      if (c) {
        counts.CRITICAL += c.CRITICAL;
        counts.WARNING += c.WARNING;
        counts.SUGGESTION += c.SUGGESTION;
      }
      const fl = fullFindingsByReview.get(rid);
      if (fl) list.push(...fl);
    }
    result.set(prId, {
      score: scoreByPr.get(prId) ?? null,
      findings: counts,
      latestFindings: list,
      costUsd,
    });
  }

  return result;
}
