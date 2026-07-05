# onion-architecture — skill reference

Meta-documentation for the `onion-architecture` skill: what it is, when it fires,
what it covers, the current known-deviations list, version history, and the full
list of sources the guidance was built from.

## Files (progressive disclosure)

- **`SKILL.md`** — lean core: the six rules, the "where does this go?" decision
  framework, red flags, sibling-skill boundaries, and navigation. Loaded first.
- **`layer-map.md`** — the rings mapped to real paths, the rules with rationale,
  per-tool practices (Fastify, Drizzle, DI container, Zod, reviewer-core), and the
  common-violations→fixes table.
- **`enforcement.md`** — the runnable `dependency-cruiser` boundary gate: what it
  is, the config to drop in, how to baseline existing deviations, and how to run it.
- **`README.md`** — this file.

## Focus

**One job: *which ring backend code belongs in, and which way it may depend.***
The backend is an onion — dependencies point inward; the domain (module services +
`reviewer-core`) never imports Drizzle, Fastify, GitHub, or the network. Every
external call sits behind a port (`server/src/vendor/shared/adapters.ts`) wired to
a concrete adapter only in the DI container (`server/src/platform/container.ts`).

### Covers
- The ring layout (delivery → persistence → adapters → composition root → ports → domain) mapped to real `server/` and `reviewer-core/` paths
- The six layering rules (module shape, container-only adapters, Zod contracts, secrets path, routes-thin/repo-only-DB, engine purity)
- Per-tool practices for Fastify, Drizzle, the DI container, Zod, and reviewer-core
- A common-violations→fixes table and quick red-flags self-check
- A runnable `dependency-cruiser` gate + baseline workflow to enforce it mechanically

### Does NOT cover (by design — avoids overlap)
- *How* to write a Fastify route/plugin/hook → `fastify-best-practices`
- *How* to write Drizzle queries or schema → `drizzle-orm-patterns`
- *How* to author Zod schemas → `zod`
- PostgreSQL table/index design → `postgresql-table-design`

## Target cases (when to reach for it)

- "Where does this new endpoint / query / external call go?"
- "Can a service import this adapter / run this query?"
- "How do I add a new external capability (LLM, GitHub, …) the right way?"
- "Is `reviewer-core` still pure after this change?"
- "How do I check I didn't break a boundary before merging?"

## Alignment with this repo

The guidance codifies conventions that **already exist** in `server/AGENTS.md` and
`reviewer-core/AGENTS.md` — it reinforces them rather than inventing new ones. The
enforcement gate reuses the already-installed `dependency-cruiser` dependency.

### Known deviations (current burn-down list)

A first gate run surfaced **17 pre-existing violations**, baselined so the gate
only catches *new* drift. Fix opportunistically and regenerate the baseline:

- **Routes querying Drizzle directly** — `pulls`, `polling`, `settings`,
  `workspace` `routes.ts` (should go through a `*.repo.ts`).
- **Modules importing adapters directly** — `repo-intel` (service + pipeline) and
  `reviews/diff-loader.ts` import `astgrep` / `codeindex` / `tokenizer` / `git`
  adapters instead of resolving them via the container. The largest leak.
- **Circular dependencies through `container.ts`** — `repo-intel/service` ↔
  `container`, and `agents/helpers` ↔ `agents/repository`.
- Related: `depgraph` and `tokenizer` define their port interface in the adapter
  file rather than in `shared`.

## Version / changelog

Current version: **1.0.0** (also set in `SKILL.md` frontmatter `version:`).

- **1.0.0** — Initial release. Codifies the existing `server/` + `reviewer-core/`
  layering into a lean `SKILL.md` core plus `layer-map.md` (rings + rules + tool
  practices) and `enforcement.md` (a verified `dependency-cruiser` gate with a
  17-violation baseline). Built from a codebase map + a web-research pass on Onion
  Architecture and dependency-cruiser enforcement.

## Sources

All links used in the research, verbatim, grouped by area.

### Onion Architecture fundamentals
- Jeffrey Palermo — The Onion Architecture, Part 1 (origin): https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- NDepend — Onion Architecture: Going Beyond Layers: https://blog.ndepend.com/onion-architecture-layers/
- Herberto Graça — Onion Architecture (Software Architecture Chronicles): https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85
- allegro.tech — Onion Architecture: https://blog.allegro.tech/2023/02/onion-architecture.html

### Onion / Clean in Node.js + TypeScript
- Remo Jansen — SOLID + Onion in Node.js with TypeScript: https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad
- André Bazaglia — Clean Architecture with TypeScript: DDD, Onion: https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/
- Khalil Stemmler — Clean Node.js Architecture: https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/
- Sairyss — domain-driven-hexagon (reference repo): https://github.com/sairyss/domain-driven-hexagon

### Enforcement (dependency-cruiser)
- dependency-cruiser (GitHub): https://github.com/sverweij/dependency-cruiser
- Avoid cross-module dependencies with dependency-cruiser: https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b
- Restrict imports in JavaScript with Dependency Cruiser (Atomic Object): https://spin.atomicobject.com/dependency-cruiser-imports/

### Tool-specific practices
- Fastify clean-architecture template (revell29): https://github.com/revell29/fastify-clean-architecture
- Repository pattern with Drizzle ORM: https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae
- Cosmic Python — Repository Pattern: https://www.cosmicpython.com/book/chapter_02_repository.html
