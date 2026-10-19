import { describeError } from '../messages';
import { errorResult, renderReview, successResult, toReviewOutput } from '../render';
import {
  reviewResultOutput,
  runAgentOnPrInput,
  type ToolDefinition,
} from '../schemas';

export const runAgentOnPrTool: ToolDefinition<typeof runAgentOnPrInput, typeof reviewResultOutput> = {
  name: 'run_agent_on_pr',
  config: {
    title: 'Run DevDigest review on a PR',
    description:
      'Run a DevDigest reviewer agent on a GitHub PR and return its verdict and findings. Waits up to ~100s; if still running, returns run_id for get_findings.',
    inputSchema: runAgentOnPrInput,
    outputSchema: reviewResultOutput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async handler(args, container, extra) {
    const ctx = container.config;
    try {
      const result = await container.useCases.runReview(
        { repo: args.repo, pr: args.pr, agent: args.agent },
        extra.signal,
      );
      return successResult(renderReview(result, ctx), toReviewOutput(result, ctx));
    } catch (err) {
      return errorResult(describeError(err, 'run_agent_on_pr', ctx, container.logger));
    }
  },
};
