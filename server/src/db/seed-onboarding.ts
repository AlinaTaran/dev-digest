import type { Onboarding } from '@devdigest/shared';

/**
 * Fixed, deterministic Onboarding Tour for the demo repo (`acme/payments-api`).
 * The repo has no clone, so e2e sees this tour with Regenerate disabled
 * ("repo is not cloned yet"). Must stay valid against the `Onboarding` contract.
 */
export const SEED_ONBOARDING_TOUR: Onboarding = {
  generated_at: '2026-01-15T10:00:00.000Z',
  source_sha: '0123456789abcdef0123456789abcdef01234567',
  files_indexed: 42,
  index_status: 'full',
  degraded: false,
  reasons: [],
  model: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
  dropped_refs: 0,
  sections: [
    {
      kind: 'architecture',
      empty_reason: null,
      summary_md:
        'A small Express-style payments API. Requests pass through `src/middleware/auth.ts` and ' +
        '`src/middleware/ratelimit.ts`, reach the handlers under `src/api/`, and persist through ' +
        '`src/db/client.ts` into Postgres. Card charges are delegated to Stripe.',
      top_dirs: [
        { path: 'src', files: 34 },
        { path: 'test', files: 6 },
        { path: 'scripts', files: 2 },
      ],
      diagram: {
        nodes: [
          { id: 'client', label: 'API clients', kind: 'client', path: null },
          { id: 'server', label: 'HTTP server', kind: 'entrypoint', path: 'src/server.ts' },
          { id: 'auth', label: 'Auth middleware', kind: 'middleware', path: 'src/middleware/auth.ts' },
          { id: 'api', label: 'API handlers', kind: 'module', path: 'src/api' },
          { id: 'db', label: 'Postgres', kind: 'datastore', path: 'src/db/client.ts' },
          { id: 'stripe', label: 'Stripe', kind: 'external', path: null },
        ],
        edges: [
          { from: 'client', to: 'server', label: 'HTTPS' },
          { from: 'server', to: 'auth', label: null },
          { from: 'auth', to: 'api', label: null },
          { from: 'api', to: 'db', label: 'SQL' },
          { from: 'api', to: 'stripe', label: 'charges' },
        ],
      },
    },
    {
      kind: 'critical_paths',
      empty_reason: null,
      items: [
        { path: 'src/middleware/auth.ts', why: 'Authenticates every request before it reaches a handler', fan_in: 12 },
        { path: 'src/db/client.ts', why: 'Single Postgres connection used by all handlers', fan_in: 9 },
        { path: 'src/config.ts', why: 'Typed environment configuration', fan_in: 7 },
        { path: 'src/api/payments.ts', why: null, fan_in: 4 },
      ],
    },
    {
      kind: 'run_locally',
      empty_reason: null,
      steps: [
        { command: 'pnpm install', source_path: 'package.json', note: 'Install dependencies' },
        { command: 'cp .env.example .env', source_path: '.env.example', note: 'Create a local env file' },
        { command: 'pnpm run dev', source_path: 'package.json', note: 'Start the API with reload' },
      ],
    },
    {
      kind: 'reading_path',
      empty_reason: null,
      steps: [
        { path: 'src/server.ts', why: 'Entry point: wires the middleware and routes' },
        { path: 'src/middleware/auth.ts', why: 'How requests are authenticated' },
        { path: 'src/api/payments.ts', why: 'The core charge flow' },
        { path: 'src/db/client.ts', why: 'How data is persisted' },
      ],
    },
    {
      kind: 'first_tasks',
      empty_reason: null,
      tasks: [
        { title: 'Add a unit test for the auth middleware', path: 'src/middleware/auth.ts', path_kind: 'file', complexity: 'low' },
        { title: 'Document the public API handlers', path: 'src/api', path_kind: 'dir', complexity: 'low' },
        { title: 'Add a health-check endpoint', path: 'src/api/health.ts', path_kind: 'new_file', complexity: 'medium' },
      ],
    },
  ],
};
