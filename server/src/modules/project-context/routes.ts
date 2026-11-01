import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AgentContextResponse,
  ContextAttachBody,
  ContextDocDetail,
  ContextDocQuery,
  ContextDocSaveBody,
  ContextDocSaveResult,
  ContextListing,
  RepoContextQuery,
  SkillContextResponse,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ProjectContextService } from './service.js';

/**
 * Project Context — repo Markdown docs attached (in order) to agents and skills.
 *
 *   GET  /repos/:id/context           → scan the clone, list matching docs
 *   POST /repos/:id/context/reindex   → same scan/body (nothing is indexed)
 *   GET  /repos/:id/context/doc       → one doc (content + hash + used-by)
 *   PUT  /repos/:id/context/doc       → guarded whole-file save (no git, no LLM)
 *   GET/PUT /agents/:id/context       → agent's attached + inherited + effective
 *   GET/PUT /skills/:id/context       → skill's attached set (+ "serializes as")
 *
 * Errors use the spec's exact codes via AppError (Zod validates shape only).
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ProjectContextService(app.container, app.log);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextListing } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listing(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/context/reindex',
    { schema: { params: IdParams, response: { 200: ContextListing } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listing(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/doc',
    { schema: { params: IdParams, querystring: ContextDocQuery, response: { 200: ContextDocDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getDoc(workspaceId, req.params.id, req.query.path);
    },
  );

  app.put(
    '/repos/:id/context/doc',
    { schema: { params: IdParams, body: ContextDocSaveBody, response: { 200: ContextDocSaveResult } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.saveDoc(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams, querystring: RepoContextQuery, response: { 200: AgentContextResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getAgentContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: ContextAttachBody, response: { 200: AgentContextResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.putAgentContext(workspaceId, req.params.id, req.body.repo_id, req.body.paths);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, querystring: RepoContextQuery, response: { 200: SkillContextResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getSkillContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: ContextAttachBody, response: { 200: SkillContextResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.putSkillContext(workspaceId, req.params.id, req.body.repo_id, req.body.paths);
    },
  );
}
