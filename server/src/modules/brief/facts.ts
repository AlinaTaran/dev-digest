import type {
  BlastRadius,
  BlastRadiusResponse,
  BriefBlastReason,
  BriefMissingInput,
  Intent,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../reviews/repository.js';
import { BlastService } from '../blast/service.js';
import { classifyFile } from '../smart-diff/classify.js';
import { ProjectContextService, type BriefContext } from '../project-context/service.js';
import type { GroundContext } from './ground.js';
import { buildDiffFacts, type DiffFileFact } from './hunks.js';
import type { BriefBlastInput } from './input.js';
import { CALLERS_MAX, SYMBOLS_MAX } from './limits.js';
import { isSafeFactPath } from './paths.js';

export interface BriefFacts {
  diffFiles: DiffFileFact[];
  intent: Intent | null;
  /** Prompt-side blast block; null when blast counts as missing (AC-27). */
  blastInput: BriefBlastInput | null;
  /** Grounding map for blast files; null when the block was absent from the prompt. */
  blastGround: GroundContext['blast'];
  /** `PrBrief.blast` snapshot. */
  blastSnapshot: BlastRadius | null;
  blastReason: BriefBlastReason | null;
  description: string | null;
  specs: BriefContext;
  missingInputs: BriefMissingInput[];
}

/** Blast counts as missing when degraded with nothing changed (AC-27). */
export function blastIsMissing(b: Pick<BlastRadiusResponse, 'degraded' | 'changed_symbols'>): boolean {
  return b.degraded && b.changed_symbols.length === 0;
}

/** Pure: prompt block, grounding map and stored snapshot from the blast response. */
export function mapBlastFacts(b: BlastRadiusResponse): {
  input: BriefBlastInput;
  ground: NonNullable<GroundContext['blast']>;
  snapshot: BlastRadius;
} {
  const allCallers = b.downstream.flatMap((d) => d.callers.map((c) => ({ symbol: d.symbol, ...c })));

  // Grounding uses the FULL response, not the prompt-capped list.
  const ground: NonNullable<GroundContext['blast']> = new Map();
  const touch = (file: string, line?: number): void => {
    if (!isSafeFactPath(file)) return;
    const e = ground.get(file) ?? { callerLines: [] };
    if (line !== undefined && !e.callerLines.includes(line)) e.callerLines.push(line);
    ground.set(file, e);
  };
  for (const d of b.downstream) touch(d.file);
  for (const s of b.changed_symbols) touch(s.file);
  for (const c of allCallers) touch(c.file, c.line);

  const crons = [...new Set(b.downstream.flatMap((d) => d.crons_affected))];
  const input: BriefBlastInput = {
    summary: b.summary,
    changed_symbols: b.changed_symbols.map((s) => ({ name: s.name, kind: s.kind, file: s.file })),
    callers: allCallers.map((c) => ({ file: c.file, line: c.line, name: c.name, rank: c.rank })),
    endpoints: b.impacted_endpoints,
    crons,
  };

  // Snapshot keeps the top callers by rank, as sent to the model.
  const keep = new Set(
    [...allCallers]
      .sort((x, y) => y.rank - x.rank)
      .slice(0, CALLERS_MAX)
      .map((c) => `${c.symbol}\u0000${c.file}\u0000${c.line}\u0000${c.name}`),
  );
  const snapshot: BlastRadius = {
    summary: b.summary,
    changed_symbols: b.changed_symbols.slice(0, SYMBOLS_MAX).map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream: b.downstream.map((d) => ({
      symbol: d.symbol,
      callers: d.callers
        .filter((c) => keep.has(`${d.symbol}\u0000${c.file}\u0000${c.line}\u0000${c.name}`))
        .map((c) => ({ name: c.name, file: c.file, line: c.line })),
      endpoints_affected: d.endpoints_affected,
      crons_affected: d.crons_affected,
    })),
  };
  return { input, ground, snapshot };
}

/** Gathers every prompt input with no LLM call. Never writes (AC-26: intent is read, never computed). */
export async function gatherFacts(container: Container, workspaceId: string, pull: PullRow): Promise<BriefFacts> {
  const [rows, intent, blast, specs] = await Promise.all([
    container.reviewRepo.getPrFiles(pull.id),
    container.reviewRepo.getIntent(pull.id),
    new BlastService(container).build(workspaceId, pull.id).catch(() => null),
    new ProjectContextService(container).resolveForBrief(workspaceId, pull.repoId),
  ]);

  const { files } = buildDiffFacts(
    rows.map((r) => ({ path: r.path, additions: r.additions, deletions: r.deletions, patch: r.patch })),
    classifyFile,
  );

  const blastMissing = blast === null || blastIsMissing(blast);
  const mapped = blast && !blastMissing ? mapBlastFacts(blast) : null;
  const description = pull.body?.trim() || null;

  const missingInputs: BriefMissingInput[] = [];
  if (!intent) missingInputs.push('intent');
  if (blastMissing) missingInputs.push('blast');
  if (specs.entries.length === 0) missingInputs.push('specs');
  if (description === null) missingInputs.push('description');

  return {
    diffFiles: files,
    intent: intent ?? null,
    blastInput: mapped?.input ?? null,
    blastGround: mapped?.ground ?? null,
    blastSnapshot: mapped?.snapshot ?? null,
    blastReason: blast && blast.degraded ? blast.reason : null,
    description,
    specs,
    missingInputs,
  };
}
