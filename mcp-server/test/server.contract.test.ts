import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './helpers/harness';

const REPO = 'GitHub repo as "owner/name"';
const PR = 'GitHub PR number';
const AGENT = 'Agent id or name from list_agents';
const RUN_ID = 'Run id from run_agent_on_pr; omit for latest';
const SEVERITY = 'Minimum severity to include';
const LIMIT = 'Max items to return';
const FORMAT = 'concise (default) or detailed (+rationale)';
const CATEGORY = 'Convention category filter';

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

// Verbatim copy of spec §4.1 — do not paraphrase.
const EXPECTED: Record<
  string,
  {
    title: string;
    description: string;
    params: Record<string, string>;
    required: string[];
    annotations: Record<string, boolean>;
  }
> = {
  list_agents: {
    title: 'List DevDigest agents',
    description:
      'List DevDigest reviewer agents (id, name, enabled). Call first to get a valid `agent` for run_agent_on_pr.',
    params: {},
    required: [],
    annotations: READ_ONLY,
  },
  run_agent_on_pr: {
    title: 'Run DevDigest review on a PR',
    description:
      'Run a DevDigest reviewer agent on a GitHub PR and return its verdict and findings. Waits up to ~100s; if still running, returns run_id for get_findings.',
    params: { repo: REPO, pr: PR, agent: AGENT },
    required: ['repo', 'pr', 'agent'],
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  get_findings: {
    title: 'Get DevDigest review findings',
    description:
      'Get verdict and findings of an existing DevDigest review on a PR (latest, or by run_id). Filter by min severity; detailed adds rationale.',
    params: {
      repo: REPO,
      pr: PR,
      run_id: RUN_ID,
      agent: AGENT,
      severity: SEVERITY,
      limit: LIMIT,
      response_format: FORMAT,
    },
    required: ['repo', 'pr'],
    annotations: READ_ONLY,
  },
  get_conventions: {
    title: 'Get repo conventions',
    description:
      'Get accepted coding conventions of a repo from DevDigest (rule, category, file:line). Use before writing or reviewing code there.',
    params: { repo: REPO, category: CATEGORY, limit: LIMIT },
    required: ['repo'],
    annotations: READ_ONLY,
  },
  get_blast_radius: {
    title: 'PR blast radius (not implemented)',
    description:
      'NOT IMPLEMENTED YET (stub): will show code affected by a PR. Currently always returns status not_implemented — do not retry.',
    params: { repo: REPO, pr: PR },
    required: ['repo', 'pr'],
    annotations: READ_ONLY,
  },
};

const SCALAR_TYPES = new Set(['string', 'integer', 'number', 'boolean']);

describe('MCP server contract', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it('exposes exactly the 5 tools with final metadata, flat schemas and annotations', async () => {
    const { tools } = await h.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED).sort());

    for (const tool of tools) {
      const want = EXPECTED[tool.name];
      expect(want, tool.name).toBeDefined();
      if (!want) continue;

      expect(tool.title).toBe(want.title);
      expect(tool.description).toBe(want.description);
      expect(tool.annotations).toEqual(want.annotations);
      expect(tool.outputSchema, `${tool.name} outputSchema`).toBeDefined();

      const schema = tool.inputSchema as {
        type: string;
        properties?: Record<string, { type?: string; description?: string }>;
        required?: string[];
        anyOf?: unknown;
        oneOf?: unknown;
        allOf?: unknown;
      };
      expect(schema.type).toBe('object');
      expect(schema.anyOf).toBeUndefined();
      expect(schema.oneOf).toBeUndefined();
      expect(schema.allOf).toBeUndefined();

      const props = schema.properties ?? {};
      expect(Object.keys(props).sort()).toEqual(Object.keys(want.params).sort());
      expect([...(schema.required ?? [])].sort()).toEqual([...want.required].sort());

      for (const [name, prop] of Object.entries(props)) {
        expect(name).toMatch(/^[A-Za-z0-9_.-]{1,64}$/);
        expect(SCALAR_TYPES.has(prop.type ?? ''), `${tool.name}.${name} is scalar`).toBe(true);
        expect(prop.description, `${tool.name}.${name} description`).toBe(want.params[name]);
      }
    }
  });

  // Portability: single-`type` dialects (e.g. Gemini's OpenAPI subset) reject `type: [...]`.
  // Nullables must be emitted as `anyOf` with one `type` per branch.
  it('emits no array-valued `type` in any input or output schema', async () => {
    const { tools } = await h.client.listTools();
    const offenders: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray((node as { type?: unknown }).type)) offenders.push(path);
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    };
    for (const tool of tools) {
      walk(tool.inputSchema, `${tool.name}.inputSchema`);
      walk(tool.outputSchema, `${tool.name}.outputSchema`);
    }
    expect(offenders).toEqual([]);
  });

  it('advertises no server instructions, resources or prompts', () => {
    expect(h.client.getInstructions()).toBeUndefined();
    const caps = h.client.getServerCapabilities() ?? {};
    expect(caps.resources).toBeUndefined();
    expect(caps.prompts).toBeUndefined();
  });
});
