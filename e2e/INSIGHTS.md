# e2e — INSIGHTS

Append-only log of decisions, gotchas discovered, and lessons for the e2e suite.
Newest first. Capture what wasn't obvious from the code — the "why" behind a choice,
or a trap someone hit — so the next person (or agent) doesn't relearn it.

## What Works

- **Flows run in lexical filename order** (`run.ts` sorts `specs/*.flow.json`). Prefix new
  flows (`01-`, `02-`, …) to control order — there's no other sequencing mechanism, and
  later flows can rely on earlier ones having navigated (one shared session, below).

## What Doesn't Work

- **A non-zero exit aborts the whole flow, not just the step** (`runFlow` breaks on the
  first failure). This includes a `wait --text` / `wait --url` whose condition never holds.
  So one flaky `wait` kills every subsequent step — use `wait` for synchronization (never
  sleeps), and assert on conditions that are actually guaranteed by the seed.

## Codebase Patterns

- **All commands in a run share ONE browser session** — the agent-browser daemon keeps the
  page between invocations, and the session is torn down once in a `finally`
  (`ab(["close"])`). State leaks between steps *by design*; a flow is an ordered script, not
  isolated test cases. Don't assume a fresh page per step.

## Tool & Library Notes

- **2026-10-19 — `agent-browser wait --text` matches the *rendered* text (innerText), so CSS `text-transform` breaks it.** `SectionLabel` uppercases its children (`textTransform: "uppercase"`), so `wait --text "Blast radius"` never matched the on-screen "BLAST RADIUS" and flow 02 failed. Wait on non-transformed text inside the same block instead (e.g. "Prior PRs touching these files"), never on a `SectionLabel` title. Running flows needs `cd e2e && npm ci` plus the global CLI (`npm i -g agent-browser && agent-browser install`); `./scripts/e2e.sh` is the safe way to run them (isolated DB + alt ports).

- **`{BASE}` is substituted by `resolveArgs`** from `E2E_BASE_URL` (default
  `http://localhost:3000`); `AGENT_BROWSER_BIN` and `E2E_STEP_TIMEOUT` (default 60s) are the
  other knobs. `assert.stdoutIncludes` is a substring check on the command's stdout layered
  *on top of* the exit-code check — use it to verify rendered text, not just navigation.

- **2026-10-24 — flow 08 (project context) is blocked by two client bugs; the flow itself is correct.** (1) `SettingsProjectContext.tsx` does a *value* import (`DEFAULT_PROJECT_CONTEXT_GLOBS`) from the `@devdigest/shared` barrel; the barrel's `./contracts/*.js` specifiers don't resolve under Next's webpack, so any route touching it 500s ("Module not found ./contracts/findings.js") and poisons the dev server for later flows (07 fails, then `/` 500s). Client code must only `import type` from `@devdigest/shared`, or inline the constant. (2) `client/src/app/agents/[id]/page.tsx` has `VALID_TABS = ["config","skills"]`, so `?tab=context` silently falls back to Config and the agent Context tab never renders (the skill editor derives its list from `TABS`, so it works). To validate flow 08 meanwhile, run `./scripts/e2e.sh` with 07 temporarily moved aside and the agent-hint `wait` removed. The not-cloned wait uses "Import or refresh the repository" because the title uses a curly apostrophe.

- **2026-10-25 — `./scripts/e2e.sh` is NOT isolated from a concurrently running dev stack or manual browsing.** (1) agent-browser uses one `default` session per machine: any manual `agent-browser open/close` while e2e runs navigates/closes the suite's browser (spurious flow failures). Use `AGENT_BROWSER_SESSION=<name>` (or `--session <name>`) for any ad-hoc browsing. (2) The e2e client (:3100) builds from the same `client/.next` as the dev server on :3000, so the dev server on :3000 starts calling the e2e API (`localhost:3101`, "Cannot reach the DevDigest engine at http://localhost:3101") during and after a run. Don't verify UI on :3000 while e2e runs; restart `pnpm dev` afterwards if it still points at :3101.
- **2026-10-25 — cheaper recovery than restarting `pnpm dev`:** `touch client/src/lib/api.ts` (where `NEXT_PUBLIC_API_BASE` is read) makes the :3000 dev server recompile its chunks with its own env, so it talks to :3001 again. Also open the app on `localhost:3000`, not `127.0.0.1` (API CORS allows only `localhost`).
- **2026-10-25 — an ad-hoc agent-browser session can wedge after many reloads while the dev server hot-recompiles:** every page then stays on skeletons ("No repo selected") and `snapshot` shows only `button "Open Next.js Dev Tools"` + an empty alert, with no new network requests — looks like an app regression but isn't. `agent-browser close` (same `--session`) and reopen; pages then load instantly. Also: right after editing client files the first load can take 10–20 s (on-demand compile) — wait before judging.

## Recurring Errors & Fixes

- **Flow fails on a `wait --text` for seeded content** → the DB wasn't freshly seeded.
  Flows assume specific fixtures (e.g. `acme/payments-api` PR #482 as the first repo). Fix:
  re-run `./scripts/dev.sh` to reseed before the suite.
- **2026-10-24 (later) — supersedes the earlier "flow 08 is blocked by two client bugs" note: both client bugs are fixed (barrel value import, `?tab=context` on the agent page); flow 08 passes 4/4 in `./scripts/e2e.sh`.** The remaining flake at "skill editor route reached" was NOT a hydration race (a `networkidle`, a 1500ms wait and a reload all failed to cure it; clicking by ref after a long wait also failed). Cause: the skills rail is a nested scroll container and `injection-guard` is the 4th card, at y~660 in a 577px-high viewport; agent-browser's click does not scroll a nested container, so it hit nothing. Fix: `find placeholder "Search skills…" fill injection-guard` to filter the rail so the card is at the top, then click. General rule: when a `find text ... click` on a list row silently does nothing, check the row's `getBoundingClientRect()` against `innerHeight` before suspecting hydration; filter/search the list rather than adding sleeps.

## Session Notes

### 2026-06-30 — Read runner while filling docs/specs
- Wrote `docs/writing-flows.md` from `run.ts` + a sample flow. Non-obvious bits kept above:
  shared single session, first-failure aborts the flow, lexical ordering, seed assumptions.

### 2026-06-30 — INSIGHTS log started
**Decision:** Track per-package learnings here, referenced from `e2e/CLAUDE.md`.
**Why:** `CLAUDE.md` is a thin map; durable history belongs in a lazy-loaded file.
**Consequence:** Add an entry whenever a non-obvious decision or gotcha lands.

## Open Questions
