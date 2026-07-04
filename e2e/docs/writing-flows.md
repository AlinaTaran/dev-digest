# e2e — writing a flow

How the deterministic browser suite works and how to add a flow. For commands and
conventions see `e2e/AGENTS.md`; the flow files themselves live in `e2e/specs/`.

## What this suite is

`run.ts` is a thin convention layer over **agent-browser** — a CDP browser-automation CLI,
*not* a test framework. There is no LLM in the loop: flows target **read-only seeded data**,
so nothing here triggers a model call or needs an API key.

Each flow is a `specs/*.flow.json` file listing agent-browser commands. All commands in a
run share **one browser session** (the daemon keeps the page between invocations). Flows
run in **lexical order of filename** (`01-…`, `02-…`), so prefix new files to place them.

## Flow file shape

```json
{
  "name": "human-readable flow name (printed in the report)",
  "description": "what it exercises and the data assumptions",
  "steps": [
    { "cmd": ["open", "{BASE}/"], "label": "load the app root" },
    { "cmd": ["wait", "--url", "/pulls"], "label": "land on the PR list" },
    { "cmd": ["find", "text", "Add rate limiting", "click"], "label": "open the PR row" },
    { "cmd": ["wait", "--text", "request changes"],
      "assert": { "stdoutIncludes": "request changes" } }
  ]
}
```

- `{BASE}` is substituted with `E2E_BASE_URL` (default `http://localhost:3000`) by
  `resolveArgs`.
- `label` is optional (defaults to the joined args) and only affects the printed report.
- `assert.stdoutIncludes` adds a light substring check on the command's stdout on top of
  the exit-code check.

## Rules (keep flows deterministic)

- **Locators only**: `--url`, `--text`, and `find`. **Never** use the AI `chat` command —
  there is no model key in this suite, and chat would make runs non-deterministic.
- A command that exits non-zero **fails the step and aborts the flow** — including a
  `wait --text` / `wait --url` whose condition never holds. Lean on `wait` for
  synchronization rather than sleeps.
- On a step failure the runner writes a best-effort `test-results/<id>-fail.png`
  screenshot for the CI artifact, then stops that flow.
- The shared browser session is torn down (`ab(["close"])`) in a `finally` regardless of
  outcome.

## Prerequisites

- Full stack up **and seeded**: `./scripts/dev.sh` (flows assume seeded fixtures, e.g.
  `acme/payments-api` PR #482 as the first repo).
- agent-browser installed: `npm i -g agent-browser && agent-browser install`.
- Then `npm install && npm test` (runs `tsx run.ts`).

## Note on `specs/`

In this package `specs/` means **test flows**, not product specifications. Product/behavior
specs for the app live in `server/specs`, `client/specs`, and `reviewer-core/specs`.
