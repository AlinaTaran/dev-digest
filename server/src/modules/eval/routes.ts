import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalCaseResult,
  EvalCaseView,
  EvalDashboard,
  EvalOverview,
  RunAllEvalBody,
  RunAllEvalResponse,
  EvalDaysQuery,
  EvalRunDetail,
  EvalSuiteRun,
  EvalTargets,
  FindingEvalCaseResponse,
  StartEvalRunResponse,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';

/**
 * Eval module (agent + skill owners).
 *   GET    /findings/:id/eval-targets   → review agent + its linked skills (D18)
 *   GET|POST /skills/:id/eval-cases     → skill case list / create
 *   POST   /skills/:id/eval-runs        → run skill cases on a host agent (202, background)
 *   GET    /skills/:id/eval-runs        → skill run history (never in agent dashboards, AC-86)
 *   POST   /findings/:id/eval-case      → turn a decided finding into an eval case
 *   GET|POST /agents/:id/eval-cases     → list / create
 *   GET|PUT|DELETE /eval-cases/:id      → one case
 *   POST   /eval-cases/:id/run          → run one case synchronously (not in run history)
 *   POST   /agents/:id/eval-runs        → start an eval run (202, background)
 *   GET    /agents/:id/eval-runs        → run history
 *   GET    /eval-runs/:id               → run + per-case results
 *   GET    /agents/:id/eval-dashboard   → agent dashboard (current/delta/trend/alert)
 *   GET    /eval/dashboard              → workspace overview (agent cards + recent runs)
 *   POST   /eval-runs {all:true}        → start every runnable agent (202 {started, skipped})
 *
 * Case bodies are validated inside the service (not by a route schema) so failures are
 * `400 invalid_eval_case` with field paths (AC-20/21), not the global 422.
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Read lazily so a spied/replaced `app.log` is honoured.
  const service = new EvalService(app.container, () => app.log);

  try {
    await service.reapOnBoot();
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'eval boot reaper failed (non-fatal)');
  }

  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams, response: { 200: FindingEvalCaseResponse, 201: FindingEvalCaseResponse } } },
    async (req, reply) => {
      const ctx = await getContext(app.container, req);
      const { status, body } = await service.createFromFinding(ctx, req.params.id, req.body);
      return reply.code(status).send(body);
    },
  );

  app.get(
    '/findings/:id/eval-targets',
    { schema: { params: IdParams, response: { 200: EvalTargets } } },
    async (req) => service.evalTargets(await getContext(app.container, req), req.params.id),
  );

  app.get(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseView) } } },
    async (req) => service.listCases(await getContext(app.container, req), req.params.id, 'skill'),
  );

  app.post(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, response: { 201: EvalCaseView } } },
    async (req, reply) => {
      const created = await service.createCase(
        await getContext(app.container, req),
        req.params.id,
        req.body,
        'skill',
      );
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/skills/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: StartEvalRunResponse } },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const run = await service.startSkillRun(await getContext(app.container, req), req.params.id, req.body);
      return reply.code(202).send({ eval_run: run });
    },
  );

  app.get(
    '/skills/:id/eval-runs',
    { schema: { params: IdParams, querystring: EvalDaysQuery, response: { 200: z.array(EvalSuiteRun) } } },
    async (req) =>
      service.listSkillRuns(await getContext(app.container, req), req.params.id, req.query.days),
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseView) } } },
    async (req) => service.listCases(await getContext(app.container, req), req.params.id),
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 201: EvalCaseView } } },
    async (req, reply) => {
      const created = await service.createCase(await getContext(app.container, req), req.params.id, req.body);
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: EvalCaseView } } },
    async (req) => service.getCase(await getContext(app.container, req), req.params.id),
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: EvalCaseView } } },
    async (req) => service.updateCase(await getContext(app.container, req), req.params.id, req.body),
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req, reply) => {
    await service.deleteCase(await getContext(app.container, req), req.params.id);
    return reply.code(204).send();
  });

  app.post(
    '/eval-cases/:id/run',
    {
      schema: { params: IdParams, response: { 200: EvalCaseResult } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => service.runSingleCase(await getContext(app.container, req), req.params.id, req.body),
  );

  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: StartEvalRunResponse } },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const run = await service.startAgentRun(await getContext(app.container, req), req.params.id);
      return reply.code(202).send({ eval_run: run });
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, querystring: EvalDaysQuery, response: { 200: z.array(EvalSuiteRun) } } },
    async (req) =>
      service.listAgentRuns(await getContext(app.container, req), req.params.id, req.query.days),
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalRunDetail } } },
    async (req) => service.getRun(await getContext(app.container, req), req.params.id),
  );

  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, querystring: EvalDaysQuery, response: { 200: EvalDashboard } } },
    async (req) =>
      service.agentDashboard(await getContext(app.container, req), req.params.id, req.query.days),
  );

  app.get(
    '/eval/dashboard',
    { schema: { querystring: EvalDaysQuery, response: { 200: EvalOverview } } },
    async (req) => service.overview(await getContext(app.container, req)),
  );

  app.post(
    '/eval-runs',
    {
      schema: { body: RunAllEvalBody, response: { 202: RunAllEvalResponse } },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req, reply) => reply.code(202).send(await service.runAllAgents(await getContext(app.container, req))),
  );
}
