/**
 * Onion boundaries for mcp-server (spec §2). Run from mcp-server/: `npm run lint:arch`.
 * Rings (outer -> inner): delivery | adapters | composition(+main.ts) -> domain.
 * Module names in `to.path` are plain literals on purpose: complex node_modules regexes
 * trip depcruise's ReDoS guard (see server/INSIGHTS.md).
 * Node `process` and other globals cannot be detected here; the domain-pure rule only
 * catches imports (node builtins via dependencyTypes: core).
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-pure',
      comment: 'domain must not import outer rings',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '^src/(adapters|delivery|composition)/|^src/main\\.ts$' },
    },
    {
      name: 'domain-no-sdk-zod',
      comment: 'domain has no MCP SDK or zod',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '@modelcontextprotocol|node_modules/zod/' },
    },
    {
      name: 'domain-no-node-builtins',
      comment: 'domain does no I/O: no node:* builtins',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'adapters-inward',
      comment: 'adapters may import from src/ only domain ports, types and errors',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: {
        path: '^src/',
        pathNot: '^src/adapters/|^src/domain/(ports|types|errors)\\.ts$',
      },
    },
    {
      name: 'delivery-no-adapters',
      comment: 'delivery talks to use cases through the container, never adapters',
      severity: 'error',
      from: { path: '^src/delivery/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'adapters-only-from-composition',
      comment: 'only the composition root (and tests) import adapters',
      severity: 'error',
      from: { path: '^src/(domain|delivery)/|^src/main\\.ts$' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'sdk-in-delivery',
      comment: 'the MCP SDK is confined to delivery and main.ts',
      severity: 'error',
      from: { path: '^src/(domain|adapters|composition)/' },
      to: { path: '@modelcontextprotocol' },
    },
    {
      name: 'no-cross-package',
      comment: 'standalone package: no imports from sibling packages or @devdigest/*',
      severity: 'error',
      from: {},
      to: { path: '^\\.\\./|^@devdigest/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
