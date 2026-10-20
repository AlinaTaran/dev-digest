# @devdigest/mcp-server

Local stdio MCP server that exposes 5 DevDigest tools to Claude Code. A thin HTTP client
of the existing Fastify API (`http://localhost:3001`, no auth) — no product logic lives here.
Spec: `docs/spec/mcp-server.md`.

## Stack

TypeScript, **npm** (own `package-lock.json`, not pnpm). MCP SDK **v2**
(`@modelcontextprotocol/server@2.0.0`, exact) and **zod 4**. Transport: **stdio**.
Launched via `bin/devdigest-mcp.mjs` — a plain-JS launcher that registers **tsx** and imports
`src/main.ts` (raw TypeScript, never built). Wired for Claude Code in the root `.mcp.json`.

## Commands

- `npm ci` — install (needs `package-lock.json`).
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — vitest (hermetic; the DevDigest API is faked in memory).
- `npm run lint:arch` — dependency-cruiser onion gate (non-zero = boundary violation).
- `npm start` — run the stdio server (`node bin/devdigest-mcp.mjs`).

## Architecture — onion

Dependencies point inward only; enforced by `.dependency-cruiser.cjs` (`npm run lint:arch`, no baseline).

| Ring (outer → inner) | Paths | Rule |
|---|---|---|
| Delivery | `src/delivery/mcp/**` | Thin: zod args → one use case → `content` + `structuredContent` or `isError`. Only ring (with `main.ts`) importing `@modelcontextprotocol/*`. |
| Adapters | `src/adapters/**` | Implement ports (HTTP client, clock, stderr logger, `mocks.ts`). Imported only by composition and tests. |
| Composition root | `src/composition/**`, `src/main.ts` | `loadConfig(env)`, `createContainer(config, overrides?)`. The only place adapters are imported. |
| Ports | `src/domain/ports.ts` | `DevDigestApiPort`, `ClockPort`, `LoggerPort`. |
| Domain | `src/domain/**` | Pure logic and use cases. No SDK, zod, fetch, `process`, or `node:*`. |

Deliberate deviations from the backend onion skill: own zod schemas instead of
`@devdigest/shared` (zod 4 here vs zod 3 in `server/`; the contract is HTTP). Never import
from `../server|client|reviewer-core|e2e`.

## Conventions

- **stdout is the JSON-RPC channel.** Never `console.log` / `process.stdout.write` in `src/`
  (asserted by `test/no-stdout.test.ts`). Log to **stderr** only, via `LoggerPort`.
- **Four tool-design practices** — keep them traceable in every tool:
  1. **Result, not operation** — tools answer "what are the findings", not "call endpoint X".
  2. **Flat arguments** — one flat `z.object` of scalars; no nesting, no root `anyOf/oneOf/allOf`.
  3. **Concise structured response** — compact text plus `structuredContent`; capped, filtered,
     no ids/evidence/`system_prompt`; `concise` default, `detailed` opt-in.
  4. **Error leads forward** — every error/hint names the next action (message catalog in
     `src/delivery/mcp/messages.ts`, spec §5).
- **Tool titles, descriptions, and parameter `.describe()` strings are verbatim from
  `docs/spec/mcp-server.md` §4.1** and asserted by `test/server.contract.test.ts`. Change
  the spec first, then the code; never paraphrase.
- `run_agent_on_pr` is the only write tool and is blocking (~100 s budget); on timeout it
  returns a non-error `running` result. Never auto-retry the review POST.

## Configuration (env)

| Var | Default | Rule |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | http/https URL; trailing `/` stripped; invalid → stderr + exit(1) |
| `DEVDIGEST_WEB_URL` | `http://localhost:3000` | only used in hint text |
| `DEVDIGEST_MCP_POLL_INTERVAL_MS` | `2000` | clamp 500–10000 |
| `DEVDIGEST_MCP_RUN_TIMEOUT_MS` | `100000` | clamp 5000–600000 |
| `DEVDIGEST_MCP_HTTP_TIMEOUT_MS` | `30000` | clamp 1000–120000 |

## Gotchas

- The DevDigest API must be running (`./scripts/dev.sh`); otherwise tools return an
  `API_UNREACHABLE` error that points there.
- Review runs are rate-limited server-side (10/min on `POST /pulls/:id/review`, 120/min global).
- **zod 4 here, zod 3 in `server/`** — do not share schemas or copy code between them.
- Uses **npm**, not pnpm; `npm ci` first or the launcher fails to resolve `tsx`.
- Never call `GET /pulls/:id` (re-fetches GitHub and rewrites files); never return
  `system_prompt` or convention `evidence_snippet`.

## Read when

- Need the full design, tool contracts, algorithms, error catalog → read `docs/spec/mcp-server.md`.
- Before changing an established pattern → read `mcp-server/INSIGHTS.md`.
- Onion rules and ring mapping → read `.claude/skills/onion-architecture/layer-map.md`.
