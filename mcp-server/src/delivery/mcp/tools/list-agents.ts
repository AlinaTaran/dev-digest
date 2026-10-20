import { describeError } from '../messages';
import { errorResult, renderAgents, successResult, toAgentsOutput } from '../render';
import {
  listAgentsInput,
  listAgentsOutput,
  READ_ONLY_ANNOTATIONS,
  type ToolDefinition,
} from '../schemas';

export const listAgentsTool: ToolDefinition<typeof listAgentsInput, typeof listAgentsOutput> = {
  name: 'list_agents',
  config: {
    title: 'List DevDigest agents',
    description:
      'List DevDigest reviewer agents (id, name, enabled). Call first to get a valid `agent` for run_agent_on_pr.',
    inputSchema: listAgentsInput,
    outputSchema: listAgentsOutput,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async handler(_args, container, extra) {
    const ctx = container.config;
    try {
      const result = await container.useCases.listAgents(extra.signal);
      return successResult(renderAgents(result, ctx), toAgentsOutput(result, ctx));
    } catch (err) {
      return errorResult(describeError(err, 'list_agents', ctx, container.logger));
    }
  },
};
