---
name: engineering-insights
description: >-
  Use at the start of any task touching client/, server/, reviewer-core/, or e2e/ (read that
  module's INSIGHTS.md first), before changing an established pattern, and at session wrap-up.
  Use when you hit a gotcha, dead end, recurring error, dependency quirk, or make an
  architecture decision worth recording so the next session doesn't relearn it.
---

# Engineering Insights

Per-module memory. Each package keeps an append-only `INSIGHTS.md` so the next session
(human or agent) doesn't relearn what this one discovered.

Files: `client/INSIGHTS.md` · `server/INSIGHTS.md` · `reviewer-core/INSIGHTS.md` · `e2e/INSIGHTS.md`.

## TOP RULE — append-only, never overwrite

You **only add what isn't already there.** Leave every existing line — intro, headings, prior
entries — byte-for-byte untouched. Insert a new entry with a targeted edit **under its section
heading**; **never rewrite the whole file.** Never edit or delete someone else's entry. The one
exception is the dedup case below, and even that adds detail, it never removes knowledge.

> Red flag: "Am I about to replace existing content?" → Stop. Append only.

## Three mandatory behaviors

1. **Read first.** Before working in a module, read its `INSIGHTS.md`. Before changing an
   established pattern, the relevant insight may already explain why it's that way.
2. **Re-read before writing.** Before adding an entry, scan the file — if the insight is already
   there, refine that line instead of adding a duplicate.
3. **Capture at the end.** At session wrap-up, append substantial **new** insights only. A
   "substantial" session = a problem was hit, a decision was made, or a non-obvious discovery
   happened. If nothing non-obvious occurred that isn't already recorded, **write nothing.**

## Where it goes

Route to the module the insight is really about. Shared contracts (`server/src/vendor/shared`)
and `repo-intel` (`server/src/modules/repo-intel`) → `server/INSIGHTS.md`; default to `server`
when ambiguous. A change spanning modules → one entry in each touched module's file.

## The 7 fixed sections

| Section | What goes here |
|---|---|
| What Works | Approaches/patterns/solutions proven effective here |
| What Doesn't Work | Dead ends, antipatterns to avoid — **most valuable, most skipped; prioritize these** |
| Codebase Patterns | Project conventions, architecture decisions, naming |
| Tool & Library Notes | Dependency quirks, gotchas, useful behaviors |
| Recurring Errors & Fixes | A common error → its fix |
| Session Notes | Dated `### YYYY-MM-DD` brief summaries, newest first |
| Open Questions | Unresolved, needs more investigation |

Add the entry under the matching heading. If a section is missing, add the heading — don't
restructure existing ones.

## Quality bar: actionable cold

An entry must be specific enough that an agent reading it cold knows exactly what to do or avoid
**without re-investigating.** State *when*, *why*, and *the alternative*.

❌ "Promises can be tricky" · "be careful with async" — noise, not a lesson.
✅ "`Promise.all()` on the ingest pipeline times out past 30 items — use `Promise.allSettled()`
   in batches of 10 for that module."
✅ "Checkout state always goes through Zustand (`cartStore.ts`); 3 components share the cart, so
   local state desyncs."

Test: **if it'd be obvious to anyone reading the code, don't write it.**

## Conflict resolution

If a new insight contradicts an existing one, don't leave both silently. Flag it in the new entry
("supersedes the 2026-05 note on X because…") and resolve, so the file stays trustworthy.

## Anti-bloat

Keep signal high. If a section sprawls, consolidate related entries or split by domain rather than
piling on near-duplicates. Negative learnings (What Doesn't Work) earn their space; vague notes don't.
