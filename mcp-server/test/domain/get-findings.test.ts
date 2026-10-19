import { describe, expect, it } from 'vitest';
import { FakeDevDigestApi, createSilentLogger, FakeClock } from '../../src/adapters/mocks';
import { DomainError } from '../../src/domain/errors';
import { createGetFindings } from '../../src/domain/use-cases/get-findings';
import { PR_ID, makeFinding, makeReview, makeRun, seedWorld } from '../helpers/fixtures';

function setup() {
  const api = new FakeDevDigestApi();
  seedWorld(api);
  const getFindings = createGetFindings({ api, clock: new FakeClock(), logger: createSilentLogger() });
  return { api, getFindings };
}

const base = { repo: 'acme/shop', pr: 42 };

describe('getFindings use case', () => {
  it('returns the newest review, ignoring summary rows', async () => {
    const { api, getFindings } = setup();
    api.reviews[PR_ID] = [
      makeReview({ id: 's', kind: 'summary', run_id: 'sum', agent_name: 'Summarizer' }),
      makeReview({ id: 'new', run_id: 'r-new', findings: [makeFinding()] }),
      makeReview({ id: 'old', run_id: 'r-old' }),
    ];
    const res = await getFindings(base);
    expect(res.status).toBe('done');
    expect(res.run_id).toBe('r-new');
    expect(res.agent).toBe('Security');
    expect(res.findings).toHaveLength(1);
  });

  it('filters by agent id or case-insensitive name', async () => {
    const { api, getFindings } = setup();
    api.reviews[PR_ID] = [
      makeReview({ run_id: 'a', agent_id: 'ag-1', agent_name: 'Style' }),
      makeReview({ run_id: 'b', agent_id: 'ag-2', agent_name: 'Security' }),
    ];
    expect((await getFindings({ ...base, agent: 'security' })).run_id).toBe('b');
    expect((await getFindings({ ...base, agent: 'ag-1' })).run_id).toBe('a');
    await expect(getFindings({ ...base, agent: 'nope' })).rejects.toMatchObject({ code: 'NO_REVIEWS' });
  });

  it('maps run_id states: pinned, running, failed, unknown', async () => {
    const { api, getFindings } = setup();
    api.reviews[PR_ID] = [makeReview({ run_id: 'done-1' }), makeReview({ run_id: 'done-0' })];
    api.runs[PR_ID] = [
      makeRun({ run_id: 'run-1', status: 'running' }),
      makeRun({ run_id: 'bad-1', status: 'failed', error: 'boom' }),
      makeRun({ run_id: 'cx-1', status: 'cancelled', error: null }),
    ];
    expect((await getFindings({ ...base, run_id: 'done-0' })).run_id).toBe('done-0');
    const running = await getFindings({ ...base, run_id: 'run-1' });
    expect(running.status).toBe('running');
    expect(running.hint).toMatchObject({ code: 'NEXT_POLL', run_id: 'run-1' });
    await expect(getFindings({ ...base, run_id: 'bad-1' })).rejects.toMatchObject({
      code: 'RUN_FAILED',
      details: { status: 'failed', error: 'boom' },
    });
    await expect(getFindings({ ...base, run_id: 'cx-1' })).rejects.toMatchObject({ code: 'RUN_FAILED' });
    await expect(getFindings({ ...base, run_id: 'zzz' })).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
  });

  it('applies severity, limit and keeps counts over all findings', async () => {
    const { api, getFindings } = setup();
    api.reviews[PR_ID] = [
      makeReview({
        findings: [
          makeFinding({ severity: 'CRITICAL', title: 'c' }),
          makeFinding({ severity: 'WARNING', title: 'w1' }),
          makeFinding({ severity: 'WARNING', title: 'w2' }),
          makeFinding({ severity: 'SUGGESTION', title: 's' }),
        ],
      }),
    ];
    const res = await getFindings({ ...base, severity: 'WARNING', limit: 2 });
    expect(res.counts).toEqual({ critical: 1, warning: 2, suggestion: 1 });
    expect(res.findings?.map((f) => f.title)).toEqual(['c', 'w1']);
    expect(res.truncated).toBe(true);
    expect(res.hint).toMatchObject({ code: 'NARROW', shown: 2, total: 3 });
  });

  it('throws NO_REVIEWS and propagates resolve errors as DomainError', async () => {
    const { getFindings } = setup();
    await expect(getFindings(base)).rejects.toMatchObject({ code: 'NO_REVIEWS' });
    await expect(getFindings({ repo: 'x/y', pr: 42 })).rejects.toBeInstanceOf(DomainError);
  });
});
