import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';

/**
 * Intent module — a cheap, per-workspace, cached PR-intent + risk classifier.
 * Both endpoints return a `PrIntentBrief` (`{ pr_id, intent, in_scope,
 * out_of_scope, risks }`) — risks are surfaced only on the INTENT card, never
 * injected into a review agent's prompt (see `IntentService.computeForRun`).
 *   GET  /pulls/:id/intent            → lazy: cache hit is instant; miss computes (2 LLM calls, parallel) + caches
 *   POST /pulls/:id/intent/recompute  → always recomputes, overwriting the cached `pr_intent` + `pr_brief` rows
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new IntentService(app.container);

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getOrCompute(workspaceId, req.params.id, req.log);
  });

  // Tight per-route limit: each miss/recompute triggers an LLM call (mirrors reviews' POST).
  app.post(
    '/pulls/:id/intent/recompute',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.recompute(workspaceId, req.params.id, req.log);
    },
  );
}
