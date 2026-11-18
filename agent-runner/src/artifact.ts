import type { Finding } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/** Runner version string embedded in every artifact (informational only). */
export const RUNNER_VERSION = '1';

/** `runner_version` written into every artifact — identifies this package, not the shipped bundle hash. */
const RUNNER_ID = `agent-runner@${RUNNER_VERSION}`;

/** The studio stores `reason` as free text — keep it short and bounded. */
const MAX_REASON = 500;
/** `agent` / `model` are capped by the contract; manifest values can be arbitrarily long. */
const MAX_NAME = 200;

export interface BuildResultArtifactInput {
  findings: Finding[];
  costUsd: number | null;
  durationMs: number;
  agent: string;
  model: string;
  prNumber: number;
  /** Findings at/above the manifest's `ci_fail_on` gate (deterministic, from `countBlockers`). */
  blockers: number;
  verdict: CiResultArtifact['verdict'];
}

function severityCounts(findings: Finding[]): { critical: number; warning: number; suggestion: number } {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

function validated(candidate: unknown): CiResultArtifact {
  const result = CiResultArtifact.safeParse(candidate);
  if (!result.success) {
    // Should be unreachable — every field is shaped to the schema. If this ever
    // fires it's a genuine internal bug, not a user/config error.
    throw new RunnerError(
      `Internal error: built result artifact failed CiResultArtifact validation: ${result.error.message}`,
    );
  }
  return result.data;
}

/**
 * Build + validate the `devdigest-result.json` artifact for a COMPLETED review
 * (AC-26). Validated against the SAME `CiResultArtifact` Zod contract the
 * studio's ingest path `safeParse`s on the way back in, so a malformed artifact
 * fails loudly here rather than silently on ingest.
 */
export function buildResultArtifact(input: BuildResultArtifactInput): CiResultArtifact {
  const counts = severityCounts(input.findings);
  return validated({
    schema_version: 1,
    status: input.findings.length === 0 ? 'no_findings' : 'succeeded',
    reason: null,
    verdict: input.verdict,
    findings_count: input.findings.length,
    critical: counts.critical,
    warning: counts.warning,
    suggestion: counts.suggestion,
    blockers: input.blockers,
    cost_usd: input.costUsd,
    duration_ms: input.durationMs,
    agent: input.agent.slice(0, MAX_NAME),
    model: input.model.slice(0, MAX_NAME),
    runner_version: RUNNER_ID,
    version: RUNNER_VERSION,
    pr_number: input.prNumber,
  });
}

export interface BuildFailedArtifactInput {
  reason: string;
  durationMs: number;
  agent: string;
  model: string;
  prNumber: number;
}

/**
 * The artifact for a run that hard-failed. It carries NO findings and nothing is
 * posted to the PR — it only lets the studio show that (and why) the run failed,
 * instead of the run silently never appearing.
 */
export function buildFailedArtifact(input: BuildFailedArtifactInput): CiResultArtifact {
  return validated({
    schema_version: 1,
    status: 'failed',
    reason: input.reason.slice(0, MAX_REASON),
    verdict: null,
    findings_count: 0,
    blockers: 0,
    cost_usd: null,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    agent: input.agent.slice(0, MAX_NAME),
    model: input.model.slice(0, MAX_NAME),
    runner_version: RUNNER_ID,
    version: RUNNER_VERSION,
    pr_number: input.prNumber,
  });
}
