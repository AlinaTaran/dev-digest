import {
  BriefModelOutput,
  BriefModelOutputCountsOnly,
  type BriefModelDraft,
} from '@devdigest/shared';
import type { z } from 'zod';
import { capModelStrings } from './ground.js';

/**
 * Which model-output schema is sent to the provider.
 * - 'schema-caps': the spec's caps live in the JSON schema (AC-28: an over-long summary is rejected).
 * - 'counts-only': provider rejects string-length keywords; string caps are cut in code instead.
 */
export type BriefSchemaMode = 'schema-caps' | 'counts-only';
export const BRIEF_MODEL_SCHEMA_MODE: BriefSchemaMode = 'schema-caps';

export function modelSchemaFor(mode: BriefSchemaMode): z.ZodType<BriefModelDraft> {
  return mode === 'schema-caps' ? BriefModelOutput : BriefModelOutputCountsOnly;
}

/**
 * Defensive re-parse against the schema that was sent (throws a ZodError → `invalid_output`),
 * then cut the string caps (a no-op for an already valid 'schema-caps' draft).
 */
export function toDraft(data: unknown, mode: BriefSchemaMode): BriefModelDraft {
  return capModelStrings(modelSchemaFor(mode).parse(data));
}
