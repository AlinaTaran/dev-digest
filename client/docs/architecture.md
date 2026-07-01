# client — component architecture

Design rationale for `@devdigest/web`. For commands, conventions, and gotchas see
`client/CLAUDE.md`; for screen/behavior contracts see `client/specs/`.

## Thin pages, fat views

`app/**/page.tsx` files stay 5–15 lines — they wire routing and render a view. All real
logic lives in **colocated `_components/<Feature>/` folders** next to the route (e.g.
`pulls/[number]/_components/RunHistory/`, `RunTraceDrawer/`). This keeps the route tree
readable and the feature code discoverable right where the URL says it is.

## State split — three stores, three jobs

The hardest part of the UI is deciding *where* a piece of state lives. The rule:

| State kind | Where | Example |
|---|---|---|
| Server data | **TanStack Query** (cache + invalidation on mutation) | PR list, runs, findings |
| App singletons | **React Context** | active repo, theme, toast |
| View state | **URL params** | active tab, filters, sort |

View state goes in the URL so it's shareable and survives reload (e.g. `?tab=findings`).
Server data never gets copied into Context — Query owns it, and mutations invalidate the
relevant query keys rather than hand-syncing.

## Data access is funneled

Components **never call `fetch` directly**. All API access goes through `src/lib/api.ts`
plus the hooks in `src/lib/hooks/`. This is what makes the error policy uniform (below) and
keeps `NEXT_PUBLIC_API_BASE` in one place.

**Error policy** (by design): 5xx / network errors → toast; 4xx → silent inline empty
state. A component rendering an empty list on a 404 is intentional, not a missing error
handler.

## Live run logs via SSE

Review runs stream progress over Server-Sent Events through `useRunEvents`
(`src/lib/hooks/reviews.ts`) — not polling. The run trace / history views subscribe to the
event stream and render incrementally.

## Vendored UI, no external component deps

UI primitives live under `src/vendor/ui` (`@devdigest/ui`) — `Badge`, `CircularScore`,
`SeverityBadge`, `Avatar`, `Icon`, etc. There are **no external UI-component
dependencies**; new primitives are added to the vendor package, not pulled from npm.

## i18n

Single locale `en`, no locale routing. Messages are split per feature under
`messages/en/<namespace>.json`. A new feature adds its **own namespace** file (e.g.
`runs.json`, `prReview.json`) rather than growing one giant bundle.
