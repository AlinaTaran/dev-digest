import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Container } from '../../composition/container';

// ---------------------------------------------------------------------------
// Input fields. Descriptions are FINAL (spec §4.1) and asserted verbatim by
// test/server.contract.test.ts. Inputs are flat objects of scalars only.
// ---------------------------------------------------------------------------

export const repoField = z.string().min(1).max(200).describe('GitHub repo as "owner/name"');
export const prField = z.number().int().positive().describe('GitHub PR number');
export const agentField = z.string().min(1).max(200).describe('Agent id or name from list_agents');
export const runIdField = z
  .string()
  .uuid()
  .optional()
  .describe('Run id from run_agent_on_pr; omit for latest');
export const severityField = z
  .enum(['CRITICAL', 'WARNING', 'SUGGESTION'])
  .optional()
  .describe('Minimum severity to include');
export const findingsLimitField = z
  .number()
  .int()
  .min(1)
  .max(50)
  .optional()
  .describe('Max items to return');
export const conventionsLimitField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Max items to return');
export const responseFormatField = z
  .enum(['concise', 'detailed'])
  .default('concise')
  .describe('concise (default) or detailed (+rationale)');
export const categoryField = z
  .string()
  .min(1)
  .max(60)
  .optional()
  .describe('Convention category filter');

// ---------------------------------------------------------------------------
// Tool inputs
// ---------------------------------------------------------------------------

export const listAgentsInput = z.object({});
export const runAgentOnPrInput = z.object({ repo: repoField, pr: prField, agent: agentField });
export const getFindingsInput = z.object({
  repo: repoField,
  pr: prField,
  run_id: runIdField,
  agent: agentField.optional().describe('Agent id or name from list_agents'),
  severity: severityField,
  limit: findingsLimitField,
  response_format: responseFormatField,
});
export const getConventionsInput = z.object({
  repo: repoField,
  category: categoryField,
  limit: conventionsLimitField,
});
export const getBlastRadiusInput = z.object({ repo: repoField, pr: prField });

// ---------------------------------------------------------------------------
// Tool outputs (structuredContent)
// ---------------------------------------------------------------------------

// zod 4 emits a bare `z.string().nullable()` as `type: ["string","null"]`, which
// single-`type` client dialects reject. A description on the inner branch keeps it
// as `anyOf: [{type:"string",…}, {type:"null"}]` (asserted by the contract test).
const nullableText = (description: string) => z.string().describe(description).nullable();

const findingOut = z.object({
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  title: z.string(),
  file: z.string(),
  line: z.string().optional(),
  category: z.string(),
  rationale: z.string().optional(),
  suggestion: nullableText('Suggested fix').optional(),
});

export const listAgentsOutput = z.object({
  agents: z.array(
    z.object({ id: z.string(), name: z.string(), description: z.string(), enabled: z.boolean() }),
  ),
  count: z.number().int(),
  next: z.string().optional(),
});

export const reviewResultOutput = z.object({
  status: z.enum(['done', 'running']),
  run_id: z.string(),
  repo: z.string(),
  pr: z.number().int(),
  agent: z.string(),
  verdict: z.enum(['request_changes', 'approve', 'comment']).nullable().optional(),
  score: z.number().int().nullable().optional(),
  summary: nullableText('Review summary').optional(),
  counts: z
    .object({
      critical: z.number().int(),
      warning: z.number().int(),
      suggestion: z.number().int(),
    })
    .optional(),
  findings: z.array(findingOut).optional(),
  truncated: z.boolean().optional(),
  next: z.string().optional(),
});

export const getConventionsOutput = z.object({
  repo: z.string(),
  conventions: z.array(
    z.object({ rule: z.string(), category: z.string(), evidence: z.string() }),
  ),
  count: z.number().int(),
  total_accepted: z.number().int(),
  pending: z.number().int(),
  truncated: z.boolean(),
  next: z.string().optional(),
});

export const getBlastRadiusOutput = z.object({
  status: z.literal('not_implemented'),
  repo: z.string(),
  pr: z.number().int(),
  message: z.string(),
});

// ---------------------------------------------------------------------------
// Tool definition shape shared by tools/*.ts and server.ts
// ---------------------------------------------------------------------------

export interface ToolAnnotationsDef {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolExtra {
  /** From `ctx.mcpReq.signal`: fires when the client cancels the request. */
  signal: AbortSignal;
}

export interface ToolDefinition<
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodObject = z.ZodObject,
> {
  name: string;
  config: {
    title: string;
    description: string;
    inputSchema: I;
    outputSchema: O;
    annotations: ToolAnnotationsDef;
  };
  // Method syntax (bivariant) so heterogeneous tools fit in one `ToolDefinition[]`.
  handler(args: z.infer<I>, container: Container, extra: ToolExtra): Promise<CallToolResult>;
}

export const READ_ONLY_ANNOTATIONS: ToolAnnotationsDef = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
};
