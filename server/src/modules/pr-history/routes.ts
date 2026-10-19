import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrHistoryResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PrHistoryService } from './service.js';

/**
 * PR history module — prior PRs that touched the same files, read from the
 * local git clone (no LLM).
 *
 *   GET /pulls/:id/history → PrHistoryResponse
 */
export default async function prHistoryRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new PrHistoryService(app.container);

  app.get(
    '/pulls/:id/history',
    { schema: { params: IdParams, response: { 200: PrHistoryResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.build(workspaceId, req.params.id, req.log);
    },
  );
}
