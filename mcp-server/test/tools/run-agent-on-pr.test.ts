import { afterEach, describe, expect, it } from 'vitest';
import { apiUnreachable } from '../../src/adapters/mocks';
import { DomainError } from '../../src/domain/errors';
import { makeFinding, makeReview, makeRun, PR_ID, RUN_ID, seedWorld } from '../helpers/fixtures';
import { createHarness, textOf, type Harness } from '../helpers/harness';

const args = { repo: 'acme/shop', pr: 42, agent: 'Security' };

describe('run_agent_on_pr', () => {
  let h: Harness;
  afterEach(async () => {
    await h.close();
  });

  async function start(config?: Partial<Harness['config']>) {
    h = await createHarness(config ? { config } : {});
    seedWorld(h.api);
    h.api.nextRunId = RUN_ID;
  }

  it('runs, polls, and returns a capped concise review (content + structuredContent)', async () => {
    await start();
    h.api.enqueue('listRuns', [makeRun({ status: 'running' })], [makeRun({ status: 'running' })], [
      makeRun({ status: 'done' }),
    ]);
    h.api.reviews[PR_ID] = [
      makeReview({
        findings: [
          makeFinding({ severity: 'CRITICAL', title: 'SQL injection' }),
          ...Array.from({ length: 24 }, (_, i) => makeFinding({ title: `w${i}` })),
        ],
      }),
    ];

    const res = await h.callTool('run_agent_on_pr', args);

    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as {
      status: string;
      counts: { critical: number; warning: number };
      findings: { severity: string }[];
      truncated: boolean;
    };
    expect(out.status).toBe('done');
    expect(out.counts).toMatchObject({ critical: 1, warning: 24 });
    expect(out.findings).toHaveLength(20);
    expect(out.findings[0]?.severity).toBe('CRITICAL');
    expect(out.truncated).toBe(true);
    expect(textOf(res)).toContain('[CRITICAL]');
    expect(textOf(res).trimStart().startsWith('{')).toBe(false);
    expect(h.api.count('listRuns')).toBe(3);
  });

  it('resolves the agent by name case-insensitively', async () => {
    await start();
    h.api.runs[PR_ID] = [makeRun()];
    h.api.reviews[PR_ID] = [makeReview()];
    const res = await h.callTool('run_agent_on_pr', { ...args, agent: ' sEcUrItY ' });
    expect(res.isError).toBeFalsy();
  });

  it('leads forward on unknown agent, unknown repo, unknown PR', async () => {
    await start();
    const a = await h.callTool('run_agent_on_pr', { ...args, agent: 'nope' });
    expect(a.isError).toBe(true);
    expect(textOf(a)).toContain('list_agents');

    const r = await h.callTool('run_agent_on_pr', { ...args, repo: 'x/y' });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('acme/shop');

    const p = await h.callTool('run_agent_on_pr', { ...args, pr: 99 });
    expect(p.isError).toBe(true);
    expect(textOf(p)).toContain('42');
    expect(h.api.count('startReview')).toBe(0);
  });

  it('refuses a disabled agent without POSTing', async () => {
    await start();
    h.api.agents = [{ ...h.api.agents[0]!, enabled: false }];
    const res = await h.callTool('run_agent_on_pr', args);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('disabled');
    expect(h.api.count('startReview')).toBe(0);
  });

  it('reports rate limiting on the POST with retry seconds', async () => {
    await start();
    h.api.enqueue('startReview', new DomainError('RATE_LIMITED', { retryAfterSec: 42 }));
    const res = await h.callTool('run_agent_on_pr', args);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('~42s');
    expect(h.api.count('startReview')).toBe(1);
  });

  it('returns RUN_FAILED with the key hint', async () => {
    await start();
    h.api.runs[PR_ID] = [makeRun({ status: 'failed', error: 'OPENAI_API_KEY not configured' })];
    const res = await h.callTool('run_agent_on_pr', args);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain(`Review run ${RUN_ID} failed`);
    expect(textOf(res)).toContain('Settings');
  });

  it('returns a non-error running result on timeout', async () => {
    await start({ runTimeoutMs: 5000 });
    h.api.runs[PR_ID] = [makeRun({ status: 'running' })];
    const res = await h.callTool('run_agent_on_pr', args);
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { status: string; next: string; run_id: string };
    expect(out.status).toBe('running');
    expect(out.run_id).toBe(RUN_ID);
    expect(out.next).toContain('acme/shop');
    expect(out.next).toContain('pr=42');
    expect(out.next).toContain(RUN_ID);
  });

  it('mentions dev.sh when the API is unreachable', async () => {
    await start();
    h.api.enqueue('listRepos', apiUnreachable());
    const res = await h.callTool('run_agent_on_pr', args);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('./scripts/dev.sh');
  });

  it('tolerates a transient 500 while polling', async () => {
    await start();
    h.api.enqueue(
      'listRuns',
      new DomainError('API_SERVER_ERROR', { status: 500, code: 'x', message: 'boom' }),
      [makeRun({ status: 'done' })],
    );
    h.api.reviews[PR_ID] = [makeReview()];
    const res = await h.callTool('run_agent_on_pr', args);
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { status: string }).status).toBe('done');
  });

  it('stops polling when the caller aborts and returns running', async () => {
    await start();
    h.api.runs[PR_ID] = [makeRun({ status: 'running' })];
    const ctrl = new AbortController();
    h.clock.onSleep = (_ms, n) => {
      if (n === 2) ctrl.abort();
    };
    const res = await h.container.useCases.runReview(
      { repo: 'acme/shop', pr: 42, agent: 'Security' },
      ctrl.signal,
    );
    expect(res.status).toBe('running');
    expect(h.api.count('listRuns')).toBe(2);
  });

  it('keeps a 200-finding review under 20000 serialized chars', async () => {
    await start();
    h.api.runs[PR_ID] = [makeRun()];
    h.api.reviews[PR_ID] = [
      makeReview({
        findings: Array.from({ length: 200 }, (_, i) =>
          makeFinding({ title: `finding ${i} `.repeat(5), rationale: 'r'.repeat(2000), suggestion: 's'.repeat(2000) }),
        ),
      }),
    ];
    const res = await h.callTool('run_agent_on_pr', args);
    expect(res.isError).toBeFalsy();
    expect(JSON.stringify(res).length).toBeLessThan(20_000);
  });

  it('reports REVIEW_MISSING when done but no matching review exists', async () => {
    await start();
    h.api.runs[PR_ID] = [makeRun()];
    const res = await h.callTool('run_agent_on_pr', args);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('no review was stored');
    expect(textOf(res)).toContain('get_findings');
  });
});
