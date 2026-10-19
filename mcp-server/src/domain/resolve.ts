import { DomainError } from './errors';
import type { DevDigestApiPort } from './ports';
import type { Agent, Pull, Repo } from './types';

const KNOWN_LIMIT = 10;

/**
 * "owner/name" (case-insensitive) -> Repo. Input without "/" matches `name`
 * only when exactly one repo has it.
 */
export async function resolveRepo(
  api: DevDigestApiPort,
  input: string,
  signal?: AbortSignal,
): Promise<Repo> {
  const wanted = input.trim().toLowerCase();
  const repos = await api.listRepos(signal);

  if (wanted.includes('/')) {
    const hit = repos.find(
      (r) =>
        r.full_name.toLowerCase() === wanted || `${r.owner}/${r.name}`.toLowerCase() === wanted,
    );
    if (hit) return hit;
  } else {
    const byName = repos.filter((r) => r.name.toLowerCase() === wanted);
    if (byName.length === 1 && byName[0]) return byName[0];
    if (byName.length > 1) {
      throw new DomainError('REPO_AMBIGUOUS', {
        repo: input,
        matches: byName.map((r) => r.full_name),
      });
    }
  }

  throw new DomainError('REPO_NOT_FOUND', {
    repo: input,
    known: repos.slice(0, KNOWN_LIMIT).map((r) => r.full_name),
  });
}

/** PR number -> Pull (within an already resolved repo). */
export async function resolvePr(
  api: DevDigestApiPort,
  repo: Repo,
  pr: number,
  signal?: AbortSignal,
): Promise<Pull> {
  const pulls = await api.listPulls(repo.id, signal);
  const hit = pulls.find((p) => p.number === pr);
  if (hit) return hit;
  throw new DomainError('PR_NOT_FOUND', {
    repo: repo.full_name,
    pr,
    known: pulls
      .map((p) => p.number)
      .sort((a, b) => b - a)
      .slice(0, KNOWN_LIMIT),
  });
}

/**
 * id (exact) first, then case-insensitive trimmed name. Rejects disabled
 * agents: the server does NOT check `enabled` when `agentId` is given.
 */
export async function resolveAgent(
  api: DevDigestApiPort,
  input: string,
  signal?: AbortSignal,
): Promise<Agent> {
  const agents = await api.listAgents(signal);
  const byId = agents.find((a) => a.id === input);
  let agent: Agent | undefined = byId;

  if (!agent) {
    const wanted = input.trim().toLowerCase();
    const byName = agents.filter((a) => a.name.trim().toLowerCase() === wanted);
    if (byName.length > 1) {
      throw new DomainError('AGENT_AMBIGUOUS', {
        agent: input,
        matches: byName.map((a) => ({ name: a.name, id: a.id })),
      });
    }
    agent = byName[0];
  }

  if (!agent) throw new DomainError('AGENT_NOT_FOUND', { agent: input });
  if (agent.enabled === false) throw new DomainError('AGENT_DISABLED', { name: agent.name });
  return agent;
}
