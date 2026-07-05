# @devdigest/web (client)

Next.js 15 web app — the studio. Runs on the host (`pnpm dev`), :3000.

## Stack

Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl · Tailwind 4.
Package manager: **pnpm**.

## Commands

- `pnpm dev` — :3000.
- `pnpm test` — vitest + jsdom (component/unit; `fetch` mocked, no API/DB).
- `pnpm typecheck`.

## Conventions

- **Thin pages, fat views.** `app/**/page.tsx` are 5–15 lines; logic lives in colocated
  `_components/<Feature>/` folders next to the route.
- **All API access goes through `src/lib/api.ts` + the hooks in `src/lib/hooks/`.**
  Components never call `fetch` directly.
- **State split**: TanStack Query = server data (cache + invalidation on mutation);
  React Context = singletons (active repo, theme, toast); URL params = view state
  (tabs, filters, sort).
- **Live run logs via SSE** — `useRunEvents` (`src/lib/hooks/reviews.ts`).
- **i18n**: single locale `en`, no locale routing; messages split per feature under
  `messages/en/<namespace>.json`. New features add their own namespace.
- **Vendored UI** under `src/vendor/ui` (`@devdigest/ui`) — no external UI-component deps.

## Gotchas

- API base is `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).
- Query errors: 5xx / network → toast; 4xx → silent inline empty state (by design).

## Read when

- Need the UI route map → read `client/README.md`.
- Need design rationale or component-architecture notes → read `client/docs/`.
- Adding or changing a screen/behavior → read `client/specs/`.
- Before changing an established pattern → read `client/INSIGHTS.md` (past decisions).
