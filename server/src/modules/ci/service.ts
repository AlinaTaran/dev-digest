import { strToU8, unzipSync, zipSync } from 'fflate';
import {
  CiResultArtifact,
  type AgentCi,
  type CiExport,
  type CiExportInput,
  type CiFile,
  type CiInstallation,
  type CiPreview,
  type CiPreviewInput,
  type CiRefreshResult,
  type CiRunsList,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import type { CiInstallationRow } from '../../db/rows.js';
import { buildFiles, slugify, workflowFileName, type BundleRunner } from './bundle.js';
import { loadRunner } from './runner.js';
import { CiRepository, DuplicateCiRun } from './repository.js';

export const CI_BRANCH = 'devdigest/ci';
export const ARTIFACT_NAME = 'devdigest-result';
const ARTIFACT_FILE = 'devdigest-result.json';
const MAX_ARTIFACT_ENTRIES = 10;
const MAX_ARTIFACT_BYTES = 1_000_000;
const RUNS_PER_INSTALLATION = 20;
const RUNS_LIST_LIMIT = 50;

type Logger = { info: (obj: object, msg?: string) => void };

export type ExportResult =
  | { kind: 'pr'; result: CiExport }
  | { kind: 'zip'; bytes: Uint8Array; filename: string };

function toInstallation(row: CiInstallationRow): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType,
    installed_at: row.installedAt.toISOString(),
  };
}

function splitRepo(fullName: string): { owner: string; name: string } {
  const [owner = '', name = ''] = fullName.split('/');
  return { owner, name };
}

/**
 * Pull one validated `devdigest-result.json` out of an artifact zip, or null.
 * Two passes: enumerate entries without inflating, cap count + declared size,
 * then inflate only the target (decompression-bomb defense).
 */
export function readResultArtifact(zip: Uint8Array): CiResultArtifact | null {
  try {
    const infos: { name: string; originalSize: number }[] = [];
    unzipSync(zip, {
      filter: (f) => {
        infos.push({ name: f.name, originalSize: f.originalSize });
        return false;
      },
    });
    if (infos.length > MAX_ARTIFACT_ENTRIES) return null;
    const target = infos.find((i) => i.name === ARTIFACT_FILE);
    if (!target || target.originalSize > MAX_ARTIFACT_BYTES) return null;

    const files = unzipSync(zip, { filter: (f) => f.name === ARTIFACT_FILE });
    const raw = files[ARTIFACT_FILE];
    if (!raw) return null;
    const parsed = CiResultArtifact.safeParse(JSON.parse(new TextDecoder().decode(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class CiService {
  private repository: CiRepository;

  constructor(
    private container: Container,
    private logger: () => Logger,
  ) {
    this.repository = new CiRepository(container.db);
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<AgentRow> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  async getAgentCi(workspaceId: string, agentId: string): Promise<AgentCi> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const installations = await this.repository.installationsForAgent(agentId);
    const recent = await this.repository.recentRunsByInstallation(installations.map((i) => i.id));
    return {
      ci_fail_on: agent.ciFailOn,
      installations: installations.map((i) => ({
        ...toInstallation(i),
        workflow_file: i.workflowFile,
        runner_version: i.runnerVersion,
        pr_url: i.prUrl,
        recent_runs: recent.get(i.id) ?? [],
      })),
    };
  }

  /** Files shown in the wizard. No LLM and no GitHub calls; the runner is shown by version only. */
  async preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview> {
    const { version } = await loadRunner();
    // One `index.js` entry stands for the whole runner in the wizard (it is shown by version only).
    const runner: BundleRunner = { version, files: [{ path: 'index.js', contents: '' }] };
    const { files } = await this.buildBundle(workspaceId, agentId, input, runner);
    return { files };
  }

  async exportCi(
    workspaceId: string,
    agentId: string,
    input: CiExportInput,
  ): Promise<ExportResult> {
    const runner = await loadRunner();
    const { agent, repo, files, workflowFile } = await this.buildBundle(
      workspaceId,
      agentId,
      input,
      runner,
      input.workflow_override,
    );
    const slug = slugify(agent.name);

    if (input.action === 'zip') {
      const entries: Record<string, Uint8Array> = {};
      for (const f of files) entries[f.path] = strToU8(f.contents);
      await this.repository.upsertInstallation({
        agentId,
        repo: input.repo,
        workflowFile,
        runnerVersion: runner.version,
        prUrl: null,
      });
      return { kind: 'zip', bytes: zipSync(entries), filename: `devdigest-ci-${slug}.zip` };
    }

    const prUrl = await this.openPr(input.repo, repo.defaultBranch, slug, files);
    const installation = await this.repository.upsertInstallation({
      agentId,
      repo: input.repo,
      workflowFile,
      runnerVersion: runner.version,
      prUrl,
    });
    // The (large) runner text is committed, not echoed back to the browser.
    const light = files.map((f) => (f.version ? { ...f, contents: '' } : f));
    return { kind: 'pr', result: { installation: toInstallation(installation), files: light, pr_url: prUrl } };
  }

  /** Commit to `devdigest/ci` only, then reuse the open PR or open one. Any GitHub failure -> 502, nothing stored. */
  private async openPr(
    repoFullName: string,
    base: string,
    slug: string,
    files: CiFile[],
  ): Promise<string> {
    const ref = splitRepo(repoFullName);
    try {
      const github = await this.container.github();
      await github.commitFiles(ref, {
        branch: CI_BRANCH,
        base,
        message: `DevDigest CI: add ${slug} review`,
        files: files.map((f) => ({ path: f.path, contents: f.contents })),
      });
      const existing = await github.findOpenPr(ref, CI_BRANCH);
      if (existing) return existing.url;
      const pr = await github.openPullRequest(ref, {
        title: 'Add DevDigest CI review',
        head: CI_BRANCH,
        base,
        body:
          `Adds the DevDigest **${slug}** review agent as a GitHub Actions workflow.\n\n` +
          'Before merging, add the `OPENROUTER_API_KEY` repository secret.',
      });
      return pr.url;
    } catch (err) {
      throw new ExternalServiceError(err instanceof Error ? err.message : 'GitHub request failed');
    }
  }

  private async buildBundle(
    workspaceId: string,
    agentId: string,
    input: CiPreviewInput,
    runner: BundleRunner,
    workflowOverride?: string,
  ) {
    const agent = await this.requireAgent(workspaceId, agentId);
    if (agent.provider !== 'openrouter') {
      throw new AppError(
        'unsupported_provider',
        'Only agents using the OpenRouter provider can run in CI',
        422,
      );
    }
    const repo = await this.repository.getRepo(workspaceId, input.repo);
    if (!repo) {
      throw new AppError('repo_not_connected', `Repository ${input.repo} is not connected`, 422);
    }
    const [linked, memory] = await Promise.all([
      this.container.agentsRepo.linkedSkills(agentId),
      this.repository.memoryFor(workspaceId, repo.id),
    ]);
    const files = buildFiles({
      agent: {
        name: agent.name,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        strategy: agent.strategy,
        ciFailOn: agent.ciFailOn,
      },
      skills: linked.filter((l) => l.skill.enabled).map((l) => ({ name: l.skill.name, body: l.skill.body })),
      memory,
      triggers: input.triggers,
      postAs: input.post_as,
      runner,
      workflowOverride,
    });
    return { agent, repo, files, workflowFile: workflowFileName(slugify(agent.name)) };
  }

  /** Pull finished workflow runs from GitHub and store their result artifacts. One failing repo never blocks the rest. */
  async refresh(workspaceId: string): Promise<CiRefreshResult> {
    const result: CiRefreshResult = { ingested: 0, errors: [] };
    const installations = (await this.repository.installationsForWorkspace(workspaceId)).filter(
      (i) => i.installation.workflowFile,
    );
    if (installations.length === 0) return result;

    let github;
    try {
      github = await this.container.github();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'GitHub is not available';
      result.errors = installations.map((i) => ({ repo: i.installation.repo, reason }));
      return result;
    }

    for (const { installation } of installations) {
      try {
        result.ingested += await this.refreshInstallation(github, workspaceId, installation);
      } catch (err) {
        result.errors.push({
          repo: installation.repo,
          reason: err instanceof Error ? err.message : 'Refresh failed',
        });
      }
    }
    this.logger().info({ ingested: result.ingested, errors: result.errors.length }, 'ci.refresh');
    return result;
  }

  private async refreshInstallation(
    github: Awaited<ReturnType<Container['github']>>,
    workspaceId: string,
    installation: CiInstallationRow,
  ): Promise<number> {
    const ref = splitRepo(installation.repo);
    const [runs, known] = await Promise.all([
      github.listWorkflowRuns(ref, installation.workflowFile, { perPage: RUNS_PER_INSTALLATION }),
      this.repository.knownRuns(installation.id),
    ]);

    let ingested = 0;
    for (const run of runs) {
      if (known.has(`${run.id}:${run.run_attempt}`)) continue;
      const zip = await github.downloadArtifact(ref, run.id, ARTIFACT_NAME);
      if (!zip) continue;
      const artifact = readResultArtifact(zip);
      if (!artifact) continue;

      try {
        await this.repository.ingest({
          workspaceId,
          installation,
          workflowRunId: run.id,
          runAttempt: run.run_attempt,
          ranAt: new Date(run.created_at),
          githubUrl: run.html_url,
          prNumber: artifact.pr_number,
          status: artifact.status,
          reason: artifact.reason,
          verdict: artifact.verdict,
          model: artifact.model,
          durationMs: artifact.duration_ms ?? null,
          costUsd: artifact.cost_usd,
          findingsCount: artifact.findings_count,
          critical: artifact.critical ?? null,
          warning: artifact.warning ?? null,
          suggestion: artifact.suggestion ?? null,
          blockers: artifact.blockers,
        });
        ingested++;
        this.logger().info(
          { repo: installation.repo, run_id: run.id, findings: artifact.findings_count },
          'ci.ingest',
        );
      } catch (err) {
        if (!(err instanceof DuplicateCiRun)) throw err;
      }
    }
    return ingested;
  }

  async listRuns(workspaceId: string): Promise<CiRunsList> {
    return { items: await this.repository.listRuns(workspaceId, RUNS_LIST_LIMIT) };
  }
}
