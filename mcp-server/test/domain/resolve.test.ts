import { describe, expect, it } from 'vitest';
import { FakeDevDigestApi } from '../../src/adapters/mocks';
import { DomainError } from '../../src/domain/errors';
import { resolveAgent, resolvePr, resolveRepo } from '../../src/domain/resolve';
import { makeAgent, makePull, makeRepo, REPO_ID } from '../helpers/fixtures';

async function failure(p: Promise<unknown>): Promise<DomainError> {
  try {
    await p;
  } catch (e) {
    return e as DomainError;
  }
  throw new Error('expected rejection');
}

describe('resolveRepo', () => {
  it('matches full_name case-insensitively', async () => {
    const api = new FakeDevDigestApi();
    api.repos = [makeRepo()];
    expect((await resolveRepo(api, ' ACME/Shop ')).id).toBe(REPO_ID);
  });

  it('matches a bare name only when unique', async () => {
    const api = new FakeDevDigestApi();
    api.repos = [makeRepo(), makeRepo({ id: 'r2', owner: 'other', full_name: 'other/lib', name: 'lib' })];
    expect((await resolveRepo(api, 'lib')).id).toBe('r2');

    api.repos.push(makeRepo({ id: 'r3', owner: 'x', full_name: 'x/lib', name: 'lib' }));
    const err = await failure(resolveRepo(api, 'lib'));
    expect(err.code).toBe('REPO_AMBIGUOUS');
    expect(err.details.matches).toEqual(['other/lib', 'x/lib']);
  });

  it('lists up to 10 known repos when not found', async () => {
    const api = new FakeDevDigestApi();
    api.repos = Array.from({ length: 12 }, (_, i) =>
      makeRepo({ id: `r${i}`, full_name: `o/r${i}`, name: `r${i}`, owner: 'o' }),
    );
    const err = await failure(resolveRepo(api, 'nope/nope'));
    expect(err.code).toBe('REPO_NOT_FOUND');
    expect(err.details.known).toHaveLength(10);
  });
});

describe('resolvePr', () => {
  it('finds by number, else lists newest known numbers', async () => {
    const api = new FakeDevDigestApi();
    const repo = makeRepo();
    api.pulls[repo.id] = [makePull({ number: 1, id: 'a' }), makePull({ number: 3, id: 'b' }), makePull({ number: 2, id: 'c' })];
    expect((await resolvePr(api, repo, 2)).id).toBe('c');
    const err = await failure(resolvePr(api, repo, 99));
    expect(err.code).toBe('PR_NOT_FOUND');
    expect(err.details.known).toEqual([3, 2, 1]);
  });
});

describe('resolveAgent', () => {
  it('prefers exact id, then case-insensitive trimmed name', async () => {
    const api = new FakeDevDigestApi();
    api.agents = [makeAgent({ id: 'a1', name: 'Security' }), makeAgent({ id: 'a2', name: 'Perf' })];
    expect((await resolveAgent(api, 'a2')).name).toBe('Perf');
    expect((await resolveAgent(api, '  security ')).id).toBe('a1');
  });

  it('reports not found, ambiguous and disabled', async () => {
    const api = new FakeDevDigestApi();
    api.agents = [
      makeAgent({ id: 'a1', name: 'Dup' }),
      makeAgent({ id: 'a2', name: 'dup' }),
      makeAgent({ id: 'a3', name: 'Off', enabled: false }),
    ];
    expect((await failure(resolveAgent(api, 'ghost'))).code).toBe('AGENT_NOT_FOUND');
    const amb = await failure(resolveAgent(api, 'DUP'));
    expect(amb.code).toBe('AGENT_AMBIGUOUS');
    expect(amb.details.matches).toEqual([
      { name: 'Dup', id: 'a1' },
      { name: 'dup', id: 'a2' },
    ]);
    const off = await failure(resolveAgent(api, 'off'));
    expect(off.code).toBe('AGENT_DISABLED');
    expect(off.details.name).toBe('Off');
  });
});
