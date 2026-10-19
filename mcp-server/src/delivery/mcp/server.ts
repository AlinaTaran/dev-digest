import { McpServer } from '@modelcontextprotocol/server';
import type { Container } from '../../composition/container';
import pkg from '../../../package.json' with { type: 'json' };
import type { ToolDefinition } from './schemas';
import { getBlastRadiusTool } from './tools/get-blast-radius';
import { getConventionsTool } from './tools/get-conventions';
import { getFindingsTool } from './tools/get-findings';
import { listAgentsTool } from './tools/list-agents';
import { runAgentOnPrTool } from './tools/run-agent-on-pr';

export const TOOLS: ToolDefinition[] = [
  listAgentsTool,
  runAgentOnPrTool,
  getFindingsTool,
  getConventionsTool,
  getBlastRadiusTool,
];

/** Builds the MCP server and registers the 5 tools. No instructions, resources, or prompts on purpose. */
export function createMcpServer(container: Container): McpServer {
  const server = new McpServer({ name: 'devdigest', version: pkg.version });

  for (const tool of TOOLS) {
    server.registerTool(tool.name, tool.config, async (args: unknown, ctx) =>
      tool.handler(args as never, container, { signal: ctx.mcpReq.signal }),
    );
  }

  return server;
}
