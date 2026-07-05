import type { ConventionCandidate } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository, type UpdateConventionFields } from './repository.js';
import { toConventionDto } from './helpers.js';
import { CONFIG_CANDIDATE_FILENAMES, CONVENTION_SAMPLE_FILE_COUNT } from './constants.js';
import { verifyCandidate, type SampleFile } from './verify.js';
import { ConventionExtractionResult, type ConventionExtractionCandidate } from './schemas.js';

/**
 * Conventions service — scans a repo's config files + top-ranked source
 * files, asks a cheap (overridable) model to propose convention candidates,
 * then VERIFIES each one against the actual sampled content before
 * persisting it (`verify.ts`). Candidates that don't check out (wrong file,
 * out-of-range line, snippet not found) are silently discarded — never
 * surfaced as errors, per the plan.
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  async updateFields(
    workspaceId: string,
    id: string,
    patch: UpdateConventionFields,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.updateFields(workspaceId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  /**
   * Run the full extract pipeline for a repo: sample → propose → verify →
   * persist. Synchronous (no job queue) per the plan. Re-running replaces
   * prior `pending` rows but leaves manually `accepted`/`rejected` rows
   * untouched.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const samples = await this.gatherSamples(workspaceId, repoId);
    const proposed = await this.proposeCandidates(workspaceId, samples);
    const verified = proposed.filter((c) => verifyCandidate(c, samples));

    await this.repo.deletePendingByRepo(workspaceId, repoId);
    if (verified.length === 0) return [];

    const rows = await this.repo.insertMany(workspaceId, repoId, verified);
    return rows.map(toConventionDto);
  }

  /**
   * Config files (probed directly, one `container.git.readFile` per
   * candidate name, skipped — not thrown — on read failure) + the
   * repo-intel top-N sample, combined into one list of `{ path, content }`.
   */
  private async gatherSamples(workspaceId: string, repoId: string): Promise<SampleFile[]> {
    // Must be checked BEFORE any repo-content read: `repoIntel.getConventionSampleFiles`
    // takes only `repoId` with no workspace check, so skipping this guard would let a
    // caller extract (and, via `insertMany`, persist under their own workspaceId) source
    // snippets from a repo owned by a different workspace.
    const ref = await this.repo.getRepoRef(workspaceId, repoId);
    if (!ref) return [];

    const configSamples: SampleFile[] = [];
    for (const path of CONFIG_CANDIDATE_FILENAMES) {
      const content = await this.container.git
        .readFile({ owner: ref.owner, name: ref.name }, path)
        .catch(() => null);
      if (content != null) configSamples.push({ path, content });
    }
    const topSamples = await this.container.repoIntel.getConventionSampleFiles(
      repoId,
      CONVENTION_SAMPLE_FILE_COUNT,
    );
    return [...configSamples, ...topSamples];
  }

  /** The cheap, overridable model call — a no-op when there's nothing to sample. */
  private async proposeCandidates(
    workspaceId: string,
    samples: SampleFile[],
  ): Promise<ConventionExtractionCandidate[]> {
    if (samples.length === 0) return [];
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);
    const result = await llm.completeStructured({
      model,
      schema: ConventionExtractionResult,
      schemaName: 'ConventionExtraction',
      messages: [
        {
          role: 'system',
          content:
            "You extract explicit, project-specific coding conventions from a repository's config " +
            'and top source files. Only report a convention you can point to concrete evidence for: ' +
            'the exact file path, the line range, and a snippet copied verbatim from that file. ' +
            'Never invent evidence — candidates that cannot be independently verified are discarded.',
        },
        { role: 'user', content: buildSamplesPrompt(samples) },
      ],
    });
    return result.data.candidates;
  }
}

function buildSamplesPrompt(samples: SampleFile[]): string {
  return samples.map((s) => `--- ${s.path} ---\n${s.content}`).join('\n\n');
}
