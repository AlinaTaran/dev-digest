import { describe, expect, it } from 'vitest';
import { createHttpDevDigestApi } from '../../src/adapters/http/devdigest-api';
import { DomainError } from '../../src/domain/errors';

const API = 'http://api.test';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function makeApi(handler: Handler, timeoutMs = 1000) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { api: createHttpDevDigestApi({ apiUrl: API, timeoutMs, fetch: fetchImpl }), requests };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

async function codeOf(p: Promise<unknown>): Promise<DomainError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    return e as DomainError;
  }
  throw new Error('expected rejection');
}

describe('http DevDigest API adapter', () => {
  it('maps happy paths and strips fields we must never return', async () => {
    const { api, requests } = makeApi((url) => {
      if (url.endsWith('/agents'))
        return json([
          { id: 'a1', name: 'Sec', description: null, enabled: false, system_prompt: 'TOP SECRET', model: 'x' },
        ]);
      if (url.endsWith('/repos'))
        return json([{ id: 'r1', owner: 'acme', name: 'shop', full_name: 'acme/shop', extra: 1 }]);
      if (url.endsWith('/repos/r1/pulls')) return json([{ id: 'p1', number: 7, title: 'T', status: 'open', more: 1 }]);
      if (url.endsWith('/pulls/p1/review'))
        return json({ pr_id: 'p1', runs: [{ run_id: 'run1', agent_id: 'a1', agent_name: 'Sec' }], reviews: [] });
      if (url.endsWith('/pulls/p1/runs'))
        return json([{ run_id: 'run1', agent_id: 'a1', agent_name: 'Sec', status: 'done', error: null, cost_usd: 1 }]);
      if (url.endsWith('/pulls/p1/reviews'))
        return json([
          {
            id: 'rv1',
            run_id: 'run1',
            agent_id: 'a1',
            agent_name: 'Sec',
            kind: 'review',
            verdict: 'weird',
            summary: 's',
            score: 50,
            findings: [
              {
                id: 'f1',
                severity: 'CRITICAL',
                category: 'bug',
                title: 't',
                file: 'a.ts',
                start_line: 1,
                end_line: 2,
                rationale: 'r',
                suggestion: null,
                confidence: 0.9,
              },
            ],
          },
        ]);
      if (url.endsWith('/repos/r1/conventions'))
        return json([
          {
            id: 'c1',
            rule: 'R',
            category: 'style',
            evidence_path: 'a.ts',
            evidence_line_start: null,
            evidence_line_end: null,
            evidence_snippet: 'SNIPPET',
            confidence: 1,
            status: 'accepted',
          },
        ]);
      return json({ error: { code: 'not_found', message: 'nope' } }, 404);
    });

    const agents = await api.listAgents();
    expect(agents).toEqual([{ id: 'a1', name: 'Sec', description: null, enabled: false }]);
    expect(JSON.stringify(agents)).not.toContain('SECRET');
    expect(await api.listRepos()).toEqual([
      { id: 'r1', owner: 'acme', name: 'shop', full_name: 'acme/shop' },
    ]);
    expect(await api.listPulls('r1')).toEqual([{ id: 'p1', number: 7, title: 'T', status: 'open' }]);
    expect(await api.startReview('p1', 'a1')).toEqual([
      { run_id: 'run1', agent_id: 'a1', agent_name: 'Sec' },
    ]);
    const post = requests.find((r) => r.url.endsWith('/review'));
    expect(post?.init.method).toBe('POST');
    expect(post?.init.body).toBe(JSON.stringify({ agentId: 'a1' }));
    expect((await api.listRuns('p1'))[0]).toMatchObject({ run_id: 'run1', status: 'done', error: null });

    const [review] = await api.listReviews('p1');
    expect(review?.verdict).toBeNull();
    expect(review?.findings[0]).toEqual({
      severity: 'CRITICAL',
      category: 'bug',
      title: 't',
      file: 'a.ts',
      start_line: 1,
      end_line: 2,
      rationale: 'r',
      suggestion: null,
    });

    const conventions = await api.listConventions('r1');
    expect(JSON.stringify(conventions)).not.toContain('SNIPPET');
    expect(conventions[0]?.evidence_line_start).toBeNull();
  });

  it('maps an unreachable server to API_UNREACHABLE', async () => {
    const { api } = makeApi(() => {
      throw new TypeError('fetch failed');
    });
    const err = await codeOf(api.listAgents());
    expect(err.code).toBe('API_UNREACHABLE');
    expect(err.details.apiUrl).toBe(API);
  });

  it('maps a slow server to API_TIMEOUT', async () => {
    const { api } = makeApi(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
      20,
    );
    const err = await codeOf(api.listAgents());
    expect(err.code).toBe('API_TIMEOUT');
    expect(err.details.apiUrl).toBe(API);
  });

  it('reports ABORTED (not a failure) when the caller cancels', async () => {
    const controller = new AbortController();
    const { api } = makeApi(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const pending = api.listRuns('p1', controller.signal);
    controller.abort();
    expect((await codeOf(pending)).code).toBe('ABORTED');
  });

  it('maps 404 and 422 (DevDigest error body) to API_VALIDATION', async () => {
    const notFound = makeApi(() => json({ error: { code: 'not_found', message: 'Repo missing' } }, 404));
    const e404 = await codeOf(notFound.api.listPulls('x'));
    expect(e404.code).toBe('API_VALIDATION');
    expect(e404.details).toMatchObject({ status: 404, message: 'Repo missing' });

    const invalid = makeApi(() =>
      json({ error: { code: 'validation_error', message: 'bad uuid', details: [] } }, 422),
    );
    const e422 = await codeOf(invalid.api.listRuns('nope'));
    expect(e422.code).toBe('API_VALIDATION');
    expect(e422.details.message).toBe('bad uuid');
  });

  it('maps 429 to RATE_LIMITED for both body shapes, reading retry-after', async () => {
    const devdigest = makeApi(() =>
      json({ error: { code: 'rate_limited', message: 'slow down' } }, 429, { 'retry-after': '17' }),
    );
    const a = await codeOf(devdigest.api.startReview('p', 'a'));
    expect(a.code).toBe('RATE_LIMITED');
    expect(a.details.retryAfterSec).toBe(17);

    const fastify = makeApi(() =>
      json({ statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' }, 429, {
        'retry-after': '3',
      }),
    );
    const b = await codeOf(fastify.api.startReview('p', 'a'));
    expect(b.code).toBe('RATE_LIMITED');
    expect(b.details.retryAfterSec).toBe(3);

    const noHeader = makeApi(() => json({}, 429));
    expect((await codeOf(noHeader.api.startReview('p', 'a'))).details.retryAfterSec).toBe(60);
  });

  it('maps 500 to API_SERVER_ERROR with the server message', async () => {
    const { api } = makeApi(() => json({ error: { code: 'internal', message: 'db down' } }, 500));
    const err = await codeOf(api.listRepos());
    expect(err.code).toBe('API_SERVER_ERROR');
    expect(err.details).toMatchObject({ status: 500, code: 'internal', message: 'db down' });
  });

  it('maps non-JSON and wrong-shaped 200 responses to BAD_RESPONSE', async () => {
    const html = makeApi(() => new Response('<html>nginx</html>', { status: 200 }));
    const e1 = await codeOf(html.api.listAgents());
    expect(e1.code).toBe('BAD_RESPONSE');
    expect(e1.details).toMatchObject({ path: '/agents', apiUrl: API });

    const wrong = makeApi(() => json({ not: 'an array' }));
    expect((await codeOf(wrong.api.listRepos())).code).toBe('BAD_RESPONSE');
  });

  it('never retries: one request per call even on 429', async () => {
    const { api, requests } = makeApi(() => json({}, 429, { 'retry-after': '1' }));
    await codeOf(api.startReview('p', 'a'));
    expect(requests).toHaveLength(1);
  });
});
