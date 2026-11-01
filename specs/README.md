# specs/ — cross-module specifications

This folder holds **only** product specifications for features that touch **two or more**
modules (`client/`, `server/`, `reviewer-core/`, `mcp-server/`). A spec describes *what* the
system must do and *why*; *how* to build it is a separate implementation plan
(`docs/plans/`, written by the `implementation-planner` agent).

A feature that touches a single module gets its spec inside that module instead:

| Feature touches | Spec path |
|---|---|
| only `client/` | `client/specs/<YYYY-MM-DD>-<feature-slug>.md` |
| only `server/` | `server/specs/<YYYY-MM-DD>-<feature-slug>.md` |
| only `reviewer-core/` | `reviewer-core/specs/<YYYY-MM-DD>-<feature-slug>.md` |
| only `mcp-server/` | `mcp-server/specs/<YYYY-MM-DD>-<feature-slug>.md` |
| two or more modules | `specs/<YYYY-MM-DD>-<feature-slug>.md` (here) |

`e2e/specs/` is not a spec folder — it holds executable `*.flow.json` tests. E2E scenarios
belong in the feature spec's acceptance criteria.

Specs are written by the [`spec-creator`](../.claude/agents/spec-creator.md) agent (or by
hand) using the template below.

## Lifecycle

`draft` → `approved` → `implemented`. A spec is `draft` until the user explicitly approves
it; only an `approved` spec goes to `implementation-planner`, which takes it as input and
writes the implementation plan (spec = WHAT / WHY, plan = HOW).

**Naming** = creation date + feature name. File: `<YYYY-MM-DD>-<feature-slug>.md`; Spec ID:
`SPEC-<YYYY-MM-DD>-<feature-slug>` (e.g. `specs/2026-10-21-pr-blast-radius.md` →
`SPEC-2026-10-21-pr-blast-radius`). No sequential numbering. The spec file is in English;
acceptance criteria follow the EARS convention below.

## What a spec may contain

Behaviour, not code structure. Workflow diagrams, diagrams of communication between modules
and services, and boundary **contracts** (endpoints, request/response fields, error codes,
events, MCP tool inputs/outputs) are welcome — usually **without implementation detail**: no
files, layers, classes, DB table design or task breakdown (that belongs in the plan).

## Template

```markdown
# Spec: <feature name>
Spec ID: SPEC-<YYYY-MM-DD>-<feature-slug>
Status: draft | approved | implemented
Supersedes: <link, if this spec replaces an earlier decision>

## Problem and user
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Cross-module interactions      ← optional (Mermaid workflow / sequence)
## Contracts                      ← optional (endpoints, events, MCP tools — shape only)
## Non-functional requirements
## Traceability
## Inputs and provenance
## Untrusted inputs
## Open questions
```

Acceptance criteria use EARS with Ukrainian triggers — **КОЛИ** (event), **ПОКИ** (state),
**ЯКЩО … ТОДІ** (unwanted behaviour), **ДЕ** (optional feature), or none (ubiquitous) — and
`(shall)` as the mandatory-requirement marker, e.g.:

> ЯКЩО структурований виклик моделі не вдався, ТОДІ система повинна (shall) показати
> детермінований огляд із причиною деградації.

Every AC and NFR carries a **verification hint** (`→ verify: unit | integration | e2e flow |
manual UI check — <what to assert>`). IDs are stable — `US-N`, `AC-N`, `EC-N`, `NFR-N` — and
the **Traceability** table links them (US → AC/NFR → EC → contract → verification), so
`implementation-planner`, `test-writer` and `plan-verifier` can trace every task and test back
to a requirement.

## Glossary

Use these terms in specs; don't invent synonyms.

| Term | Meaning |
|---|---|
| **Repo** | A GitHub repository connected to DevDigest (cloned locally for indexing). |
| **PR** | A pull request imported from GitHub into DevDigest. |
| **Agent** | A configured reviewer (provider, model, system prompt, strategy) that reviews a PR. |
| **Review run** (run) | One execution of an agent on a PR; status `running` / `done` / `failed`. |
| **Finding** | One issue a run reports, with severity `CRITICAL` / `WARNING` / `SUGGESTION`. |
| **Convention** | A repo coding rule (`pending` / `accepted` / `rejected`); accepted ones feed reviews. |
| **Repo-intel** (index) | The codebase indexer that feeds review context (symbols, import graph). |
| **Blast radius** | The code a PR can affect — callers / dependents of the changed symbols. |
| **Degraded** | A result built without a normally available source (no index, LLM failed…) — shown with its reason, never as an error page. |

## Recommendations — not yet done

- **`spec-writing` skill** — extract the template + EARS rules from `spec-creator` into a
  project skill so `implementation-planner`, `test-writer` and `plan-verifier` share one
  rulebook for `AC-N` traceability.
- **Reference ("golden") spec** — add one exemplary spec here (e.g. a retro-spec of blast
  radius) and link it from this README; `spec-creator` reads it before writing.
- **Figma MCP** — connect it so `spec-creator` can read Figma frames directly (`WebFetch`
  usually sees only the page shell).
- **Hard write barrier** — optional `PreToolUse` hook in `.claude/settings.json` blocking
  `spec-creator` writes outside `*/specs/` (today the limit is a prompt rule only).
