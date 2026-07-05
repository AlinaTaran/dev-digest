import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionStatus } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — extracts project-specific coding conventions from a
 * repo's config + top-ranked source files, code-verifies the evidence
 * before persisting, and lets a human curate the resulting candidates.
 *
 *   POST  /repos/:id/conventions/extract → run extraction (sync), returns the new pending candidates
 *   GET   /repos/:id/conventions         → list all candidates for the repo (any status)
 *   PATCH /conventions/:id               → accept/reject/edit a candidate
 */

const UpdateConventionBody = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().optional(),
  evidence_snippet: z.string().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const convention = await service.updateFields(workspaceId, req.params.id, req.body);
      if (!convention) throw new NotFoundError('Convention not found');
      return convention;
    },
  );
}
