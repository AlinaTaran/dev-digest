import { DomainError } from '../domain/errors';
import type { ClockPort, DevDigestApiPort, LoggerPort } from '../domain/ports';
import type {
  Agent,
  Convention,
  Pull,
  Repo,
  Review,
  RunSummary,
  StartedRun,
  Blast,
} from '../domain/types';

export type ApiMethod = keyof DevDigestApiPort;

/** An enqueued outcome: a value to return, an Error to throw, or a function computing either. */
type Outcome = unknown | Error | ((...args: unknown[]) => unknown);

interface Call {
  method: ApiMethod;
  args: unknown[];
}

/**
 * Scriptable in-memory DevDigestApiPort for tests.
 *
 * - Data lives in the public stores (`agents`, `repos`, `pulls[repoId]`, `runs[prId]`,
 *   `reviews[prId]`, `conventions[repoId]`, `blasts[prId]`); methods read from them.
 * - `enqueue(method, ...outcomes)` overrides the next N calls of `method` (FIFO); once
 *   drained, the method falls back to the stores. An `Error` outcome is thrown
 *   (use `new DomainError(...)`); a function outcome is called with the call args.
 * - `startReview` default: returns one run `{run_id: nextRunId, agent_id}` (set `nextRunId`).
 * - Every call is recorded in `calls` (`callsTo('startReview')`, `count(...)`).
 */
export class FakeDevDigestApi implements DevDigestApiPort {
  agents: Agent[] = [];
  repos: Repo[] = [];
  pulls: Record<string, Pull[]> = {};
  runs: Record<string, RunSummary[]> = {};
  reviews: Record<string, Review[]> = {};
  conventions: Record<string, Convention[]> = {};
  blasts: Record<string, Blast> = {};
  nextRunId = '00000000-0000-4000-8000-0000000000aa';
  readonly calls: Call[] = [];

  private readonly queues = new Map<ApiMethod, Outcome[]>();

  enqueue(method: ApiMethod, ...outcomes: Outcome[]): this {
    const queue = this.queues.get(method) ?? [];
    queue.push(...outcomes);
    this.queues.set(method, queue);
    return this;
  }

  callsTo(method: ApiMethod): Call[] {
    return this.calls.filter((c) => c.method === method);
  }

  count(method: ApiMethod): number {
    return this.callsTo(method).length;
  }

  private run<T>(method: ApiMethod, args: unknown[], fallback: () => T): T {
    this.calls.push({ method, args });
    const queue = this.queues.get(method);
    if (queue && queue.length > 0) {
      const outcome = queue.shift();
      if (outcome instanceof Error) throw outcome;
      return (typeof outcome === 'function' ? (outcome as (...a: unknown[]) => unknown)(...args) : outcome) as T;
    }
    return fallback();
  }

  async listAgents(signal?: AbortSignal): Promise<Agent[]> {
    return this.run('listAgents', [signal], () => this.agents);
  }

  async listRepos(signal?: AbortSignal): Promise<Repo[]> {
    return this.run('listRepos', [signal], () => this.repos);
  }

  async listPulls(repoId: string, signal?: AbortSignal): Promise<Pull[]> {
    return this.run('listPulls', [repoId, signal], () => this.pulls[repoId] ?? []);
  }

  async startReview(prId: string, agentId: string, signal?: AbortSignal): Promise<StartedRun[]> {
    return this.run('startReview', [prId, agentId, signal], () => [
      { run_id: this.nextRunId, agent_id: agentId, agent_name: null },
    ]);
  }

  async listRuns(prId: string, signal?: AbortSignal): Promise<RunSummary[]> {
    return this.run('listRuns', [prId, signal], () => this.runs[prId] ?? []);
  }

  async listReviews(prId: string, signal?: AbortSignal): Promise<Review[]> {
    return this.run('listReviews', [prId, signal], () => this.reviews[prId] ?? []);
  }

  async listConventions(repoId: string, signal?: AbortSignal): Promise<Convention[]> {
    return this.run('listConventions', [repoId, signal], () => this.conventions[repoId] ?? []);
  }

  async getBlast(prId: string, signal?: AbortSignal): Promise<Blast> {
    return this.run('getBlast', [prId, signal], () => {
      const blast = this.blasts[prId];
      if (!blast) {
        throw new DomainError('API_VALIDATION', { status: 404, message: 'Pull request not found' });
      }
      return blast;
    });
  }
}

/** Convenience for tests that need an unreachable API. */
export function apiUnreachable(apiUrl = 'http://localhost:3001'): DomainError {
  return new DomainError('API_UNREACHABLE', { apiUrl });
}

/**
 * Deterministic ClockPort: `sleep` advances virtual time instantly (no real waiting)
 * and records the requested durations. Like the real clock it returns early when the
 * signal is already aborted. `advance(ms)` moves time manually.
 */
export class FakeClock implements ClockPort {
  private time: number;
  readonly sleeps: number[] = [];
  /** Optional hook run on every sleep (e.g. abort a controller after N polls). */
  onSleep?: (ms: number, count: number) => void;

  constructor(start = 1_000_000) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  advance(ms: number): void {
    this.time += ms;
  }

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    this.sleeps.push(ms);
    this.time += ms;
    this.onSleep?.(ms, this.sleeps.length);
  }
}

export interface LoggedLine {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
}

/** Silent LoggerPort that records lines in `lines` (assert internal errors are logged, not leaked). */
export function createSilentLogger(): LoggerPort & { lines: LoggedLine[] } {
  const lines: LoggedLine[] = [];
  const add =
    (level: LoggedLine['level']) =>
    (message: string, meta?: Record<string, unknown>): void => {
      lines.push(meta ? { level, message, meta } : { level, message });
    };
  return { lines, debug: add('debug'), info: add('info'), warn: add('warn'), error: add('error') };
}
