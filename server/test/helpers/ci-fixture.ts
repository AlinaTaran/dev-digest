import { strToU8, zipSync } from 'fflate';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/platform/config.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../../src/adapters/mocks.js';
import type { PgFixture } from './pg.js';

export type CiApp = Awaited<ReturnType<typeof buildApp>>;

export const REPO = 'acme/payments-api';

/** App over the fixture DB with a mock GitHub, no real secrets and LLM mocks that count calls. */
export async function makeCiApp(pg: PgFixture, github: MockGitHubClient) {
  const llm = new MockLLMProvider('openai');
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  const app = await buildApp({
    config,
    db: pg.handle.db,
    overrides: {
      git: new MockGitClient(),
      github,
      secrets: new MockSecretsProvider({}),
      llm: { openai: llm, anthropic: llm, openrouter: llm },
    },
  });
  return { app, llm };
}

export async function createAgent(app: CiApp, provider = 'openrouter', skillNames: string[] = []) {
  const res = await app.inject({
    method: 'POST',
    url: '/agents',
    payload: {
      name: `CI Agent ${Math.random().toString(36).slice(2, 8)}`,
      provider,
      model: 'openai/gpt-5',
      system_prompt: 'Review the diff.',
    },
  });
  const agent = res.json() as { id: string; name: string };
  for (const [order, name] of skillNames.entries()) {
    const skill = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: 'd', type: 'rubric', body: `body of ${name}` },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.json().id, order },
    });
  }
  return agent;
}

export function resultArtifact(over: Record<string, unknown> = {}): Uint8Array {
  const body = {
    schema_version: 1,
    status: 'succeeded',
    reason: null,
    verdict: 'request_changes',
    findings_count: 3,
    critical: 1,
    warning: 1,
    suggestion: 1,
    blockers: 1,
    cost_usd: 0.012,
    duration_ms: 4200,
    agent: 'CI Agent',
    model: 'openai/gpt-5',
    runner_version: '1.0.0',
    pr_number: 482,
    ...over,
  };
  return zipSync({ 'devdigest-result.json': strToU8(JSON.stringify(body)) });
}
