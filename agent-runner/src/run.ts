import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { LLMProvider, GitHubReviewPayload, CiResultArtifact } from '@devdigest/shared';
import { reviewPullRequest, toReviewPayload, gateTriggered, countBlockers } from '@devdigest/reviewer-core';
import { loadManifest } from './manifest.js';
import { loadSkillBodies } from './skills.js';
import { loadMemory } from './memory.js';
import { resolvePrContext, type CiEnv } from './context.js';
import { parseUnifiedDiff, stripIgnoredFiles } from './diff.js';
import { fetchPrDiff, postGithubReview, postPrComment, type FetchLike } from './github.js';
import { buildFailedArtifact, buildResultArtifact } from './artifact.js';
import { RunnerError } from './errors.js';

/**
 * `runCi` — the runner's single orchestration entry point (T8). Mirrors the
 * pipeline a local studio review runs (assemblePrompt/wrapUntrusted →
 * completeStructured → groundFindings, all INSIDE `reviewPullRequest`) so CI
 * and local stay in parity (AC-36): this file never re-implements or
 * hand-rolls any of that — it only resolves CI-specific inputs (manifest,
 * skills, diff, PR context) and hands them to the SAME reviewer-core engine
 * the studio calls, then turns the grounded result into GitHub side effects.
 *
 * Deterministic gate (AC-23): the GitHub review event + blocker count are
 * computed from `countBlockers`/`gateTriggered` + the manifest's `ci_fail_on`
 * against the GROUNDED findings — never from `review.verdict` (the model's
 * self-report), which is discarded here on purpose.
 *
 * Hard-fail (Q5): a single try/catch wraps the ENTIRE pipeline. Any failure —
 * invalid manifest (AC-20), missing skill file, unresolvable CI context,
 * diff-fetch failure, or an LLM/model-call error inside `reviewPullRequest` —
 * short-circuits to `{ exitCode: 1, artifact: null, posted: null }` before any
 * GitHub post. Do not add per-stage catches that post partial state; a failure
 * anywhere upstream of "we have a grounded review" posts NOTHING (no synthetic
 * review skeleton). The only thing written is a `failed` result artifact (no
 * findings, a short `reason`) so the studio can show that — and why — the run
 * failed instead of the run silently never appearing. It is written only when
 * no result artifact exists yet, so a GitHub posting failure after a completed
 * review never overwrites the real result.
 */

export type PostAs = 'github_review' | 'pr_comment' | 'none';

export interface RunCiDeps {
  /** Directory containing `agents/` and `skills/` (checked-in `.devdigest/`). */
  devdigestDir: string;
  env: CiEnv;
  /** Injected LLM provider — `OpenRouterProvider` in production, a stub in tests. */
  llm: LLMProvider;
  /** How to post the result — `'github_review' | 'pr_comment' | 'none'` (AC-24). */
  postAs: PostAs;
  /** Absolute path to write the `CiResultArtifact` JSON to. */
  resultPath: string;
  fetchImpl?: FetchLike;
  readFile?: typeof readFileSync;
  readDir?: typeof readdirSync;
  writeFile?: typeof writeFileSync;
  now?: () => number;
  /**
   * Override diff retrieval (tests supply a fixture diff directly instead of
   * hitting the GitHub API). Defaults to `fetchPrDiff` via the GitHub REST API.
   */
  fetchDiff?: (
    ctx: { owner: string; repo: string; prNumber: number },
    token: string,
    fetchImpl: FetchLike,
  ) => Promise<string>;
}

export interface RunCiSuccess {
  exitCode: number;
  artifact: CiResultArtifact;
  posted: { kind: PostAs; payload?: GitHubReviewPayload };
  blockers: number;
  gateTriggered: boolean;
  error?: undefined;
}

export interface RunCiFailure {
  exitCode: number;
  artifact: null;
  posted: null;
  blockers?: undefined;
  gateTriggered?: undefined;
  error: string;
}

export type RunCiResult = RunCiSuccess | RunCiFailure;

export async function runCi(deps: RunCiDeps): Promise<RunCiResult> {
  const readFile = deps.readFile ?? readFileSync;
  const readDir = deps.readDir ?? readdirSync;
  const writeFile = deps.writeFile ?? writeFileSync;
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fetchDiffImpl = deps.fetchDiff ?? fetchPrDiff;

  // What the `failed` artifact reports; refined as the pipeline learns more.
  const startedAt = now();
  let agent = 'unknown';
  let model = 'unknown';
  let prNumber: number | null = null;
  let artifactWritten = false;

  try {
    // 1. Load + validate the manifest BEFORE it is used for anything (AC-20).
    const manifest = loadManifest(deps.devdigestDir, { readFile, readDir });
    agent = manifest.name;
    model = manifest.model;
    const skills = loadSkillBodies(deps.devdigestDir, manifest.skills, readFile);
    const memory = loadMemory(deps.devdigestDir, readFile);

    // 2. Resolve CI context (PR number/title/body/repo) from env + event payload.
    const ctx = resolvePrContext(deps.env, readFile);
    prNumber = ctx.prNumber;

    const githubToken = deps.env.GITHUB_TOKEN;
    if (deps.postAs !== 'none' && !githubToken) {
      throw new RunnerError(`GITHUB_TOKEN is required to post as '${deps.postAs}'`);
    }

    // 3. Assemble the diff from the CI context. Strip DevDigest's own exported
    //    artifacts (`.devdigest/**`, the generated workflow) BEFORE parse: the
    //    minified runner bundle would otherwise fail the whole review with a
    //    GitHub 422 "diff too large", and reviewing our own config is noise.
    const rawDiff = await fetchDiffImpl(ctx, githubToken ?? '', fetchImpl);
    const diff = parseUnifiedDiff(stripIgnoredFiles(rawDiff));

    // 4. Run the SAME engine the studio uses. `reviewPullRequest` internally
    //    calls `assemblePrompt`/`wrapUntrusted` (diff → `<untrusted
    //    source="diff">`, prDescription → `<untrusted source="pr-description">`,
    //    AC-21) and the mandatory `groundFindings()` gate (AC-22: an all-dropped
    //    result is a valid zero-finding review, not an error — it flows through
    //    normally below).
    const start = now();
    const outcome = await reviewPullRequest({
      systemPrompt: manifest.system_prompt,
      model: manifest.model,
      diff,
      llm: deps.llm,
      strategy: manifest.strategy,
      skills,
      memory,
      prDescription: ctx.body,
      task: `Review PR #${ctx.prNumber}: ${ctx.title}`,
    });
    const durationMs = now() - start;

    // 5. Deterministic verdict/gate from GROUNDED findings + `ci_fail_on`
    //    (AC-23) — never `outcome.review.verdict`.
    const payload = toReviewPayload(outcome.review, {
      failOn: manifest.ci_fail_on,
      diff,
      title: manifest.name,
    });
    const blockers = countBlockers(outcome.review.findings, manifest.ci_fail_on);
    const triggered = gateTriggered(outcome.review.findings, manifest.ci_fail_on);

    // 6. Build + write the artifact before posting, so a GitHub-side posting
    //    failure never loses the already-computed, already-grounded result.
    const artifact = buildResultArtifact({
      findings: outcome.review.findings,
      costUsd: outcome.costUsd,
      durationMs,
      agent: manifest.name,
      model: manifest.model,
      prNumber: ctx.prNumber,
      blockers,
      verdict: outcome.review.verdict,
    });
    writeFile(deps.resultPath, `${JSON.stringify(artifact, null, 2)}\n`);
    artifactWritten = true;

    // 7. Post per `post_as` (AC-24).
    if (deps.postAs === 'github_review') {
      await postGithubReview(ctx, githubToken as string, payload, fetchImpl);
    } else if (deps.postAs === 'pr_comment') {
      await postPrComment(ctx, githubToken as string, payload.body, fetchImpl);
    }
    // 'none' → post nothing (exit-code only).

    // 8. Exit non-zero IFF the gate triggered REQUEST_CHANGES (AC-25).
    return {
      exitCode: triggered ? 1 : 0,
      artifact,
      posted: { kind: deps.postAs, payload },
      blockers,
      gateTriggered: triggered,
    };
  } catch (err) {
    // Hard-fail (Q5): non-zero exit, nothing posted, no synthetic review
    // skeleton — regardless of which stage above threw.
    const message = err instanceof Error ? err.message : String(err);
    if (!artifactWritten) {
      try {
        // The failure may predate PR-context resolution; try once more so the
        // studio can attach the run to the right PR (best effort — falls back to 1).
        prNumber ??= resolvePrContext(deps.env, readFile).prNumber;
      } catch {
        // keep the fallback
      }
      try {
        const failed = buildFailedArtifact({
          reason: message,
          durationMs: now() - startedAt,
          agent,
          model,
          prNumber: prNumber ?? 1,
        });
        writeFile(deps.resultPath, `${JSON.stringify(failed, null, 2)}\n`);
      } catch {
        // Best effort: never mask the real failure with an artifact-write error.
      }
    }
    return { exitCode: 1, artifact: null, posted: null, error: message };
  }
}
