import { afterEach, describe, expect, it } from 'vitest';
import { apiUnreachable } from '../../src/adapters/mocks';
import { makeAgent } from '../helpers/fixtures';
import { createHarness, textOf, type Harness } from '../helpers/harness';

describe('list_agents', () => {
  let h: Harness;
  afterEach(async () => {
    await h.close();
  });

  it('lists enabled agents first, then by name, never leaking the system prompt', async () => {
    h = await createHarness();
    h.api.agents = [
      { ...makeAgent({ id: 'b', name: 'Zeta', enabled: false }), system_prompt: 'SECRET' } as never,
      makeAgent({ id: 'c', name: 'Beta', description: null }),
      makeAgent({ id: 'a', name: 'Alpha', description: 'x'.repeat(300) }),
    ];

    const res = await h.callTool('list_agents');

    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as {
      agents: { id: string; name: string; description: string; enabled: boolean }[];
      count: number;
    };
    expect(out.count).toBe(3);
    expect(out.agents.map((a) => a.name)).toEqual(['Alpha', 'Beta', 'Zeta']);
    expect(out.agents[0]?.description.length).toBeLessThanOrEqual(160);
    expect(out.agents[1]?.description).toBe('');
    expect(out.agents[2]?.enabled).toBe(false);
    expect(JSON.stringify(res)).not.toContain('SECRET');
    expect(textOf(res)).toContain('Zeta (b) [disabled]');
    expect(textOf(res).trimStart().startsWith('{')).toBe(false);
  });

  it('returns a non-error hint when no agents exist', async () => {
    h = await createHarness();
    const res = await h.callTool('list_agents');
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { next: string }).next).toContain('No agents configured');
  });

  it('leads forward when the API is down', async () => {
    h = await createHarness();
    h.api.enqueue('listAgents', apiUnreachable());
    const res = await h.callTool('list_agents');
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('./scripts/dev.sh');
  });

  it('hides unexpected failures behind a generic message and logs them', async () => {
    h = await createHarness();
    h.api.enqueue('listAgents', new Error('boom secret internals'));
    const res = await h.callTool('list_agents');
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(
      'Internal error in devdigest MCP tool "list_agents". See the MCP server stderr log.',
    );
    expect(h.logger.lines.some((l) => l.level === 'error')).toBe(true);
  });
});
