import { z } from 'zod';

/**
 * Project Context — repo Markdown docs (selected by configurable globs) that the
 * user attaches, in order, to agents and skills. Zod validates SHAPE only; path,
 * glob, count and size rules run in the service and throw AppError with the
 * spec's exact codes (the global handler maps every Zod failure to 422).
 */

export const DEFAULT_PROJECT_CONTEXT_GLOBS: readonly string[] = ['**/{specs,docs,insights}/**/*.md'];
export const PROJECT_CONTEXT_MAX_FILE_BYTES = 256 * 1024;
export const PROJECT_CONTEXT_MAX_DOCS = 20;
export const PROJECT_CONTEXT_LIST_CAP = 500;
export const PROJECT_CONTEXT_MAX_PATH = 512;

export const ContextDocType = z.enum(['specs', 'docs', 'insights', 'other']);
export type ContextDocType = z.infer<typeof ContextDocType>;

export const ContextDoc = z.object({
  path: z.string(),
  name: z.string(),
  dir: z.string(),
  type: ContextDocType,
  size_bytes: z.number().int(),
  tokens: z.number().int(),
  too_large: z.boolean(),
  updated_at: z.string().nullish(),
  used_by_agents: z.number().int(),
});
export type ContextDoc = z.infer<typeof ContextDoc>;

export const ContextListing = z.object({
  repo_id: z.string(),
  globs: z.array(z.string()),
  scanned_at: z.string(),
  clone_sha: z.string().nullable(),
  degraded: z.boolean(),
  reason: z.enum(['not_cloned', 'scan_failed']).nullable(),
  truncated: z.boolean(),
  total_found: z.number().int(),
  docs: z.array(ContextDoc),
});
export type ContextListing = z.infer<typeof ContextListing>;

export const ContextDocUsedBy = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  via: z.enum(['agent', 'skill']),
  skill_name: z.string().optional(),
});
export type ContextDocUsedBy = z.infer<typeof ContextDocUsedBy>;

export const ContextDocDetail = z.object({
  path: z.string(),
  content: z.string(),
  content_hash: z.string(),
  tokens: z.number().int(),
  size_bytes: z.number().int(),
  type: ContextDocType,
  used_by_agents: z.array(ContextDocUsedBy),
});
export type ContextDocDetail = z.infer<typeof ContextDocDetail>;

export const ContextDocSaveBody = z.object({
  path: z.string(),
  content: z.string(),
  base_hash: z.string(),
});
export type ContextDocSaveBody = z.infer<typeof ContextDocSaveBody>;

export const ContextDocSaveResult = z.object({
  path: z.string(),
  content_hash: z.string(),
  tokens: z.number().int(),
  size_bytes: z.number().int(),
  saved_at: z.string(),
});
export type ContextDocSaveResult = z.infer<typeof ContextDocSaveResult>;

/** Full ordered replacement of one owner's attached paths for one repo. */
export const ContextAttachBody = z.object({
  repo_id: z.string().uuid(),
  paths: z.array(z.string()),
});
export type ContextAttachBody = z.infer<typeof ContextAttachBody>;

export const ContextAttachedItem = z.object({
  path: z.string(),
  position: z.number().int(),
  /** True when the file is gone from the clone (kept visible so it can be removed). */
  missing: z.boolean(),
  /** Null when the doc is missing/unreadable. */
  tokens: z.number().int().nullable(),
});
export type ContextAttachedItem = z.infer<typeof ContextAttachedItem>;

export const ContextInheritedItem = z.object({
  path: z.string(),
  skill_id: z.string(),
  skill_name: z.string(),
  missing: z.boolean(),
  tokens: z.number().int().nullable(),
  duplicate_of_attached: z.boolean(),
});
export type ContextInheritedItem = z.infer<typeof ContextInheritedItem>;

export const ContextEffectiveItem = z.object({
  path: z.string(),
  source: z.union([
    z.literal('agent'),
    z.object({ skill_id: z.string(), skill_name: z.string() }),
  ]),
  missing: z.boolean(),
  tokens: z.number().int().nullable(),
});
export type ContextEffectiveItem = z.infer<typeof ContextEffectiveItem>;

export const AgentContextResponse = z.object({
  repo_id: z.string(),
  attached: z.array(ContextAttachedItem),
  inherited: z.array(ContextInheritedItem),
  effective: z.array(ContextEffectiveItem),
  total_tokens: z.number().int(),
});
export type AgentContextResponse = z.infer<typeof AgentContextResponse>;

export const SkillContextResponse = z.object({
  repo_id: z.string(),
  attached: z.array(ContextAttachedItem),
  total_tokens: z.number().int(),
  /** "Serializes as" preview: `## Project context` + one `- path` line per doc. */
  serialized: z.string(),
});
export type SkillContextResponse = z.infer<typeof SkillContextResponse>;

export const RepoContextQuery = z.object({ repo_id: z.string().uuid() });
export type RepoContextQuery = z.infer<typeof RepoContextQuery>;

export const ContextDocQuery = z.object({ path: z.string() });
export type ContextDocQuery = z.infer<typeof ContextDocQuery>;
