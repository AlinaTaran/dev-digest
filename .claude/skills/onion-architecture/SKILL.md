---
name: onion-architecture
version: "1.0.0"
description: "Use when adding or changing backend code in server/ or reviewer-core/ — new modules, routes, services, repositories, adapters, or engine code — to keep dependencies pointing inward and I/O behind ports. Triggers: creating a module, importing drizzle-orm or fastify, wiring an adapter, touching container.ts or shared/adapters.ts, or writing reviewer-core logic."
---

# Onion Architecture (DevDigest backend)

**Scope:** *which ring backend code belongs in and which way it may depend.* The
backend is an onion — **dependencies point inward.** The domain (module
`service.ts` files and all of `reviewer-core`) knows nothing about Drizzle,
Fastify, GitHub, or the network; every external call sits behind a **port**
(interface in `@devdigest/shared`) wired to a concrete adapter only in the **DI
container** (`server/src/platform/container.ts`).

## Core rules

1. **A module = a self-contained Fastify plugin** (`routes` + `service` +
   `repository`) under `src/modules/<name>`, registered in `modules/index.ts`.
2. **Adapters come from the DI container** — never import an adapter directly.
3. **Zod (`@devdigest/shared`) drives validation + serialization** — one schema,
   both ends. Extend `shared` with new files; don't edit the stable barrel.
4. **Secrets only via `SecretsProvider`.** Never in the DB, git, or `AppConfig`.
5. **Business logic in services; routes thin; all DB access through repositories**
   (`drizzle-orm` only in `db/*`, `repository.ts`, `*.repo.ts`).
6. **`reviewer-core` stays pure** — no DB/GitHub/git/fs/network, no import from
   `server/`. Its one side effect is the injected `LLMProvider`; deps arrive via
   the `ReviewInput` object.

## Decision framework — "where does this go?"

Inside a service and need something?
1. **From the DB** → a repository method (`repository.ts` / `*.repo.ts`), never a
   query in the service or route.
2. **An external call** (LLM, GitHub, git, embeddings, secrets) → a container port.
3. **In `reviewer-core`** → it must already be on `ReviewInput` / a function arg;
   if it isn't, add it there — do not import it.
4. **A new external capability** → port (`shared/adapters.ts`) → adapter
   (`adapters/*`) → container getter + `ContainerOverrides` → mock (`adapters/mocks.ts`).

## Reference (progressive disclosure)

Read the file that matches the decision in front of you:

- **`layer-map.md`** — the rings mapped to real paths, the full rules with
  rationale, per-tool practices (Fastify, Drizzle, DI container, Zod,
  reviewer-core), and the common-violations→fixes table.
- **`enforcement.md`** — the runnable `dependency-cruiser` boundary gate: what it
  is, the config to drop in, how to baseline the existing deviations, and how to
  run it before declaring a backend change done.
- **`README.md`** — this skill's focus, coverage, the current known-deviations
  list, version history, and all research sources.

## Red flags (quick self-check)

- A Drizzle query (`db.select(...)`) inside a `service.ts` or `routes.ts` → move
  it into a `*.repo.ts`.
- `import { X } from '../adapters/...'` in a module → resolve the port from
  `container` instead.
- A port `interface` declared in the adapter file → move it to
  `vendor/shared/adapters.ts`.
- `reviewer-core` importing `octokit` / `fs` / anything under `server/` → accept
  the value via `ReviewInput` or a function arg.
- Passing `req` / `reply` deeper than a route handler → convert to a plain
  `RequestContext` via `modules/_shared/context.ts` first.

## Related skills (boundaries)

| This skill | Sibling skill | Boundary |
|---|---|---|
| *Where* backend code lives & which way it depends | **`fastify-best-practices`** | *How* to write routes/plugins/hooks, validation mechanics → there |
| DB access belongs in a repository | **`drizzle-orm-patterns`** | *How* to write the Drizzle queries/schema inside that repo → there |
| Contracts live in `shared` | **`zod`** | *How* to author the schemas → there |

Reference other skills by name (as above) — do not `@`-link them.
