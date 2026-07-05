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
