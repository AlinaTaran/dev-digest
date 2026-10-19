import { afterEach, describe, expect, it } from 'vitest';
import { PR_ID, makeFinding, makeReview, makeRun, seedWorld } from '../helpers/fixtures';
import { createHarness, textOf, type Harness } from '../helpers/harness';

const LIVE = '77777777-7777-4777-8777-777777777771';
const BAD = '77777777-7777-4777-8777-777777777772';
const NOPE = '77777777-7777-4777-8777-777777777773';
const RUN_A = '77777777-7777-4777-8777-777777777774';
const RUN_B = '77777777-7777-4777-8777-777777777775';
const args = { repo: 'acme/shop', pr: 42 };

describe('get_findings', () => {
  let h: Harness;
  afterEach(async () => {
    await h.close();
  });

  async function start(reviews = [makeReview()]) {
    h = await createHarness();
    seedWorld(h.api);
    h.api.reviews[PR_ID] = reviews;
  }

  it('returns the latest review, ignores summary rows, text is not a JSON dump', async () => {
    await start([
      makeReview({ id: 's', kind: 'summary', run_id: 'sum' }),
      makeReview({ run_id: 'latest', findings: [makeFinding({ severity: 'CRITICAL', title: 'SQL built from input' })] }),
      makeReview({ run_id: 'older' }),
    ]);
    const res = await h.callTool('get_findings', args);
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { run_id: string }).run_id).toBe('latest');
    expect(textOf(res)).toContain('SQL built from input');
    expect(textOf(res).trimStart().startsWith('{')).toBe(false);
  });

  it('pins a run_id and reports running as non-error with next', async () => {
    await start([makeReview({ run_id: RUN_A }), makeReview({ run_id: RUN_B })]);
    h.api.runs[PR_ID] = [makeRun({ run_id: LIVE, status: 'running' })];
    const pinned = await h.callTool('get_findings', { ...args, run_id: RUN_B });
    expect((pinned.structuredContent as { run_id: string }).run_id).toBe(RUN_B);
    const running = await h.callTool('get_findings', { ...args, run_id: LIVE });
    expect(running.isError).toBeFalsy();
    const out = running.structuredContent as { status: string; next: string };
    expect(out.status).toBe('running');
    expect(out.next).toContain(LIVE);
  });

  it('errors for failed and unknown runs with forward-leading text', async () => {
    await start();
    h.api.runs[PR_ID] = [makeRun({ run_id: BAD, status: 'failed', error: 'kaput' })];
    const failed = await h.callTool('get_findings', { ...args, run_id: BAD });
    expect(failed.isError).toBe(true);
    expect(textOf(failed)).toContain('kaput');
    const unknown = await h.callTool('get_findings', { ...args, run_id: NOPE });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain(`Run ${NOPE} not found`);
  });

  it('filters by agent, and says run_agent_on_pr when nothing matches', async () => {
    await start([
      makeReview({ run_id: 'a', agent_id: 'x', agent_name: 'Style' }),
      makeReview({ run_id: 'b' }),
    ]);
    const hit = await h.callTool('get_findings', { ...args, agent: 'style' });
    expect((hit.structuredContent as { run_id: string }).run_id).toBe('a');
    const miss = await h.callTool('get_findings', { ...args, agent: 'ghost' });
    expect(miss.isError).toBe(true);
    expect(textOf(miss)).toContain('run_agent_on_pr');
    h.api.reviews[PR_ID] = [];
    expect(textOf(await h.callTool('get_findings', args))).toContain('run_agent_on_pr');
  });

  it('still works with a deleted-agent review and a name filter', async () => {
    await start([makeReview({ run_id: 'gone', agent_id: null, agent_name: '' }), makeReview({ run_id: 'b' })]);
    const latest = await h.callTool('get_findings', args);
    expect((latest.structuredContent as { run_id: string }).run_id).toBe('gone');
    const byName = await h.callTool('get_findings', { ...args, agent: 'security' });
    expect((byName.structuredContent as { run_id: string }).run_id).toBe('b');
  });

  it('errors with REVIEW_MISSING when the pinned run is done but has no review', async () => {
    await start([makeReview({ run_id: 'other' })]);
    h.api.runs[PR_ID] = [makeRun({ run_id: LIVE, status: 'done' })];
    const res = await h.callTool('get_findings', { ...args, run_id: LIVE });
    expect(res.isError).toBe(true);
  });

  it('severity excludes lower findings while counts stay full; limit truncates with hint', async () => {
    await start([
      makeReview({
        findings: [
          makeFinding({ severity: 'CRITICAL', title: 'c' }),
          makeFinding({ severity: 'WARNING', title: 'w' }),
          makeFinding({ severity: 'SUGGESTION', title: 's' }),
        ],
      }),
    ]);
    const res = await h.callTool('get_findings', { ...args, severity: 'WARNING' });
    const out = res.structuredContent as {
      counts: { critical: number; warning: number; suggestion: number };
      findings: { severity: string }[];
    };
    expect(out.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING']);
    expect(out.counts).toEqual({ critical: 1, warning: 1, suggestion: 1 });

    const capped = await h.callTool('get_findings', { ...args, limit: 1 });
    const cappedOut = capped.structuredContent as { truncated: boolean; findings: unknown[]; next: string };
    expect(cappedOut.truncated).toBe(true);
    expect(cappedOut.findings).toHaveLength(1);
    expect(cappedOut.next).toContain('Showing 1 of 3');
  });

  it('detailed adds truncated rationale/suggestion; concise omits them', async () => {
    await start([
      makeReview({ findings: [makeFinding({ rationale: 'r'.repeat(900), suggestion: 's'.repeat(900) })] }),
    ]);
    type F = { rationale?: string; suggestion?: string | null };
    const concise = await h.callTool('get_findings', args);
    const c = (concise.structuredContent as { findings: F[] }).findings[0];
    expect(c?.rationale).toBeUndefined();
    expect(c?.suggestion).toBeUndefined();
    const detailed = await h.callTool('get_findings', { ...args, response_format: 'detailed' });
    const d = (detailed.structuredContent as { findings: F[] }).findings[0];
    expect(d?.rationale?.length).toBeLessThanOrEqual(600);
    expect(d?.suggestion?.length).toBeLessThanOrEqual(400);
    expect(d?.rationale?.length).toBeGreaterThan(0);
  });
});
