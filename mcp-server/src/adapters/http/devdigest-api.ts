import { z } from 'zod';
import { DomainError } from '../../domain/errors';
import type { DevDigestApiPort } from '../../domain/ports';

export interface HttpApiOptions {
  /** Base URL without trailing slash. */
  apiUrl: string;
  timeoutMs: number;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Lenient response schemas: only the fields we read. Unknown keys are stripped,
// which is also what keeps `system_prompt` / `evidence_snippet` out of the domain.
// ---------------------------------------------------------------------------

const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish().transform((v) => v ?? null),
  enabled: z.boolean().optional().transform((v) => v ?? true),
});

const repoSchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
});

const pullSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string().nullish().transform((v) => v ?? null),
  status: z.string().nullish().transform((v) => v ?? null),
});

const startedRunSchema = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string().nullish().transform((v) => v ?? null),
});
const startReviewSchema = z.object({ runs: z.array(startedRunSchema).default([]) });

const runSummarySchema = z.object({
  run_id: z.string(),
  agent_id: z.string().nullish().transform((v) => v ?? null),
  agent_name: z.string().nullish().transform((v) => v ?? null),
  status: z.string().nullish().transform((v) => v ?? null),
  error: z.string().nullish().transform((v) => v ?? null),
});

const findingSchema = z.object({
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  category: z.string().nullish().transform((v) => v ?? ''),
  title: z.string(),
  file: z.string().nullish().transform((v) => v ?? ''),
  start_line: z.number().nullish().transform((v) => v ?? null),
  end_line: z.number().nullish().transform((v) => v ?? null),
  rationale: z.string().nullish().transform((v) => v ?? null),
  suggestion: z.string().nullish().transform((v) => v ?? null),
});

const reviewSchema = z.object({
  id: z.string(),
  run_id: z.string().nullish().transform((v) => v ?? null),
  agent_id: z.string().nullish().transform((v) => v ?? null),
  agent_name: z.string().nullish().transform((v) => v ?? ''),
  kind: z.string(),
  verdict: z
    .enum(['request_changes', 'approve', 'comment'])
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  summary: z.string().nullish().transform((v) => v ?? null),
  score: z.number().nullish().transform((v) => v ?? null),
  findings: z.array(findingSchema).nullish().transform((v) => v ?? []),
});

const conventionSchema = z.object({
  id: z.string(),
  rule: z.string(),
  category: z.string().nullish().transform((v) => v ?? ''),
  evidence_path: z.string().nullish().transform((v) => v ?? ''),
  evidence_line_start: z.number().nullish().transform((v) => v ?? null),
  evidence_line_end: z.number().nullish().transform((v) => v ?? null),
  status: z.string(),
});

const strList = z.array(z.string()).nullish().transform((v) => v ?? []);

const blastSchema = z.object({
  stats: z.object({
    symbols: z.number().int(),
    callers: z.number().int(),
    endpoints: z.number().int(),
    crons: z.number().int(),
  }),
  downstream: z
    .array(
      z.object({
        symbol: z.string(),
        file: z.string().nullish().transform((v) => v ?? ''),
        kind: z.string().nullish().transform((v) => v ?? ''),
        callers_total: z.number().int().nullish(),
        callers: z
          .array(
            z.object({
              name: z.string(),
              file: z.string(),
              line: z.number().int(),
            }),
          )
          .nullish()
          .transform((v) => v ?? []),
        endpoints_affected: strList,
        crons_affected: strList,
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
  impacted_endpoints: strList,
  degraded: z.boolean().nullish().transform((v) => v ?? false),
  reason: z.string().nullish().transform((v) => v ?? null),
  /** Server-side per-symbol caller cap; absent on older servers (no extra slicing). */
  max_callers_per_symbol: z.number().int().positive().nullish().transform((v) => v ?? null),
});

// ---------------------------------------------------------------------------

/** `{error:{code,message}}` (DevDigest) or `{statusCode,error,message}` (@fastify/rate-limit & co). */
function extractError(body: unknown, fallbackMessage: string): { code: string; message: string } {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const err = b.error;
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      return {
        code: typeof e.code === 'string' ? e.code : 'unknown',
        message: typeof e.message === 'string' ? e.message : fallbackMessage,
      };
    }
    return {
      code: typeof err === 'string' ? err : 'unknown',
      message: typeof b.message === 'string' ? b.message : fallbackMessage,
    };
  }
  return { code: 'unknown', message: fallbackMessage };
}

function parseRetryAfter(header: string | null, now: number): number {
  const fallback = 60;
  if (!header) return fallback;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
  const at = Date.parse(header);
  return Number.isNaN(at) ? fallback : Math.max(1, Math.ceil((at - now) / 1000));
}

export function createHttpDevDigestApi(options: HttpApiOptions): DevDigestApiPort {
  const { apiUrl, timeoutMs } = options;
  const doFetch = options.fetch ?? globalThis.fetch;

  async function request<S extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    signal?: AbortSignal,
    body?: unknown,
  ): Promise<z.output<S>> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let res: Response;
    let text: string;
    try {
      res = await doFetch(`${apiUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: combined,
      });
      text = await res.text();
    } catch (err) {
      if (signal?.aborted) throw new DomainError('ABORTED');
      if (timeoutSignal.aborted) {
        throw new DomainError('API_TIMEOUT', { apiUrl, seconds: Math.round(timeoutMs / 1000) });
      }
      throw new DomainError('API_UNREACHABLE', { apiUrl, cause: String(err) });
    }

    let json: unknown;
    let parsedOk = true;
    try {
      json = text === '' ? undefined : JSON.parse(text);
    } catch {
      parsedOk = false;
    }

    if (res.status === 429) {
      throw new DomainError('RATE_LIMITED', {
        retryAfterSec: parseRetryAfter(res.headers.get('retry-after'), Date.now()),
      });
    }
    if (res.status >= 500) {
      const { code, message } = extractError(parsedOk ? json : undefined, res.statusText || 'error');
      throw new DomainError('API_SERVER_ERROR', { status: res.status, code, message });
    }
    if (res.status >= 400) {
      const { message } = extractError(parsedOk ? json : undefined, res.statusText || 'bad request');
      throw new DomainError('API_VALIDATION', { status: res.status, message });
    }

    const parsed = parsedOk ? schema.safeParse(json) : undefined;
    if (!parsed || !parsed.success) throw new DomainError('BAD_RESPONSE', { path, apiUrl });
    return parsed.data;
  }

  const id = encodeURIComponent;

  return {
    listAgents: (signal) => request('GET', '/agents', z.array(agentSchema), signal),
    listRepos: (signal) => request('GET', '/repos', z.array(repoSchema), signal),
    listPulls: (repoId, signal) =>
      request('GET', `/repos/${id(repoId)}/pulls`, z.array(pullSchema), signal),
    startReview: async (prId, agentId, signal) => {
      const res = await request(
        'POST',
        `/pulls/${id(prId)}/review`,
        startReviewSchema,
        signal,
        { agentId },
      );
      return res.runs;
    },
    listRuns: (prId, signal) =>
      request('GET', `/pulls/${id(prId)}/runs`, z.array(runSummarySchema), signal),
    listReviews: (prId, signal) =>
      request('GET', `/pulls/${id(prId)}/reviews`, z.array(reviewSchema), signal),
    listConventions: (repoId, signal) =>
      request('GET', `/repos/${id(repoId)}/conventions`, z.array(conventionSchema), signal),
    getBlast: async (prId, signal) => {
      const b = await request('GET', `/pulls/${id(prId)}/blast`, blastSchema, signal);
      return {
        ...b,
        downstream: b.downstream.map((d) => ({
          ...d,
          callers_total: d.callers_total ?? d.callers.length,
        })),
      };
    },
  };
}
