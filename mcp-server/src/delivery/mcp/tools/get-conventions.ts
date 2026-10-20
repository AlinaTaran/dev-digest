import { describeError } from '../messages';
import { errorResult, renderConventions, successResult, toConventionsOutput } from '../render';
import {
  getConventionsInput,
  getConventionsOutput,
  READ_ONLY_ANNOTATIONS,
  type ToolDefinition,
} from '../schemas';

export const getConventionsTool: ToolDefinition<
  typeof getConventionsInput,
  typeof getConventionsOutput
> = {
  name: 'get_conventions',
  config: {
    title: 'Get repo conventions',
    description:
      'Get accepted coding conventions of a repo from DevDigest (rule, category, file:line). Use before writing or reviewing code there.',
    inputSchema: getConventionsInput,
    outputSchema: getConventionsOutput,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async handler(args, container, extra) {
    const ctx = container.config;
    try {
      const result = await container.useCases.getConventions(args, extra.signal);
      return successResult(renderConventions(result, ctx), toConventionsOutput(result, ctx));
    } catch (err) {
      return errorResult(describeError(err, 'get_conventions', ctx, container.logger));
    }
  },
};
