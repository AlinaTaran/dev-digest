import { describe, expect, it } from 'vitest';
import { createSilentLogger, FakeClock, FakeDevDigestApi } from '../../src/adapters/mocks';
import { DomainError } from '../../src/domain/errors';
import { createRunReview } from '../../src/domain/use-cases/run-review';
import { makeFinding, makeReview, makeRun, PR_ID, RUN_ID, seedWorld } from '../helpers/fixtures';

function setup(over: { pollIntervalMs?: number; runTimeoutMs?: number } = {}) {
  const api = new FakeDevDigestApi();
  seedWorld(api);
  api.nextRunId = RUN_ID;
  const clock = new FakeClock();
  const run = createRunReview({
    api,
    clock,
    logger: createSilentLogger(),
    pollIntervalMs: 1000,
    runTimeoutMs: 10_000,
    ...over,
  });
  return { api, clock, run };
}

const input = { repo: 'acme/shop', pr: 42, agent: 'security' };

describe('runReview use case', () => {
  it('polls until done, then shapes the review (cap 20, counts over all)', async () => {
    const { api, run } = setup();
    api.runs[PR_ID] = [makeRun({ status: 'running' })];
    api.enqueue('listRuns', [makeRun({ status: 'running' })], [makeRun({ status: 'running' })], [
      makeRun({ status: 'done' }),
    ]);
    api.reviews[PR_ID] = [
      makeReview({ findings: Array.from({ length: 25 }, (_, i) => makeFinding({ title: `f${i}` })) }),
    ];

    const res = await run(input);

    expect(res.status).toBe('done');
    expect(api.count('listRuns')).toBe(3);
    expect(api.count('startReview')).toBe(1);
    expect(res.findings).toHaveLength(20);
    expect(res.truncated).toBe(true);
    expect(res.counts?.warning).toBe(25);
  });

  it('never re-POSTs and keeps polling on unknown status and transient errors', async () => {
    const { api, run } = setup();
    api.enqueue(
      'listRuns',
      new DomainError('API_SERVER_ERROR', { status: 500, code: 'x', message: 'y' }),
      [makeRun({ status: null })],
      [makeRun({ status: 'done' })],
    );
    api.reviews[PR_ID] = [makeReview()];
    expect((await run(input)).status).toBe('done');
    expect(api.count('startReview')).toBe(1);
  });

  it('waits at least retry-after on a polling 429', async () => {
    const { api, clock, run } = setup();
    api.enqueue('listRuns', new DomainError('RATE_LIMITED', { retryAfterSec: 7 }), [
      makeRun({ status: 'done' }),
    ]);
    api.reviews[PR_ID] = [makeReview()];
    await run(input);
    expect(clock.sleeps[0]).toBe(7000);
  });

  it('returns a non-error running result (with run_id) on non-terminal polling errors', async () => {
    for (const code of ['BAD_RESPONSE', 'API_VALIDATION'] as const) {
      const { api, run } = setup();
      api.enqueue('listRuns', new DomainError(code, { path: '/x', apiUrl: '' }));
      const res = await run(input);
      expect(res.status).toBe('running');
      expect(res.run_id).toBe(RUN_ID);
      expect(res.hint?.code).toBe('NEXT_POLL');
    }
  });

  it('clamps each sleep to the remaining budget', async () => {
    const { api, clock, run } = setup({ pollIntervalMs: 4000, runTimeoutMs: 10_000 });
    api.runs[PR_ID] = [makeRun({ status: 'running' })];
    const res = await run(input);
    expect(res.status).toBe('running');
    expect(clock.sleeps).toEqual([4000, 4000, 2000]);
  });

  it('throws RUN_FAILED for failed runs', async () => {
    const { api, run } = setup();
    api.runs[PR_ID] = [makeRun({ status: 'failed', error: 'OPENAI_API_KEY missing' })];
    await expect(run(input)).rejects.toMatchObject({
      code: 'RUN_FAILED',
      details: { run_id: RUN_ID, status: 'failed', error: 'OPENAI_API_KEY missing' },
    });
  });

  it('throws REVIEW_MISSING when done without a matching review', async () => {
    const { api, run } = setup();
    api.runs[PR_ID] = [makeRun({ status: 'done' })];
    api.reviews[PR_ID] = [makeReview({ run_id: 'other' })];
    await expect(run(input)).rejects.toMatchObject({ code: 'REVIEW_MISSING' });
  });

  it('returns running after the budget elapses', async () => {
    const { api, run } = setup({ runTimeoutMs: 5000 });
    api.runs[PR_ID] = [makeRun({ status: 'running' })];
    const res = await run(input);
    expect(res).toMatchObject({ status: 'running', run_id: RUN_ID, repo: 'acme/shop', pr: 42 });
    expect(res.hint?.code).toBe('NEXT_POLL');
  });

  it('returns running when aborted and does not POST for a disabled agent', async () => {
    const { api, clock, run } = setup();
    api.runs[PR_ID] = [makeRun({ status: 'running' })];
    const ctrl = new AbortController();
    clock.onSleep = (_ms, n) => {
      if (n === 2) ctrl.abort();
    };
    const res = await run(input, ctrl.signal);
    expect(res.status).toBe('running');
    expect(api.count('listRuns')).toBe(2);

    api.agents = [{ ...api.agents[0]!, enabled: false }];
    api.calls.length = 0;
    await expect(run(input)).rejects.toMatchObject({ code: 'AGENT_DISABLED' });
    expect(api.count('startReview')).toBe(0);
  });

  it('throws BAD_RESPONSE when the POST returns no runs', async () => {
    const { api, run } = setup();
    api.enqueue('startReview', []);
    await expect(run(input)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
});
