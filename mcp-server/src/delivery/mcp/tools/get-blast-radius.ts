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
    title: 'PR blast radius (not implemented)',
    description:
      'NOT IMPLEMENTED YET (stub): will show code affected by a PR. Currently always returns status not_implemented — do not retry.',
    inputSchema: getBlastRadiusInput,
    outputSchema: getBlastRadiusOutput,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async handler(args, container) {
    const ctx = container.config;
    try {
      const result = await container.useCases.getBlastRadius({ repo: args.repo, pr: args.pr });
      return successResult(renderBlastRadius(result, ctx), toBlastRadiusOutput(result, ctx));
    } catch (err) {
      return errorResult(describeError(err, 'get_blast_radius', ctx, container.logger));
    }
  },
};
