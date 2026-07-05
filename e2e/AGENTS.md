# @devdigest/e2e

Deterministic browser end-to-end tests (agent-browser) over the main user journeys,
against a real seeded stack. No LLM in the loop.

## Stack

agent-browser CLI + `run.ts` (tsx). Package manager: **npm**.

## Commands

- `npm install && npm test` — runs `tsx run.ts` over the flow specs.
- Requires the full stack up and seeded (`./scripts/dev.sh`) plus the agent-browser CLI
  (`npm i -g agent-browser && agent-browser install`).

## Conventions

- **`specs/*.flow.json` are deterministic batch flows** — use only `--url` / `--text`
  / `find` locators. **Never** use the AI `chat` command (no model key in this suite).
- Flows cover the main journeys (boot → PR list → PR detail; agents) on seeded data.

## Gotchas

- **`specs/` here means test flows, not product specifications.** Product/behavior
  specs for the app live in `server/specs`, `client/specs`, `reviewer-core/specs`.

## Read when

- Need the e2e setup / how flows run → read `e2e/README.md`.
- Need rationale or how to add a flow → read `e2e/docs/`.
- Before changing an established pattern → read `e2e/INSIGHTS.md`.
- Overall testing/CI strategy → read `TESTING.md` (repo root).
