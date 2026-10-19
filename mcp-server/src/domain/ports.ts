import type {
  Agent,
  Convention,
  Pull,
  Repo,
  Review,
  RunSummary,
  StartedRun,
  Blast,
} from './types';

/**
 * Port to the DevDigest HTTP API. All methods reject with a `DomainError`
 * (API_UNREACHABLE | API_TIMEOUT | RATE_LIMITED | API_SERVER_ERROR |
 * API_VALIDATION | BAD_RESPONSE | ABORTED); never with raw fetch errors.
 */
export interface DevDigestApiPort {
  listAgents(signal?: AbortSignal): Promise<Agent[]>;
  listRepos(signal?: AbortSignal): Promise<Repo[]>;
  /** May upsert from GitHub server-side when a token is configured. */
  listPulls(repoId: string, signal?: AbortSignal): Promise<Pull[]>;
  /** NEVER retried by callers: the route is rate limited (10/min) and starts a run. */
  startReview(prId: string, agentId: string, signal?: AbortSignal): Promise<StartedRun[]>;
  /** Newest first. */
  listRuns(prId: string, signal?: AbortSignal): Promise<RunSummary[]>;
  /** Full history, newest first. */
  listReviews(prId: string, signal?: AbortSignal): Promise<Review[]>;
  listConventions(repoId: string, signal?: AbortSignal): Promise<Convention[]>;
  /** Blast-radius map of a PR, read from the repo-intel index (no LLM, no re-parse). */
  getBlast(prId: string, signal?: AbortSignal): Promise<Blast>;
}

export interface ClockPort {
  now(): number;
  /** Resolves after `ms`, or early (without throwing) when `signal` aborts; callers re-check `signal.aborted`. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface LoggerPort {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Dependencies every use case factory receives. */
export interface UseCaseDeps {
  api: DevDigestApiPort;
  clock: ClockPort;
  logger: LoggerPort;
}
