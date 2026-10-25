import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';
import { isTransientTransportError, withTransportRetry } from '../src/llm/transient.js';

const schema = z.object({ ok: z.boolean() });
const okRes = (content: string) => ({
  choices: [{ message: { content } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
});
const reset = () =>
  Object.assign(
    new Error('Invalid response body while trying to fetch https://openrouter.ai/api/v1/chat/completions: read ECONNRESET'),
    { name: 'FetchError', type: 'system', code: 'ECONNRESET' },
  );

function makeProvider(create: ReturnType<typeof vi.fn>, retries?: number) {
  const sleep = vi.fn(async () => {});
  const p = new OpenRouterProvider('k', { transportRetry: { sleep, random: () => 0.5, retries } });
  (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
  return { p, sleep };
}
const req = { model: 'm', schema, schemaName: 's', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('isTransientTransportError', () => {
  it('classifies errors', () => {
    expect(isTransientTransportError(reset())).toBe(true);
    expect(isTransientTransportError({ cause: { code: 'EPIPE' } })).toBe(true);
    expect(isTransientTransportError(new Error('socket hang up'))).toBe(true);
    expect(isTransientTransportError(Object.assign(new Error('bad'), { status: 400 }))).toBe(false);
    expect(isTransientTransportError(Object.assign(new Error('x'), { name: 'AbortError', code: 'ECONNRESET' }))).toBe(false);
    expect(isTransientTransportError(new Error('boom'))).toBe(false);
  });
});

describe('withTransportRetry', () => {
  it('backs off exponentially', async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn().mockRejectedValueOnce(reset()).mockRejectedValueOnce(reset()).mockResolvedValue('x');
    await expect(withTransportRetry(fn, { sleep, random: () => 0, baseDelayMs: 100 })).resolves.toBe('x');
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([50, 100]);
  });
});

describe('OpenRouterProvider transport retry', () => {
  it('retries a body-read ECONNRESET then succeeds with correct attempts/tokens', async () => {
    const create = vi.fn().mockRejectedValueOnce(reset()).mockResolvedValueOnce(okRes('{"ok":true}'));
    const { p, sleep } = makeProvider(create);
    const r = await p.completeStructured(req);
    expect(r.data).toEqual({ ok: true });
    expect(r.attempts).toBe(1);
    expect(r.tokensIn).toBe(10);
    expect(r.tokensOut).toBe(5);
    expect(create).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('throws the original error after exhausting retries', async () => {
    const create = vi.fn().mockRejectedValue(reset());
    const { p } = makeProvider(create, 2);
    await expect(p.completeStructured(req)).rejects.toThrow(/Invalid response body.*ECONNRESET/);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('does not retry 4xx API errors', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('400 bad request'), { status: 400 }));
    const { p, sleep } = makeProvider(create);
    await expect(p.completeStructured(req)).rejects.toThrow('400 bad request');
    expect(create).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('schema-repair loop is unaffected', async () => {
    const create = vi.fn().mockResolvedValueOnce(okRes('not json')).mockResolvedValueOnce(okRes('{"ok":true}'));
    const { p, sleep } = makeProvider(create);
    const r = await p.completeStructured(req);
    expect(r.attempts).toBe(2);
    expect(r.tokensIn).toBe(20);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('OpenRouterProvider per-request timeout', () => {
  it('passes req.timeoutMs (timeout + abort signal) to the SDK call, and nothing when absent', async () => {
    const create = vi.fn().mockResolvedValue(okRes('{"ok":true}'));
    const { p } = makeProvider(create);
    await p.completeStructured({ ...req, timeoutMs: 1234 });
    const opts = create.mock.calls[0]![1] as { timeout: number; signal: AbortSignal };
    expect(opts.timeout).toBe(1234);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    await p.completeStructured(req);
    expect(create.mock.calls[1]![1]).toBeUndefined();
  });
});
