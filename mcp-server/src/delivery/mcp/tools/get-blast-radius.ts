import { describeError } from '../messages';
import { errorResult, renderBlastRadius, successResult, toBlastRadiusOutput } from '../render';
import {
  getBlastRadiusInput,
  getBlastRadiusOutput,
  READ_ONLY_ANNOTATIONS,
  type ToolDefinition,
} from '../schemas';

export const getBlastRadiusTool: ToolDefinition<
  typeof getBlastRadiusInput,
  typeof getBlastRadiusOutput
> = {
  name: 'get_blast_radius',
  config: {
    title: 'Get PR blast radius',
    description:
      'Get the blast radius of a GitHub PR from DevDigest: changed symbols, their callers (file:line), affected endpoints and crons. Same map as the PR Overview tab.',
    inputSchema: getBlastRadiusInput,
    outputSchema: getBlastRadiusOutput,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async handler(args, container, extra) {
    const ctx = container.config;
    try {
      const result = await container.useCases.getBlastRadius(
        { repo: args.repo, pr: args.pr },
        extra.signal,
      );
      return successResult(renderBlastRadius(result, ctx), toBlastRadiusOutput(result, ctx));
    } catch (err) {
      return errorResult(describeError(err, 'get_blast_radius', ctx, container.logger));
    }
  },
};
