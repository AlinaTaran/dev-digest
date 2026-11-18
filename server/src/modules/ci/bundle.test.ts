import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { AgentManifest } from '@devdigest/shared';
import { buildFiles, buildMemoryJsonl, buildWorkflow, skillSlugs, slugify } from './bundle.js';
import { readResultArtifact } from './service.js';

const agent = {
  name: 'Security Reviewer',
  model: 'openai/gpt-5',
  systemPrompt: 'Review "the" diff: be strict.\nSecond line.',
  strategy: 'auto' as const,
  ciFailOn: 'warning' as const,
};

const input = {
  agent,
  skills: [
    { name: 'SQL Injection', body: 'body-a' },
    { name: 'sql injection', body: 'body-b' },
  ],
  memory: [{ kind: 'fact', scope: 'global', content: 'uses pnpm' }],
  triggers: ['opened', 'synchronize'] as ('opened' | 'synchronize' | 'reopened')[],
  postAs: 'github_review' as const,
  runner: { version: 'abc123def456', files: [{ path: 'index.js', contents: '' }] },
};

describe('ci bundle generators', () => {
  it('slugifies names and dedups skill slugs', () => {
    expect(slugify('Security Reviewer!')).toBe('security-reviewer');
    expect(slugify('***')).toBe('agent');
    expect(skillSlugs(input.skills)).toEqual(['sql-injection', 'sql-injection-2']);
  });

  it('emits the 6 path kinds, with the manifest matching the agent (AC-21, AC-22)', () => {
    const files = buildFiles(input);
    expect(files.map((f) => f.path)).toEqual([
      '.devdigest/agents/security-reviewer.yaml',
      '.devdigest/skills/sql-injection.md',
      '.devdigest/skills/sql-injection-2.md',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.js',
      '.github/workflows/devdigest-review-security-reviewer.yml',
    ]);
    const manifest = AgentManifest.parse(JSON.parse(files[0]!.contents));
    expect(manifest).toMatchObject({
      name: agent.name,
      provider: 'openrouter',
      model: agent.model,
      system_prompt: agent.systemPrompt,
      skills: ['sql-injection', 'sql-injection-2'],
      strategy: 'auto',
      ci_fail_on: 'warning',
    });
    const runner = files.find((f) => f.path.endsWith('/index.js'))!;
    expect(runner).toMatchObject({ contents: '', editable: false, version: 'abc123def456' });
    expect(files.filter((f) => f.editable).map((f) => f.path)).toEqual([files[5]!.path]);
  });

  it('ships every runner file under .devdigest/runner/, all carrying the runner version', () => {
    const files = buildFiles({
      ...input,
      runner: {
        version: 'v9',
        files: [
          { path: '310.index.js', contents: 'chunk' },
          { path: 'index.js', contents: 'entry' },
        ],
      },
    });
    const runnerFiles = files.filter((f) => f.path.startsWith('.devdigest/runner/'));
    expect(runnerFiles.map((f) => f.path)).toEqual(['.devdigest/runner/310.index.js', '.devdigest/runner/index.js']);
    expect(runnerFiles.every((f) => f.version === 'v9' && !f.editable)).toBe(true);
  });

  it('builds a least-privilege workflow without dangerous triggers (AC-27, AC-28, AC-37)', () => {
    const wf = buildWorkflow({ agentSlug: 'a', triggers: ['opened', 'reopened'], postAs: 'github_review' });
    expect(wf).toContain('types: [opened, reopened]');
    expect(wf).toContain('contents: read');
    expect(wf).toContain('pull-requests: write');
    expect(wf).toContain('node .devdigest/runner/index.js');
    // The runner wants exactly one manifest, so only this agent's is staged into DEVDIGEST_DIR.
    expect(wf).toContain('DEVDIGEST_DIR: ${{ runner.temp }}/devdigest');
    expect(wf).toContain('cp .devdigest/agents/a.yaml "$DEVDIGEST_DIR/agents/"');
    expect(wf).not.toContain('DEVDIGEST_AGENT');
    expect(wf).toContain('if: github.event.pull_request.head.repo.full_name == github.repository');
    expect(wf).toContain('secrets.OPENROUTER_API_KEY');
    expect(wf).toMatch(/if: always\(\)\n\s+uses: actions\/upload-artifact@v4/);
    expect(wf).not.toContain('pull_request_target');
    expect(wf).not.toContain('devdigest/review-action@v1');

    const quiet = buildWorkflow({ agentSlug: 'a', triggers: ['opened'], postAs: 'none' });
    expect(quiet).not.toContain('pull-requests: write');
    expect(quiet).toContain('DEVDIGEST_POST_AS: none');
  });

  it('writes an empty memory file for no memory and one JSON line per row (D8)', () => {
    expect(buildMemoryJsonl([])).toBe('');
    expect(buildMemoryJsonl(input.memory)).toBe(
      '{"kind":"fact","scope":"global","content":"uses pnpm"}\n',
    );
  });

  it('honours a workflow override and never embeds token-like strings (NFR-10)', () => {
    const files = buildFiles({ ...input, workflowOverride: 'name: custom\n' });
    expect(files[5]!.contents).toBe('name: custom\n');
    for (const f of buildFiles(input)) expect(f.contents).not.toMatch(/ghp_|sk-or-|sk-[A-Za-z0-9]{20,}/);
  });
});

describe('readResultArtifact', () => {
  const valid = {
    schema_version: 1,
    status: 'succeeded',
    reason: null,
    verdict: 'comment',
    findings_count: 1,
    blockers: 0,
    cost_usd: null,
    agent: 'a',
    model: 'm',
    runner_version: '1.0.0',
    pr_number: 3,
  };
  const zipOf = (files: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

  it('accepts a valid artifact and rejects broken, invalid, oversized or crowded ones (AC-76)', () => {
    expect(readResultArtifact(zipOf({ 'devdigest-result.json': JSON.stringify(valid) }))?.pr_number).toBe(3);
    expect(readResultArtifact(zipOf({ 'devdigest-result.json': '{nope' }))).toBeNull();
    expect(readResultArtifact(zipOf({ 'devdigest-result.json': '{"status":"x"}' }))).toBeNull();
    expect(readResultArtifact(zipOf({ 'other.json': '{}' }))).toBeNull();
    expect(readResultArtifact(strToU8('not a zip'))).toBeNull();
    const big = JSON.stringify({ ...valid, reason: null, pad: 'x'.repeat(1_100_000) });
    expect(readResultArtifact(zipOf({ 'devdigest-result.json': big }))).toBeNull();
    const many = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`f${i}`, 'x']));
    expect(readResultArtifact(zipOf({ ...many, 'devdigest-result.json': JSON.stringify(valid) }))).toBeNull();
  });
});
