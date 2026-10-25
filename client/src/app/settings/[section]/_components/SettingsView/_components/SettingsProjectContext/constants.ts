/**
 * Client-local mirror of `DEFAULT_PROJECT_CONTEXT_GLOBS` (server/shared:
 * `contracts/project-context.ts`). The client may only import TYPES from
 * `@devdigest/shared` — a runtime value pulls the barrel into webpack, whose
 * `./contracts/*.js` re-exports don't resolve. Keep identical to the server's.
 */
export const DEFAULT_PROJECT_CONTEXT_GLOBS: readonly string[] = ["**/{specs,docs,insights}/**/*.md"];
