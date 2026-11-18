import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AgentCi,
  CiExport,
  CiExportInput,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRunsList,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';

/**
 * Export-to-CI module.
 *
 *   GET  /agents/:id/ci             → installations + recent runs + ci_fail_on
 *   POST /agents/:id/ci/preview     → files that would be created (no GitHub, no LLM)
 *   POST /agents/:id/export-ci      → open_pr (JSON) | zip (application/zip)
 *   GET  /ci/runs                   → newest CI runs of the workspace
 *   POST /ci/runs/refresh           → pull finished runs from GitHub Actions
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container, () => app.log);

  app.get(
    '/agents/:id/ci',
    { schema: { params: IdParams, response: { 200: AgentCi } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getAgentCi(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiPreviewInput, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  // No response schema: the body is JSON for `open_pr` and a zip for `zip`.
  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const out = await service.exportCi(workspaceId, req.params.id, req.body);
      if (out.kind === 'pr') return CiExport.parse(out.result);
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="${out.filename}"`)
        .send(Buffer.from(out.bytes));
    },
  );

  app.get('/ci/runs', { schema: { response: { 200: CiRunsList } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRuns(workspaceId);
  });

  app.post('/ci/runs/refresh', { schema: { response: { 200: CiRefreshResult } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.refresh(workspaceId);
  });
}
