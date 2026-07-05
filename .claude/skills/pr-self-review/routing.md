# Routing — file group → review lenses

Classify each changed file by its **top-level package prefix** (the strongest,
least ambiguous signal — mirrors the `paths:` filters in `.github/workflows/`).
A bare `.ts` extension is ambiguous; classify by directory, not extension.

## File groups

| Group | Matches | Notes |
|---|---|---|
| **UI** | `client/**` | React / Next.js App Router, hooks, styles |
| **Backend/domain** | `server/**`, `reviewer-core/**` | routes/services/repos/adapters, pure engine |
| **Shared contracts** | `server/src/vendor/shared/**` | Zod contracts — affect both UI and BE |
| **e2e** | `e2e/**` | flow specs; not an architecture lens — TS lens only if `.ts` changed |
| **Non-code** | `*.md`, lockfiles, `.gitignore`, configs | handled by eligibility triage — usually skipped |

## Lens map (existing repo skills only)

`mermaid-diagram` and `engineering-insights` are **not** review lenses — never run them.

| File group | Lenses to dispatch |
|---|---|
| **UI** (`client/**`) | `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library` (esp. `**/*.test.tsx`) |
| **Backend/domain** (`server/**`, `reviewer-core/**`) | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns` (esp. `db/schema/**`, `**/repository*.ts`, `**/*.repo.ts`), `postgresql-table-design` (esp. `db/schema/**`, `db/migrations/**`) |
| **Any changed file** (both sides) | `typescript-expert`; `security`; `zod` (where Zod schemas/contracts are present) |

### Refinements

- **`security`** runs on Backend/domain files **always** (routes, auth, input
  handling). On **UI** files run it only when the diff touches DOM sinks
  (`dangerouslySetInnerHTML`, raw `innerHTML`, URL/redirect building).
- **`reviewer-core/**`** rides with `server/**` (same domain; `onion-architecture`
  explicitly covers reviewer-core, but it must stay pure — no DB/Fastify lenses'
  I/O expectations apply to it).
- **Shared contracts** changed → also run the **contract-drift** check: after the
  `zod` lens, grep for `@devdigest/shared` importers on both sides and confirm both
  the client consumers and the server were updated together (drift = HIGH).
- **Empty group → skip its lenses.** If nothing under `client/**` changed, dispatch
  no UI lenses; likewise for backend.

## Dispatch shape

One subagent per applicable **(lens × non-empty group)**. Give each subagent only
the files of its group and their patches. Run them in parallel
(`superpowers:dispatching-parallel-agents`). Each returns findings in the
`severity.md` schema; the orchestrator merges and gates.
