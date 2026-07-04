# Next.js App Router organization

The structural view of the App Router (Next.js 15 + React 19): where files go, how the server/client boundary shapes layout, and where the data layer lives. For data-fetching/caching *mechanics* and route-handler details, see `next-best-practices`.

## Server/client boundary is a layout concern

- **Server Components by default.** Layouts and pages render on the server; opt into client only for interactivity or browser APIs.
- **`'use client'` marks a boundary, not a file setting.** Everything a client file imports enters the client bundle. So **push `'use client'` down to the specific interactive leaves** — don't mark a whole page/section client.
- **Slot pattern:** to keep server-rendered UI inside a client component, pass it as **`children`/props**. It stays server-rendered rather than being pulled into the client bundle.
- **Providers** (Context) are Client Components — render them **as deep as possible**, wrapping only `{children}`, not the whole `<html>`, so static server optimization is preserved.

Organizationally: your interactive widgets are small client leaves; the tree above them stays server. Structure folders so the `'use client'` files are the exception, near the bottom.

## Required route-level convention files

Per route segment, `error.tsx`, `loading.tsx`, and `not-found.tsx` are **required regardless of where data is fetched** — including all-client-query apps. Hand-rolled `isLoading`/`isError` branches in a page do **not** catch a render-time throw in the subtree; only an `error.tsx` boundary does. Without one, a render throw becomes a white screen. Add them at the segment level as a matter of course, not just where you "expect" errors.

## Colocation primitives

Next.js is deliberately **unopinionated** — it gives you these tools; pick one strategy and keep it consistent.

- **Safe colocation:** a folder in a route segment is **not routable** until it contains `page.js`/`route.js`. So components, utils, and tests can sit inside `app/**/` route segments without becoming URLs.
- **`_private` folders:** prefix with underscore (`_components`, `_lib`) to opt a subtree **out of routing**. Ideal for route-local feature code. **This repo uses exactly this** — logic lives in `app/**/_components/<Feature>/` ("thin pages, fat views").
- **Route groups `(folder)`:** parentheses organize routes by section/intent/team and enable nested/multiple layouts **without affecting the URL path**.
- **`src/` folder:** optional; separates application code (including `app/`) from root config files. This repo uses `src/`.

### Three file-organization strategies (from the docs)
1. Keep project files **outside `app/`** (app is routing-only).
2. Keep them in **top-level folders inside `app/`**.
3. **Split by feature/route** — shared code at the root, feature code colocated in the segment that uses it. *(This repo blends 1 + 3: shared in `src/lib` & `src/components`, feature code in `app/**/_components`.)*

## Where the data layer lives

- **Server-side fetching lives in async Server Components.** `await` fetch/ORM directly; identical fetches are request-memoized, so fetch **in the component that needs it** instead of prop-drilling. Secrets/credentials stay server-side and out of the bundle.
- **Client-side data** → a library (TanStack Query / SWR) or React's `use()` reading a server-passed promise.
- **Server Actions are for mutations, not query fetching** (called from the client they run **serially**, which fights a query library's model). Keep them in a dedicated `actions.ts` / server module.

### When the backend is a separate service
If your Next app is a **thin client over a separate API** (a standalone Fastify/REST backend — not Next's own server/DB), an **all-client-query app** (TanStack Query + REST) is a legitimate architecture, not a code smell:
- `useMutation` → REST **substitutes for Server Actions** — you don't need Actions to mutate an external service.
- The RSC server-fetch / prefetch win is **smaller** here (mainly initial paint; the data still comes cross-origin). Don't force Server Components everywhere just to have them.
- Still keep pages as **thin server shells** where that's cheap (layout, metadata, auth gate, a hydration boundary) — thin pages, fat views.

### TanStack Query wiring (structural)
- **Prefetch in a Server Component:** create a `QueryClient`, `prefetchQuery`, then wrap the subtree in `<HydrationBoundary state={dehydrate(qc)}>`. Consume with `useQuery` in a `'use client'` child.
- **QueryClient lifecycle:** a **new client per request on the server**, a **singleton in the browser** (module-level cache). The provider file needs `'use client'`.
- **Colocate query keys with their queries** in the feature; structure keys generic → specific for granular invalidation. Since v5, prefer sharing a **`queryOptions`** object over thin custom-hook wrappers (it also works in loaders and imperative calls).

**Prefetching from a Server Component against an *external* API** has extra sharp edges vs Next's own routes:
- The prefetch is a **cross-origin** fetch from the server, not a same-process call.
- **Forward auth/cookies/headers explicitly** — they are **not** automatic server-side. Read them (`cookies()`/`headers()`) and pass them on the outbound request yourself.
- Use a **per-request `getQueryClient()` with an `isServer` branch**: a **new** `QueryClient` per request on the server, a **singleton** in the browser. Reusing one server-side client across requests bleeds one user's cache into another's.

**This repo:** state is split three ways — server data → TanStack Query (invalidate on mutation), app singletons (active repo, theme, toast) → React Context, view state (tabs, filters, sort) → **URL params**. Server data is never copied into Context. Live logs stream via SSE (`useRunEvents` in `src/lib/hooks/reviews.ts`), not polling.
