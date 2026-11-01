import { PrBrief } from '@devdigest/shared';

/**
 * Patch for `src/config.ts` in demo PR #482 (single hunk, +4/-0, matching the seeded `pr_files` row).
 * New-side line 12 is the marker line the seeded brief points at. Contains no secret-shaped text.
 */
export const SEED_CONFIG_PATCH = [
  '@@ -8,3 +8,7 @@',
  ' export const config = {',
  '   port: Number(process.env.PORT ?? 3000),',
  '+  rateLimitWindowMs: 60_000,',
  '+  rateLimitMax: 100,',
  '+  stripeKey: loadStripeKeyFromEnv(), // brief-seed-line-12',
  '+  redisUrl: process.env.REDIS_URL,',
  ' };',
].join('\n');

/**
 * Stored PR Brief for the demo PR #482 (`head_sha` matches the PR, so it is not stale). Exactly one
 * Review focus item, on a line the seeded patch covers. Validated against the contract at load.
 */
export const SEED_PR_BRIEF: PrBrief = PrBrief.parse({
  summary:
    'Introduces per-client throttling for unauthenticated public endpoints, with the limits read from application config.',
  risks: {
    risks: [
      {
        kind: 'security',
        title: 'Secret key handling in config',
        explanation: 'The config now loads a payment key next to the new limits; confirm it comes only from the environment.',
        severity: 'high',
        file_refs: ['src/config.ts:12'],
      },
      {
        kind: 'reliability',
        title: 'Limiter state is per instance',
        explanation: 'Counters live in process memory, so several instances multiply the effective limit.',
        severity: 'medium',
        file_refs: ['src/middleware/ratelimit.ts'],
      },
    ],
  },
  review_focus: [
    {
      file: 'src/config.ts',
      line: 12,
      reason: 'Start here: how the new throttling limits and the payment key are loaded from config.',
      line_adjusted: false,
    },
  ],
  intent: {
    intent: 'Add rate limiting to the public API to prevent abuse from unauthenticated clients.',
    in_scope: ['Token-bucket limiter middleware', 'Limits read from config'],
    out_of_scope: ['Authenticated endpoints'],
  },
  blast: null,
  history: null,
  meta: {
    head_sha: 'a1b2c3d4e5f6',
    generated_at: '2026-01-15T10:00:00.000Z',
    model: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
    missing_inputs: ['blast', 'specs'],
    blast_reason: null,
    input_truncated: [],
    input_tokens_est: 0,
    specs_used: [],
    specs_skipped: [],
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: null,
    dropped_refs: 0,
    adjusted_lines: 0,
  },
});
