# Layer map — the rings and the rules

The DevDigest backend already implements Onion / hexagonal architecture. This
file maps each ring to the real code and states the rules with their rationale.

## The rings — where things live

Outer rings depend inward; inner rings never import outward.

| Ring (outer → inner) | Paths | Rule |
|---|---|---|
| **Delivery** | module `routes.ts` (Fastify) | Thin: parse → call service → map. No business logic, no DB. |
| **Persistence** | `db/*`, module `repository.ts`, `*.repo.ts` | The **only** place `drizzle-orm` is imported. |
| **Adapters (infra)** | `adapters/*` (+ `adapters/mocks.ts`) | Concrete impls of ports. Imported only by the container. |
| **Composition root** | `platform/container.ts`, wired in `app.ts` | Binds ports → adapters; injects mocks in tests via `ContainerOverrides`. |
| **Ports** | `vendor/shared/adapters.ts` | `LLMProvider`, `GitClient`, `GitHubClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider`. |
| **Domain** | module `service.ts` / `run-executor.ts`, all of `reviewer-core` | Pure orchestration/logic. No framework, no I/O except injected ports. |

Reference module to copy from: `modules/reviews/` — `routes.ts` (thin) →
`service.ts` / `run-executor.ts` (orchestration) → `repository.ts` +
`repository/*.repo.ts` (the only DB touchpoint for the review domain).

## The rules, with rationale

1. **A module = a self-contained Fastify plugin** (`routes` + `service` +
   `repository`) under `src/modules/<name>`, registered statically in
   `modules/index.ts`. *Why:* one feature, one boundary, one registration point —
   you can read a module top-to-bottom without chasing framework wiring.

2. **Adapters come from the DI container** — call `container.llm()`, `.github()`,
   `.git()`, etc. **Never import an adapter directly** from a module. *Why:* the
   module depends on the port (interface), so tests inject a mock via
   `ContainerOverrides` and swapping an implementation touches one file.

3. **Zod (`@devdigest/shared`) drives validation + serialization** — one schema,
   both request-parse and response-shape. Extend `shared` with new files; don't
   edit the stable barrel. *Why:* the contract is the single source of truth
   shared across server, engine, and CI runner.

4. **Secrets only via `SecretsProvider`** → `~/.devdigest/secrets.json` (mode
   0600). Never put API keys/tokens in the DB, git, or `AppConfig`. *Why:* one
   audited path for secret material.

5. **Business logic in services; routes thin; all DB access through
   repositories.** `drizzle-orm` appears only in `db/*`, `repository.ts`,
   `*.repo.ts`. *Why:* the domain stays testable without a database, and
   persistence can change behind the repository interface.

6. **`reviewer-core` stays pure** — no DB/GitHub/git/fs/network, and no import
   from `server/`. Its one side effect is the injected `LLMProvider`; all deps
   arrive as function args / `ReviewInput` fields. *Why:* the engine is a library
   consumed by both the server and the CI runner, and stays fully unit-testable.

## Tool-specific practices

- **Fastify** — routes use `ZodTypeProvider`, parse input, call one service, map
  the result. Never pass `req` / `reply` deeper than the route handler. Turn a
  request into a plain `RequestContext` via `modules/_shared/context.ts`
  (`{ workspaceId, userId }`) so services take primitives, not the request.
- **Drizzle** — a repository is the sole DB touchpoint for its domain. Need data
  inside a service? Add a repo method and call it; don't query from the service.
  Cross-cutting repos (`reviewRepo`, `agentsRepo`) are handed out by the container.
- **DI container** — a new external capability is four small steps: (1) add a port
  to `shared/adapters.ts`, (2) add an adapter in `adapters/*`, (3) add a lazy
  getter + a `ContainerOverrides` entry in `container.ts`, (4) add a mock in
  `adapters/mocks.ts`. Define the port in `shared`, not in the adapter file.
- **Zod contracts** — add new schema files under `vendor/shared/contracts/`;
  feature work **extends** the barrel with new files, it doesn't edit existing
  ones. Ports themselves may reuse Zod (e.g. `ModelInfo` is a `z.object`).
- **reviewer-core** — a new engine capability takes its deps as arguments or
  `ReviewInput` fields; it imports **types only** from `@devdigest/shared` and
  never reaches for a global or an import from `server/`.

## Common violations & fixes

| Violation | Fix |
|---|---|
| `routes.ts` runs a Drizzle query directly | Move it into a `*.repo.ts`; call it from the service. |
| `service.ts` imports `drizzle-orm` | Add a repository method; inject the repo. |
| Module imports from `adapters/*` | Resolve the port from `container` instead. |
| Port interface defined in the adapter file | Move the `interface` into `vendor/shared/adapters.ts`. |
| `reviewer-core` imports `octokit` / `fs` / from `server/` | Accept the value via `ReviewInput` / a function arg. |
| `req` / `reply` passed into a service | Build a `RequestContext` in the route first. |

The current set of grandfathered deviations in this repo is tracked in
`README.md` (and, mechanically, in the enforcement baseline — see
`enforcement.md`).
