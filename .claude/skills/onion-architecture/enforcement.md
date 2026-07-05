# Enforcement — the boundary gate

The rules in `layer-map.md` are enforced mechanically, not just by review, with
**[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)** — a tool
that scans the import graph and fails when a dependency crosses a forbidden
boundary. It's already a dependency of `server/`, so there's nothing to install.

Run the gate before declaring a backend change complete. It exits non-zero if a
service/route newly touches Drizzle, a module imports an adapter directly, or
`reviewer-core` reaches for I/O.

## 1. The config

Save this as `dependency-cruiser.arch.cjs` (anywhere; the commands below assume
this skill's folder). It must be **run from `server/`** — dependency-cruiser
resolves the tsconfig `include` relative to the working directory, and TypeScript
silently drops `include` globs that escape the project via `../`. From `server/`,
`tsconfig.json` resolves the `.js`→`.ts` imports and `@devdigest/*` aliases
cleanly, so the rule paths below are relative to the `server/` cwd.

```js
module.exports = {
  forbidden: [
    {
      name: 'service-no-drizzle',
      comment: 'Services orchestrate; DB access goes through a repository.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(service|run-executor)\\.ts$' },
      to: { path: 'drizzle-orm' },
    },
    {
      name: 'routes-no-drizzle',
      comment: 'Routes are thin: parse -> service -> map. No direct Drizzle.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: 'drizzle-orm' },
    },
    {
      name: 'module-no-direct-adapter',
      comment: 'Modules depend on ports; get adapters from the DI container.',
      severity: 'error',
      from: { path: '^src/modules/' },
      to: { path: '^src/adapters/', pathNot: '^src/adapters/(index|mocks)\\.ts$' },
    },
    {
      name: 'core-is-pure',
      comment: 'reviewer-core: no DB/GitHub/git/network (importing shared types is ok).',
      severity: 'error',
      from: { path: 'reviewer-core/src/' },
      to: { path: '(drizzle-orm|postgres|octokit|simple-git)' },
    },
    {
      name: 'core-no-node-io',
      comment: 'reviewer-core must not import Node I/O built-ins.',
      severity: 'error',
      from: { path: 'reviewer-core/src/' },
      to: { dependencyTypes: ['core'], path: '^(node:)?(fs|child_process|net|http|https)$' },
    },
    {
      name: 'no-circular',
      comment: 'Circular deps signal a leaked boundary.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
  },
};
```

Note: match npm packages with a plain literal (`drizzle-orm`) — a pnpm-path regex
like `(\.pnpm/[^/]+/...)?` trips dependency-cruiser's ReDoS guard and it bails.

## 2. Baseline the existing deviations

The codebase currently has pre-existing violations (see `README.md` for the list).
Snapshot them once so the gate passes today and fails only on **new** drift:

```
cd server && npx depcruise \
  --config ../.claude/skills/onion-architecture/dependency-cruiser.arch.cjs \
  --output-type baseline src ../reviewer-core/src \
  > ../.claude/skills/onion-architecture/known-violations.json
```

This writes a `known-violations.json` baseline. It's a burn-down list — after you
fix a grandfathered deviation, regenerate it so the violation can't silently
return.

## 3. Run the gate

```
cd server && npx depcruise \
  --config ../.claude/skills/onion-architecture/dependency-cruiser.arch.cjs \
  --ignore-known ../.claude/skills/onion-architecture/known-violations.json \
  src ../reviewer-core/src
```

- **Exit 0** → no new boundary violations (known ones are reported as ignored).
- **Non-zero** → you introduced a new violation; the offending
  `from → to` edge and the rule name are printed. Fix per the
  common-violations table in `layer-map.md`.

## 4. Making it always-on (optional follow-up)

To enforce on every change rather than on demand: commit the config to the repo
root, add an npm script (e.g. `"arch": "depcruise --config … --ignore-known … src ../reviewer-core/src"`),
and call it from the server CI workflow. Left as a deliberate follow-up so the
skill stays a self-contained reference.
