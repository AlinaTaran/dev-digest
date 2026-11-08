---
name: dependency-checker
description: >-
  Use when auditing dependencies across DevDigest's packages (server, client,
  reviewer-core, mcp-server, e2e) — unused or duplicated npm packages, version
  drift between packages, install/bundle size, or how packages depend on each
  other internally via path aliases instead of a workspace. Triggers: "check
  our dependencies", "dependency audit", "why is this package so big", "can we
  remove X", "are we duplicating a package", before adding a new dependency,
  or when a diff touches more than one `package.json`.
---

# Dependency Checker (DevDigest)

**Core principle:** every finding names a specific package, dependency, or
file — never generic advice like "consider optimizing dependencies" — and
every finding carries one of this skill's severity tiers so the report can be
triaged, not just read.

## Repo facts this skill must get right

- **DevDigest is explicitly NOT a monorepo.** Each of `server/`, `client/`,
  `reviewer-core/`, `mcp-server/`, `e2e/` has its own `package.json` and
  lockfile. There is **no** `workspace:*` protocol and no pnpm/npm workspaces
  file wiring them together — never describe cross-package dependencies that
  way.
- Packages that need each other's code share it through **TypeScript path
  aliases** (e.g. `@devdigest/reviewer-core`, `@shared/*`) resolved at
  compile time, or occasionally a direct relative import. These are
  **internal dependencies** — a different kind of thing from an **external
  npm package** pulled from the registry, and a report must never conflate
  the two.
- Package managers differ by package: `server/` and `client/` use **pnpm**;
  `reviewer-core/`, `mcp-server/`, `e2e/` use **npm**. Don't assume one
  lockfile format repo-wide.

## Severity tiers

| Tier | Meaning | Examples in this domain |
|------|---------|--------------------------|
| **P0** | Breaks the repo's own architecture rules or risks a real runtime bug | A relative import that reaches into another package's `src/` instead of going through its public entry point or declared alias; a duplicated-but-incompatible version of a dependency whose types/schemas cross a package boundary (e.g. a shared `zod` contract) |
| **P1** | Real waste or real risk, not yet broken | A declared dependency with no import anywhere in that package's source (dead weight); version drift in a dependency that doesn't cross a boundary but still means two different behaviors ship |
| **P2** | Worth doing, not urgent | A heavy dependency used for a narrow slice of its API where a lighter alternative exists; devDependency version inconsistency across packages |
| **Info** | Observation, no action implied | Notably large but clearly load-bearing dependencies (e.g. `next`, `playwright`); confirmation that something is fine as-is |

Label every finding with its tier. Don't leave findings unranked, and don't
invent new tiers.

## Workflow

### 1. Scope the request

Decide which of `server/`, `client/`, `reviewer-core/`, `mcp-server/`,
`e2e/` are in scope — either every package with a `package.json`, or the
subset the user asked about. State this explicitly later in the report's
**Scope** section.

### 2. Gather the data

If the data has already been handed to you (e.g. inlined in the prompt),
use it as-is — don't ask for tool access you don't need. Otherwise, per
package in scope:

```bash
# declared dependencies + versions
cat <package>/package.json   # "dependencies" + "devDependencies"

# total installed size of the whole package (how much it weighs)
du -sh <package>/node_modules 2>/dev/null

# installed size per top-level dependency
du -sh <package>/node_modules/*/ 2>/dev/null | sort -rh

# is a declared dependency actually imported anywhere?
grep -rl "<dep-name>" <package>/src 2>/dev/null

# cross-package internal imports (alias or relative)
grep -rn "@devdigest/\|@shared/" <package>/src
grep -rn "\.\./\.\./.*\(server\|client\|reviewer-core\|mcp-server\)/src" <package>/src
```

Cross-reference declared versions of the **same dependency name** across
every package's `package.json` to catch version drift.

### 3. Classify every dependency

For each one found, decide:
- **Internal** (resolved via a path alias or a relative import into another
  package) vs **external** (comes from the npm registry) — keep these in
  separate reasoning, never merge them into one undifferentiated list.
- For internal ones: does it go through the package's intended public
  surface (its alias / entry point), or does it reach past that into
  another package's `src/` directly? The latter is a **P0**.
- For external ones: unused? duplicated with a different resolved version
  elsewhere? unusually large for what it does?

## Report structure (required, in this order)

### Scope
List exactly which packages were analyzed and why (all of them, or the
subset relevant to the request).

### Dependency Graph
A Mermaid flowchart (` ```mermaid` fenced, `flowchart` direction) showing
the packages as nodes and their **internal** dependency edges (path-alias
or direct relative imports) between them. External npm packages do not
belong in this graph — it's a map of how DevDigest's own packages relate,
not a full node_modules tree.

### Size Breakdown
Two levels, both required:
1. **Per package:** its total installed size (`du -sh <package>/node_modules`,
   or the sum of what you gathered) — how much that whole package weighs.
2. **Per dependency, as a table** with columns: name, **type** (`dependency` /
   `devDependency`, and `internal` / `external`), declared version, installed
   size (when known).

Don't summarize size as a vague statement ("client has a lot of
dependencies") — show the numbers, and never collapse "type" into just the
internal/external split — runtime vs. dev matters too (a huge devDependency
is a different kind of finding than a huge runtime one).

### Findings & Priorities
Every finding grouped under its severity tier (`P0`, `P1`, `P2`, `Info`),
each naming the specific package, dependency, and/or file it concerns.
Removing or changing a dependency is always phrased as a recommendation for
the user to confirm — never as something already done.

### Summary
3-5 concrete, actionable takeaways, ordered by priority (highest severity
first), closing the report.

## Red flags — stop and fix before sending the report

- Calling this repo a monorepo, or mentioning `workspace:*` / pnpm-workspace
  wiring between `server`/`client`/`reviewer-core`/`mcp-server`/`e2e` — it
  isn't one.
- A finding with no severity tier, or a tier invented on the spot.
- A finding that says "consider optimizing dependencies" without naming the
  package, file, or `package.json` it's about.
- Treating an internal path-alias import and an external npm package as the
  same kind of dependency.
- Phrasing "remove `X`" as already executed rather than a recommendation.
- A report with no Mermaid graph, no size table, no per-package total weight,
  or no Summary.
- A size table with no **Type** column (`dependency`/`devDependency`,
  `internal`/`external`) — size alone isn't enough.

## Related skills (boundaries)

| This skill | Sibling skill | Boundary |
|---|---|---|
| *What* depends on what, and how big/duplicated/stale it is | **`onion-architecture`** | *Which ring* backend code belongs in and *which direction* it may depend — read it when a P0 finding is also a layering violation in `server/`/`reviewer-core/` |
| Dependency graph syntax | **`mermaid-diagram`** | Full Mermaid syntax reference if the flowchart needs more than nodes + edges |

Reference other skills by name (as above) — do not `@`-link them.
