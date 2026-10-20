import { describeError } from '../messages';
import { errorResult, renderReview, successResult, toReviewOutput } from '../render';
import {
  getFindingsInput,
  READ_ONLY_ANNOTATIONS,
  reviewResultOutput,
  type ToolDefinition,
} from '../schemas';

export const getFindingsTool: ToolDefinition<typeof getFindingsInput, typeof reviewResultOutput> = {
  name: 'get_findings',
  config: {
    title: 'Get DevDigest review findings',
    description:
      'Get verdict and findings of an existing DevDigest review on a PR (latest, or by run_id). Filter by min severity; detailed adds rationale.',
    inputSchema: getFindingsInput,
    outputSchema: reviewResultOutput,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async handler(args, container, extra) {
    const ctx = container.config;
    try {
      const result = await container.useCases.getFindings(args, extra.signal);
      return successResult(renderReview(result, ctx), toReviewOutput(result, ctx));
    } catch (err) {
      return errorResult(describeError(err, 'get_findings', ctx, container.logger));
    }
  },
};
