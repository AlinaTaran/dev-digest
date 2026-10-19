import { createHttpDevDigestApi } from '../adapters/http/devdigest-api';
import { createSystemClock } from '../adapters/system/clock';
import { createStderrLogger } from '../adapters/system/logger';
import type { ClockPort, DevDigestApiPort, LoggerPort, UseCaseDeps } from '../domain/ports';
import { createGetBlastRadius, type GetBlastRadius } from '../domain/use-cases/get-blast-radius';
import { createGetConventions, type GetConventions } from '../domain/use-cases/get-conventions';
import { createGetFindings, type GetFindings } from '../domain/use-cases/get-findings';
import { createListAgents, type ListAgents } from '../domain/use-cases/list-agents';
import { createRunReview, type RunReview } from '../domain/use-cases/run-review';
import type { Config } from './config';

export interface ContainerOverrides {
  api?: DevDigestApiPort;
  clock?: ClockPort;
  logger?: LoggerPort;
}

export interface UseCases {
  listAgents: ListAgents;
  runReview: RunReview;
  getFindings: GetFindings;
  getConventions: GetConventions;
  getBlastRadius: GetBlastRadius;
}

export interface Container {
  config: Config;
  logger: LoggerPort;
  useCases: UseCases;
}

/** The only place adapters are bound to ports. Tests pass fakes via `overrides`. */
export function createContainer(config: Config, overrides: ContainerOverrides = {}): Container {
  const logger = overrides.logger ?? createStderrLogger();
  const clock = overrides.clock ?? createSystemClock();
  const api =
    overrides.api ?? createHttpDevDigestApi({ apiUrl: config.apiUrl, timeoutMs: config.httpTimeoutMs });

  const deps: UseCaseDeps = { api, clock, logger };

  return {
    config,
    logger,
    useCases: {
      listAgents: createListAgents(deps),
      runReview: createRunReview({
        ...deps,
        pollIntervalMs: config.pollIntervalMs,
        runTimeoutMs: config.runTimeoutMs,
      }),
      getFindings: createGetFindings(deps),
      getConventions: createGetConventions(deps),
      getBlastRadius: createGetBlastRadius(),
    },
  };
}
