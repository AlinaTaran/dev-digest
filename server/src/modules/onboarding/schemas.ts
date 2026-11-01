import { z } from 'zod';

export {
  Onboarding,
  OnboardingTourResponse,
  OnboardingGenerateResponse,
} from '@devdigest/shared';

/** Exact 409 body from the spec: `reason` sits next to `code`, not under `details`. */
export const OnboardingUnavailableBody = z.object({
  error: z.object({
    code: z.literal('onboarding_unavailable'),
    message: z.string(),
    reason: z.enum(['not_cloned', 'no_index']),
  }),
});
export type OnboardingUnavailableBody = z.infer<typeof OnboardingUnavailableBody>;

/** Payload of the `onboarding-generate` job. */
export const GenerationJobPayload = z.object({
  workspaceId: z.string().uuid(),
  repoId: z.string().uuid(),
  generationId: z.string().uuid(),
});
export type GenerationJobPayload = z.infer<typeof GenerationJobPayload>;
