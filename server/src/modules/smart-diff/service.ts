import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { classifyFile } from './classify.js';
import { TOO_BIG_TOTAL_LINES } from './constants.js';

/** Role ordering: core (review closely) → wiring → boilerplate (skim). */
const ROLE_ORDER: SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];

/**
 * Smart Diff service — a deterministic re-composition of data already in the
 * DB (`pr_files` + the latest review's findings). Makes ZERO `container.llm()`
 * calls and no GitHub fetch: the expensive LLM call already happened when the
 * review ran; this only reorders/groups what's already there.
 */
export class SmartDiffService {
  constructor(private container: Container) {}

  async build(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.container.reviewRepo.getPrFiles(prId);
    const reviews = await this.container.reviewRepo.reviewsForPull(prId);
    const findings = reviews[0]?.findings ?? [];

    const findingLinesByPath = new Map<string, number[]>();
    const findingCountByPath = new Map<string, number>();
    for (const f of findings) {
      findingCountByPath.set(f.file, (findingCountByPath.get(f.file) ?? 0) + 1);
      const lines = findingLinesByPath.get(f.file) ?? [];
      lines.push(f.startLine);
      findingLinesByPath.set(f.file, lines);
    }

    // `pr_files` is not guaranteed unique per path — an import can emit several
    // diff fragments for one file (PR #2 carries two `CLAUDE.md` rows). Merge by
    // path so each file appears once (the client keys diff cards by path, and a
    // file belongs in one group), summing the +/- stats. First-seen order kept.
    const mergedByPath = new Map<string, { additions: number; deletions: number }>();
    const pathOrder: string[] = [];
    for (const file of files) {
      const prev = mergedByPath.get(file.path);
      if (prev) {
        prev.additions += file.additions;
        prev.deletions += file.deletions;
      } else {
        mergedByPath.set(file.path, { additions: file.additions, deletions: file.deletions });
        pathOrder.push(file.path);
      }
    }

    const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
    for (const path of pathOrder) {
      const merged = mergedByPath.get(path)!;
      const role = classifyFile(path);
      const smartFile: SmartDiffFile = {
        path,
        pseudocode_summary: null,
        additions: merged.additions,
        deletions: merged.deletions,
        finding_lines: dedupeSorted(findingLinesByPath.get(path) ?? []),
      };
      const bucket = byRole.get(role) ?? [];
      bucket.push(smartFile);
      byRole.set(role, bucket);
    }

    const groups: SmartDiffGroup[] = ROLE_ORDER.filter((role) => (byRole.get(role) ?? []).length > 0).map(
      (role) => ({
        role,
        files: [...(byRole.get(role) ?? [])].sort((a, b) =>
          sortWithinGroup(a, b, findingCountByPath),
        ),
      }),
    );

    const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    const tooBig = totalLines > TOO_BIG_TOTAL_LINES;

    return {
      groups,
      split_suggestion: {
        too_big: tooBig,
        total_lines: totalLines,
        proposed_splits: tooBig
          ? groups.map((g) => ({ name: g.role, files: g.files.map((f) => f.path) }))
          : [],
      },
    };
  }
}

/** Within a role group: files with more findings first, then bigger diffs first. */
function sortWithinGroup(
  a: SmartDiffFile,
  b: SmartDiffFile,
  findingCountByPath: Map<string, number>,
): number {
  const countA = findingCountByPath.get(a.path) ?? 0;
  const countB = findingCountByPath.get(b.path) ?? 0;
  if (countA !== countB) return countB - countA;
  const sizeA = a.additions + a.deletions;
  const sizeB = b.additions + b.deletions;
  return sizeB - sizeA;
}

function dedupeSorted(lines: number[]): number[] {
  return [...new Set(lines)].sort((a, b) => a - b);
}
