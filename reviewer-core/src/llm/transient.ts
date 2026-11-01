/**
 * Transport-level retry for LLM calls. Pure: the only side effect is the
 * injectable `sleep`. The OpenAI SDK retries before headers / on 429 / 5xx only;
 * a connection reset while the BODY is read (ECONNRESET after 200 headers)
 * escapes it, so we retry those here, around the single HTTP call.
 */

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'UND_ERR_SOCKET']);
const TRANSIENT_MESSAGE = /Invalid response body while trying to fetch|terminated|socket hang up/i;
const MAX_CAUSE_DEPTH = 5;

export interface TransportRetryOptions {
  /** Retries after the first attempt (default 2). */
  retries?: number;
  /** First backoff delay in ms; doubles each retry (default 500). */
  baseDelayMs?: number;
  /** Upper bound for a single delay in ms (default 8000). */
  maxDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests; returns [0,1). */
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** True for transient network / body-read failures; false for API 4xx, aborts and everything else. */
export function isTransientTransportError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && cur && typeof cur === 'object'; depth++) {
    const e = cur as { name?: unknown; status?: unknown; code?: unknown; type?: unknown; message?: unknown; cause?: unknown };
    if (e.name === 'AbortError' || e.name === 'APIUserAbortError') return false;
    if (typeof e.status === 'number' && e.status >= 400 && e.status < 500) return false;
    if (typeof e.code === 'string' && TRANSIENT_CODES.has(e.code)) return true;
    if (e.name === 'FetchError' && e.type === 'system') return true;
    if (typeof e.message === 'string' && TRANSIENT_MESSAGE.test(e.message)) return true;
    cur = e.cause;
  }
  return false;
}

/** Run `fn`, retrying transient transport errors with exponential backoff + jitter. Rethrows the original error. */
export async function withTransportRetry<T>(fn: () => Promise<T>, opts: TransportRetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8000;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  for (let retry = 0; ; retry++) {
    try {
      return await fn();
    } catch (err) {
      if (retry >= retries || !isTransientTransportError(err)) throw err;
      const exp = Math.min(max, base * 2 ** retry);
      // Equal jitter: half fixed, half random.
      await sleep(exp / 2 + random() * (exp / 2));
    }
  }
}
