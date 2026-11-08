import PQueue from 'p-queue';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import {
  EVAL_CASE_TIMEOUT_MS,
  EVAL_RUN_CONCURRENCY,
  type EvalCaseError,
  type EvalCaseErrorReason,
  type EvalExpectation,
  type LLMProvider,
} from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/index.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { aggregateRun, scoreCase, type AggregateCaseResult } from './core/index.js';
import type { EvalCaseRow, EvalRepository, EvalResultRow } from './repository.js';
import type { RunConfig } from './snapshot.js';

export type EvalLogger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/** Eval-owned queue (NOT JobRunner: no retries, no 120 s cap — D9). Shared across runs. */
const queue = new PQueue({ concurrency: EVAL_RUN_CONCURRENCY });

export interface CaseOutcome {
  pass: boolean;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number;
  costUsd: number | null;
  error: EvalCaseError | null;
  actualOutput: import('@devdigest/shared').EvalCaseActualOutput;
  counts: AggregateCaseResult['counts'];
}

const EMPTY_OUTPUT = { kept: [], dropped: [], expectations: [], finding_verdicts: [] };

/** D21: classify a failure into the persisted reason. */
export function classifyFailure(err: unknown): EvalCaseErrorReason {
  const name = (err as { name?: string })?.name ?? '';
  const msg = (err as Error)?.message ?? '';
  if (err instanceof TimeoutError || /APIUserAbortError|APIConnectionTimeoutError|TimeoutError/.test(name)) {
    return 'timeout';
  }
  if (name === 'ZodError' || /schema validation|structured output|invalid output/i.test(msg)) {
    return 'invalid_output';
  }
  return 'llm_failed';
}

/** Forward a per-call deadline to the provider without touching reviewer-core. */
function withProviderTimeout(llm: LLMProvider, timeoutMs: number): LLMProvider {
  return {
    id: llm.id,
    listModels: () => llm.listModels(),
    complete: (req) => llm.complete({ ...req, timeoutMs }),
    completeStructured: (req) => llm.completeStructured({ ...req, timeoutMs }),
    embed: (texts) => llm.embed(texts),
  };
}

/**
 * Run ONE case with the frozen config through the unchanged review engine and score it.
 * Engine inputs are exactly: agent config + case diff/title/body (AC-36, NG4). Never throws.
 */
export async function runCase(args: {
  config: RunConfig;
  evalCase: EvalCaseRow;
  llm: LLMProvider;
  timeoutMs?: number;
}): Promise<CaseOutcome> {
  const { config, evalCase, llm } = args;
  const timeoutMs = args.timeoutMs ?? EVAL_CASE_TIMEOUT_MS;
  const start = Date.now();
  const meta = (evalCase.inputMeta ?? {}) as { title?: string; body?: string };
  const expectations = (evalCase.expectedOutput ?? []) as EvalExpectation[];
  try {
    const diff = parseUnifiedDiff(evalCase.inputDiff ?? '');
    const outcome = await withTimeout(
      reviewPullRequest({
        systemPrompt: config.snapshot.system_prompt,
        model: config.snapshot.model,
        diff,
        llm: withProviderTimeout(llm, timeoutMs),
        strategy: config.snapshot.strategy as 'single-pass' | 'map-reduce' | 'auto',
        ...(config.skillBodies.length ? { skills: config.skillBodies } : {}),
        ...(meta.body ? { prDescription: meta.body } : {}),
        // PR title is untrusted: flatten to one line so it cannot inject instruction lines.
        task: `Review PR: ${(meta.title ?? '').replace(/[\r\n]+/g, ' ').slice(0, 300)}`,
        sessionId: `eval:${evalCase.id}`,
      }),
      timeoutMs,
    );
    const score = scoreCase({
      expectations,
      kept: outcome.review.findings,
      dropped: outcome.dropped,
    });
    return {
      pass: score.pass,
      recall: score.recall,
      precision: score.precision,
      citationAccuracy: score.citation_accuracy,
      durationMs: Date.now() - start,
      costUsd: outcome.costUsd,
      error: null,
      actualOutput: score.actual_output,
      counts: score.counts,
    };
  } catch (err) {
    return {
      pass: false,
      recall: null,
      precision: null,
      citationAccuracy: null,
      durationMs: Date.now() - start,
      costUsd: null,
      error: { reason: classifyFailure(err), message: ((err as Error)?.message ?? 'error').slice(0, 500) },
      actualOutput: EMPTY_OUTPUT,
      counts: null,
    };
  }
}

/**
 * Execute a started suite run in the background: cases on the shared queue, each persisted
 * exactly once (no re-run), then aggregate + finish. Never throws (D9); logs counts only
 * (NFR-7: never diff/prompt/body/model output).
 */
export async function executeSuiteRun(args: {
  repo: EvalRepository;
  runId: string;
  cases: EvalCaseRow[];
  config: RunConfig;
  llm: LLMProvider;
  logger: EvalLogger;
  timeoutMs?: number;
}): Promise<void> {
  const { repo, runId, cases, config, llm, logger } = args;
  const start = Date.now();
  const results: AggregateCaseResult[] = [];
  try {
    await Promise.all(
      cases.map((evalCase) =>
        queue.add(async () => {
          const out = await runCase({
            config,
            evalCase,
            llm,
            ...(args.timeoutMs ? { timeoutMs: args.timeoutMs } : {}),
          });
          results.push({
            name: evalCase.name,
            pass: out.pass,
            error: out.error,
            counts: out.counts,
            cost_usd: out.costUsd,
          });
          try {
            await repo.insertResult({
              caseId: evalCase.id,
              suiteRunId: runId,
              actualOutput: out.actualOutput,
              pass: out.pass,
              recall: out.recall,
              precision: out.precision,
              citationAccuracy: out.citationAccuracy,
              durationMs: out.durationMs,
              costUsd: out.costUsd,
              error: out.error,
            });
            await repo.incrementCasesDone(runId, out.error !== null);
          } catch (err) {
            logger.error({ run_id: runId, case_id: evalCase.id, err: (err as Error).message }, 'eval.case persist failed');
          }
          logger.info(
            {
              run_id: runId,
              case_id: evalCase.id,
              ms: out.durationMs,
              pass: out.pass,
              error_reason: out.error?.reason ?? null,
            },
            'eval.case',
          );
        }),
      ),
    );
    const agg = aggregateRun(results, Date.now() - start);
    await repo.finishSuiteRun(runId, {
      status: agg.status,
      metrics: agg.metrics,
      casesErrored: agg.cases_errored,
    });
    logger.info(
      { run_id: runId, status: agg.status, cases: cases.length, errored: agg.cases_errored, ms: Date.now() - start },
      'eval.run',
    );
  } catch (err) {
    logger.error({ run_id: runId, err: (err as Error).message }, 'eval.run crashed');
    await repo
      .finishSuiteRun(runId, { status: 'failed', metrics: null, casesErrored: 0, errorReason: 'internal' })
      .catch(() => false);
  }
}

export type { EvalResultRow };
