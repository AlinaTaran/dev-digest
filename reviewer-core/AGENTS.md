# @devdigest/reviewer-core

The pure review engine: diff → prompt → LLM → findings. No app, no server — a library
consumed by the server and the CI runner.

## Stack

TypeScript engine. Package manager: **npm** (not pnpm).
Consumed as **raw TypeScript source** via tsconfig alias `@devdigest/reviewer-core`
(`../reviewer-core/src/index.ts`) — never built to JS.

## Commands

- `npm test` — vitest (hermetic; no DB / GitHub / FS / network).
- `npm run typecheck` / `npm run build` — both are `tsc --noEmit` (emit nothing).

## Conventions

- **No side effects except the injected LLM call.** No DB, GitHub, or filesystem access.
  The LLM provider is passed in; the engine stays pure and fully testable.
- **Prompt hardening**: every system prompt gets a fixed `INJECTION_GUARD`; all
  repo/author-derived content is wrapped in `<untrusted source="…">…</untrusted>`.
- **Grounding gate** (`grounding.ts`): a finding whose line range doesn't intersect a
  real diff hunk is dropped. Findings must cite real `file:line` from the diff.
- **Score is recomputed deterministically** from grounded findings
  (CRITICAL −35 / WARNING −12 / SUGGESTION −3); the model's self-reported score is ignored.
- **Structured output is enforced out of band** via strict JSON Schema (the Zod `Review`
  contract), not described in prompt prose.

## Gotchas

- Uses **npm**, not pnpm. Without `node_modules`, the server crashes at boot
  (`ERR_MODULE_NOT_FOUND`) because it imports this source directly.
- `build` produces no `dist/` — that's intentional.

## Read when

- Need the full pipeline walkthrough → read `reviewer-core/README.md`.
- Need design rationale (grounding, map-reduce, providers) → read `reviewer-core/docs/`.
- Adding or changing engine behavior → read `reviewer-core/specs/`.
- Before changing an established pattern → read `reviewer-core/INSIGHTS.md`.
- How agent prompts are written/assembled → read `docs/agent-prompts/` (repo root).
