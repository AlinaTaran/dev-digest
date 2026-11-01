import { z } from 'zod';

/**
 * The LLM's structured draft. Deliberately lenient: every key is required
 * (strict JSON schema mode) and nullable where absent, with NO length/count
 * limits and plain-string `kind`/`complexity`. All caps live in `ground.ts`.
 */
export const OnboardingDraft = z.object({
  architecture: z.object({
    summary_md: z.string().nullable(),
    diagram: z
      .object({
        nodes: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            kind: z.string(),
            path: z.string().nullable(),
          }),
        ),
        edges: z.array(
          z.object({ from: z.string(), to: z.string(), label: z.string().nullable() }),
        ),
      })
      .nullable(),
  }),
  critical_paths: z.array(z.object({ path: z.string(), why: z.string().nullable() })),
  run_locally: z.array(
    z.object({ command: z.string(), source_path: z.string(), note: z.string().nullable() }),
  ),
  reading_path: z.array(z.object({ path: z.string(), why: z.string() })),
  first_tasks: z.array(z.object({ title: z.string(), path: z.string(), complexity: z.string() })),
});
export type OnboardingDraft = z.infer<typeof OnboardingDraft>;

export const ONBOARDING_DRAFT_SCHEMA_NAME = 'OnboardingTourDraft';
export const schemaName = ONBOARDING_DRAFT_SCHEMA_NAME;
