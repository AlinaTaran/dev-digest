import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AgentEstimate, MultiAgentRun, MultiAgentRunRequest, MultiAgentRunSummary } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MultiAgentService } from './service.js';

/**
 * Multi-agent review module.
 *
 *   POST /pulls/:id/multi-agent-run → start N agents in parallel (returns at once)
 *   GET  /pulls/:id/multi-agent     → the PR's latest multi-run (groups/conflicts computed on read)
 *   GET  /repos/:id/multi-agent-runs → the repo's recent multi-runs (?limit, default 10, max 20)
 *   GET  /agents/estimates          → mean duration/cost of each agent's last 5 done runs
 */
export default async function multiAgentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new MultiAgentService(app.container);

  app.post(
    '/pulls/:id/multi-agent-run',
    {
      schema: { params: IdParams, body: MultiAgentRunRequest, response: { 200: MultiAgentRun } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.startMultiRun(workspaceId, req.params.id, req.body.agent_ids, req.log);
    },
  );

  app.get(
    '/pulls/:id/multi-agent',
    { schema: { params: IdParams, response: { 200: MultiAgentRun } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getLatest(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/multi-agent-runs',
    {
      schema: {
        params: IdParams,
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(20).default(10) }),
        response: { 200: z.array(MultiAgentRunSummary) },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listRecent(workspaceId, req.params.id, req.query.limit);
    },
  );

  // Static segment: find-my-way prefers it over `/agents/:id`.
  app.get(
    '/agents/estimates',
    { schema: { response: { 200: z.array(AgentEstimate) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.estimates(workspaceId);
    },
  );
}
