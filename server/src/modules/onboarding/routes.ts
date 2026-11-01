import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ERR_UNAVAILABLE } from './constants.js';
import {
  OnboardingGenerateResponse,
  OnboardingTourResponse,
  OnboardingUnavailableBody,
} from './schemas.js';
import { OnboardingService, OnboardingUnavailable } from './service.js';

/**
 * Onboarding Tour module.
 *
 *   GET  /repos/:id/onboarding           → stored tour + generation state (no git, no LLM)
 *   POST /repos/:id/onboarding/generate  → start a background generation (202), single-flight
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Read lazily so a spied/replaced `app.log` is honoured.
  const service = new OnboardingService(app.container, () => app.log);

  service.registerJobHandler();
  try {
    await service.reapOnBoot();
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'onboarding boot reaper failed (non-fatal)');
  }

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: OnboardingTourResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getTour(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    {
      schema: {
        params: IdParams,
        response: { 202: OnboardingGenerateResponse, 409: OnboardingUnavailableBody },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      try {
        const res = await service.startGeneration(workspaceId, req.params.id);
        return reply.code(202).send(res);
      } catch (err) {
        if (err instanceof OnboardingUnavailable) {
          return reply.code(409).send({
            error: { code: ERR_UNAVAILABLE, message: err.message, reason: err.reason },
          });
        }
        throw err;
      }
    },
  );
}
