import { z } from 'zod';

/**
 * Raw shape the model returns for `POST /repos/:id/conventions/extract`'s
 * proposal step — distinct from the persisted `ConventionCandidate` contract
 * (`@devdigest/shared`): no `id`/`status` yet, those are assigned at persist
 * time, after code-side verification (`verify.ts`) discards the unverifiable
 * ones.
 */
export const ConventionExtractionCandidate = z.object({
  category: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line_start: z.number().int().optional(),
  evidence_line_end: z.number().int().optional(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
});
export type ConventionExtractionCandidate = z.infer<typeof ConventionExtractionCandidate>;

export const ConventionExtractionResult = z.object({
  candidates: z.array(ConventionExtractionCandidate),
});
export type ConventionExtractionResult = z.infer<typeof ConventionExtractionResult>;
