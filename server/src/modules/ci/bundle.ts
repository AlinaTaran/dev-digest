import type { AgentManifest, CiFile, CiPostAs, CiTriggerEvent } from '@devdigest/shared';

/** Where the runner (the `agent-runner/` package's ncc output) is committed in the target repo. */
export const RUNNER_DIR = '.devdigest/runner';
export const RUNNER_ENTRY_PATH = `${RUNNER_DIR}/index.js`;

/** The built runner: every `agent-runner/dist/` file (paths relative to it) + a content-hash version. */
export interface BundleRunner {
  version: string;
  files: { path: string; contents: string }[];
}

/**
 * Pure generators for the files an exported agent commits into a repository.
 * No I/O: callers pass already-loaded rows and the runner files.
 */

export interface BundleAgent {
  name: string;
  model: string;
  systemPrompt: string;
  strategy: AgentManifest['strategy'];
  ciFailOn: AgentManifest['ci_fail_on'];
}

export interface BundleSkill {
  name: string;
  body: string;
}

export interface BundleMemory {
  kind: string;
  scope: string;
  content: string;
}

export interface BundleInput {
  agent: BundleAgent;
  skills: BundleSkill[];
  memory: BundleMemory[];
  triggers: CiTriggerEvent[];
  postAs: CiPostAs;
  /** Runner files; previews pass one `index.js` with `''` contents (shown by version only). */
  runner: BundleRunner;
  /** Replaces the generated workflow when the user hand-edited it. */
  workflowOverride?: string;
}

/** kebab-case `[a-z0-9-]` identifier; `agent` when nothing usable is left. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'agent';
}

/** Unique slug per skill (dedup with `-2`, `-3`, … suffixes), order preserved. */
export function skillSlugs(skills: BundleSkill[]): string[] {
  const seen = new Set<string>();
  return skills.map((s) => {
    const base = slugify(s.name);
    let slug = base;
    for (let n = 2; seen.has(slug); n++) slug = `${base}-${n}`;
    seen.add(slug);
    return slug;
  });
}

export const workflowFileName = (agentSlug: string): string => `devdigest-review-${agentSlug}.yml`;

/** JSON text — valid YAML 1.2, so the `.yaml` file needs no YAML library on either end. */
export function buildManifest(agent: BundleAgent, slugs: string[]): string {
  const manifest = {
    name: agent.name,
    provider: 'openrouter',
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: slugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  };
  return JSON.stringify(manifest, null, 2) + '\n';
}

/** One JSON object per line; empty string when there is no memory. */
export function buildMemoryJsonl(rows: BundleMemory[]): string {
  if (rows.length === 0) return '';
  return (
    rows
      .map((r) => JSON.stringify({ kind: r.kind, scope: r.scope, content: r.content }))
      .join('\n') + '\n'
  );
}

/** Only the slug and enum values are interpolated — no free text, so no YAML injection. */
export function buildWorkflow(input: {
  agentSlug: string;
  triggers: CiTriggerEvent[];
  postAs: CiPostAs;
}): string {
  const types = [...new Set(input.triggers)].join(', ');
  const lines = [
    `name: DevDigest review (${input.agentSlug})`,
    'on:',
    '  pull_request:',
    `    types: [${types}]`,
    'permissions:',
    '  contents: read',
    ...(input.postAs === 'none' ? [] : ['  pull-requests: write']),
    'jobs:',
    '  review:',
    '    runs-on: ubuntu-latest',
    // Fork PRs get no secrets; the runner expects the workflow to never schedule it for them.
    '    if: github.event.pull_request.head.repo.full_name == github.repository',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '        with:',
    '          fetch-depth: 0',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 22',
    '      - name: DevDigest review',
    '        env:',
    '          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}',
    '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    `          DEVDIGEST_POST_AS: ${input.postAs}`,
    '          DEVDIGEST_DIR: ${{ runner.temp }}/devdigest',
    // The runner requires exactly ONE manifest in its agents dir, but several agents can be
    // exported to one repo (one workflow each), so stage only this agent's manifest.
    '        run: |',
    '          mkdir -p "$DEVDIGEST_DIR/agents" "$DEVDIGEST_DIR/skills"',
    `          cp .devdigest/agents/${input.agentSlug}.yaml "$DEVDIGEST_DIR/agents/"`,
    '          cp -r .devdigest/skills/. "$DEVDIGEST_DIR/skills/" || true',
    `          node ${RUNNER_ENTRY_PATH}`,
    '      - name: Upload DevDigest result',
    '        if: always()',
    '        uses: actions/upload-artifact@v4',
    '        with:',
    '          name: devdigest-result',
    '          path: devdigest-result.json',
    '          if-no-files-found: ignore',
  ];
  return lines.join('\n') + '\n';
}

/** The repo-root-relative files for one agent: manifest, skills, memory, runner, workflow. */
export function buildFiles(input: BundleInput): CiFile[] {
  const agentSlug = slugify(input.agent.name);
  const slugs = skillSlugs(input.skills);
  const workflow =
    input.workflowOverride ??
    buildWorkflow({ agentSlug, triggers: input.triggers, postAs: input.postAs });

  return [
    {
      path: `.devdigest/agents/${agentSlug}.yaml`,
      contents: buildManifest(input.agent, slugs),
      editable: false,
    },
    ...input.skills.map((s, i) => ({
      path: `.devdigest/skills/${slugs[i]}.md`,
      contents: s.body,
      editable: false,
    })),
    { path: '.devdigest/memory.jsonl', contents: buildMemoryJsonl(input.memory), editable: false },
    ...input.runner.files.map((f) => ({
      path: `${RUNNER_DIR}/${f.path}`,
      contents: f.contents,
      editable: false,
      version: input.runner.version,
    })),
    {
      path: `.github/workflows/${workflowFileName(agentSlug)}`,
      contents: workflow,
      editable: true,
    },
  ];
}
