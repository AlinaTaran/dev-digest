import { AppError } from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';

export type BriefUnavailableReason = 'pr_not_synced' | 'llm_not_configured';
export type BriefFailureReason = 'llm_failed' | 'invalid_output' | 'timeout';

/** 409: the brief cannot be generated until the user fixes something. */
export function briefUnavailable(reason: BriefUnavailableReason): AppError {
  const message =
    reason === 'pr_not_synced'
      ? 'This pull request has no synced files yet'
      : 'The brief model provider is not configured';
  return new AppError('brief_unavailable', message, 409, { reason });
}

/** 502: generation ran and failed; the stored brief is untouched. */
export function briefFailed(reason: BriefFailureReason): AppError {
  const message =
    reason === 'timeout'
      ? 'Brief generation timed out'
      : reason === 'invalid_output'
        ? 'The model returned an invalid brief'
        : 'Brief generation failed';
  return new AppError('brief_generation_failed', message, 502, { reason });
}

/** Maps anything thrown by the generation pipeline to a spec failure reason. */
export function classifyLlmError(err: unknown): BriefFailureReason {
  if (err instanceof TimeoutError || (err as { name?: string })?.name === 'TimeoutError') return 'timeout';
  const e = err as { name?: string; message?: string; issues?: unknown; errors?: unknown } | null;
  if (e?.name === 'ZodError' && (Array.isArray(e.issues) || Array.isArray(e.errors))) return 'invalid_output';
  if (typeof e?.message === 'string' && /schema validation/i.test(e.message)) return 'invalid_output';
  return 'llm_failed';
}
