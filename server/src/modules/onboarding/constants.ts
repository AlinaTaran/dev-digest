import type { OnboardingErrorReason } from '@devdigest/shared';

/** JobRunner kind for one tour generation. */
export const ONBOARDING_JOB_KIND = 'onboarding-generate';

/** Margin on top of the generation deadline (which already runs from the claim, queue wait included)
    before GET calls a `generating` row overdue — leaves room for the job's own terminal write. */
export const QUEUE_GRACE_MS = 30_000;

/** Structured log event names (NFR-2, NFR-8). */
export const LOG_EVENT_GENERATE = 'onboarding.generate';
export const LOG_EVENT_GET = 'onboarding.get';

export const FEATURE_MODEL_ID = 'onboarding';

/** API error codes. */
export const ERR_REPO_NOT_FOUND = 'repo_not_found';
export const ERR_UNAVAILABLE = 'onboarding_unavailable';

/** Generation error reasons written by the job / reaper. */
export const REASON: Record<'timeout' | 'interrupted' | 'internal', OnboardingErrorReason> = {
  timeout: 'timeout',
  interrupted: 'interrupted',
  internal: 'internal',
};
