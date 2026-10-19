import { truncate } from '../findings';
import type { UseCaseDeps } from '../ports';
import type { AgentsResult } from '../types';

const DESCRIPTION_MAX = 160;

export type ListAgents = (signal?: AbortSignal) => Promise<AgentsResult>;

/** Enabled agents first, then by name. Empty list is not an error (hint only). */
export function createListAgents({ api }: UseCaseDeps): ListAgents {
  return async (signal) => {
    const agents = await api.listAgents(signal);
    const sorted = [...agents].sort(
      (a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name),
    );
    const result: AgentsResult = {
      agents: sorted.map((a) => ({
        id: a.id,
        name: a.name,
        description: truncate(a.description ?? '', DESCRIPTION_MAX),
        enabled: a.enabled,
      })),
      count: sorted.length,
    };
    if (sorted.length === 0) result.hint = { code: 'NO_AGENTS' };
    return result;
  };
}
