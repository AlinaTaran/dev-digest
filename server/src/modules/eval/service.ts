import {
  CreateEvalCaseBody,
  EVAL_MAX_CASES_PER_RUN,
  EVAL_CASE_TIMEOUT_MS,
  FindingEvalCaseBody,
  RunEvalCaseBody,
  StartSkillEvalRunBody,
  UpdateEvalCaseBody,
  type EvalCaseMeta,
  type EvalCaseResult,
  type EvalCaseView,
  type EvalExpectation,
  type EvalOverview,
  type EvalDashboard,
  type EvalRunAllSkipReason,
  type RunAllEvalResponse,
  type EvalSuiteRun,
  type EvalRunDetail,
  type EvalOwnerKind,
  type EvalTargets,
  type FindingEvalCaseResponse,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { parseUnifiedDiff } from '../../adapters/index.js';
import { loadDiff } from '../reviews/diff-loader.js';
import {
  buildCaseFromFinding,
  extractFileFragment,
  inputFilesFrom,
  normalizeDiffText,
  validateDiffInput,
} from './core/index.js';
import type { RequestContextLike } from './types.js';
import type { EvalCaseRow, EvalResultRow, EvalSuiteRunRow } from './repository.js';
import { buildAgentDashboard } from './dashboard.js';
import { buildAgentRunConfig, buildSkillRunConfig, type RunConfig } from './snapshot.js';
import type { AgentRow } from '../../db/rows.js';
import { executeSuiteRun, runCase, type EvalLogger } from './runner.js';

const ERR_CASE_UNAVAILABLE = 'eval_case_unavailable';
const ERR_RUN_UNAVAILABLE = 'eval_run_unavailable';
const ERR_RUN_IN_PROGRESS = 'eval_run_in_progress';

const OVERVIEW_SPARK_POINTS = 10;
const OVERVIEW_RECENT_RUNS = 20;

const EMPTY_META: EvalCaseMeta = { repo: '', pr_number: 0, title: '', body: '', head_sha: '', source: null };

function caseUnavailable(reason: string): AppError {
  return new AppError(ERR_CASE_UNAVAILABLE, `Eval case unavailable: ${reason}`, 409, { reason });
}
function runUnavailable(reason: string): AppError {
  return new AppError(ERR_RUN_UNAVAILABLE, `Eval run unavailable: ${reason}`, 409, { reason });
}

/** Zod issue path -> `a[0].b` for field errors (AC-20/21). */
function fieldPath(path: (string | number)[]): string {
  return path.reduce<string>(
    (acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : String(p)),
    '',
  );
}

function invalidCase(fields: { path: string; message: string }[]): AppError {
  return new AppError('invalid_eval_case', 'Invalid eval case', 400, { fields });
}

// ---- row -> DTO -----------------------------------------------------------

function resultToDto(r: EvalResultRow): EvalCaseResult {
  const actual = r.actualOutput as EvalCaseResult['actual_output'] | null;
  const expected = Array.isArray(r.caseExpected) ? (r.caseExpected as EvalExpectation[]) : [];
  return {
    id: r.id,
    case_id: r.caseId,
    case_name: r.caseName,
    suite_run_id: r.suiteRunId,
    ran_at: r.ranAt.toISOString(),
    pass: r.pass ?? false,
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    expected_count: expected.filter((e) => e.expect === 'must_find').length,
    got_count: actual ? actual.kept.length : 0,
    error: (r.error as EvalCaseResult['error']) ?? null,
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
    actual_output: actual ?? { kept: [], dropped: [], expectations: [], finding_verdicts: [] },
  };
}

export function caseToDto(row: EvalCaseRow, last: EvalResultRow | undefined): EvalCaseView {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: (row.inputFiles as EvalCaseView['input_files'] | null) ?? [],
    input_meta: (row.inputMeta as EvalCaseMeta | null) ?? EMPTY_META,
    expected_output: (row.expectedOutput as EvalExpectation[] | null) ?? [],
    notes: row.notes,
    source_finding_id: row.sourceFindingId,
    created_at: row.createdAt.toISOString(),
    last_result: last ? resultToDto(last) : null,
  };
}

export function suiteRunToDto(r: EvalSuiteRunRow): EvalSuiteRun {
  return {
    id: r.id,
    owner_kind: r.ownerKind,
    owner_id: r.ownerId,
    owner_version: r.ownerVersion,
    agent_id: r.agentId,
    agent_version: r.agentVersion,
    status: r.status,
    started_at: r.startedAt.toISOString(),
    finished_at: r.finishedAt?.toISOString() ?? null,
    cases_total: r.casesTotal,
    cases_done: r.casesDone,
    cases_errored: r.casesErrored,
    metrics: (r.metrics as EvalSuiteRun['metrics']) ?? null,
    config_snapshot: r.configSnapshot as EvalSuiteRun['config_snapshot'],
    case_ids: r.caseIds as string[],
    error_reason: r.errorReason,
    // Skill runs show the host agent that executed them (EC-31); frozen in the snapshot.
    ...(r.ownerKind === 'skill'
      ? { host_agent_name: (r.configSnapshot as EvalSuiteRun['config_snapshot']).agent_name || null }
      : {}),
  };
}

/**
 * Eval business rules (routes stay thin, all DB access is in the repository). Owners are
 * agents or skills; skill runs execute on a user-picked HOST agent (AC-79).
 */
export class EvalService {
  constructor(
    private container: Container,
    private logger: () => EvalLogger,
  ) {}

  private get repo() {
    return this.container.evalRepo;
  }

  // ---- boot reaper (D10) ---------------------------------------------------

  async reapOnBoot(): Promise<number> {
    const reaped = await this.repo.reapRunning();
    if (reaped > 0) this.logger().info({ reaped }, 'reaped interrupted eval runs on boot');
    return reaped;
  }

  // ---- owner guards ----------------------------------------------------------

  private async requireAgent(ctx: RequestContextLike, agentId: string) {
    const agent = await this.container.agentsRepo.getById(ctx.workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private async requireSkill(ctx: RequestContextLike, skillId: string) {
    const skill = await this.repo.getSkill(ctx.workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }

  private async requireOwner(ctx: RequestContextLike, kind: EvalOwnerKind, id: string) {
    return kind === 'skill' ? this.requireSkill(ctx, id) : this.requireAgent(ctx, id);
  }

  /** Host agent of a skill run: must exist in the workspace and be enabled (AC-82, EC-30). */
  private async requireHost(ctx: RequestContextLike, hostAgentId: string): Promise<AgentRow> {
    const host = await this.container.agentsRepo.getById(ctx.workspaceId, hostAgentId);
    if (!host || !host.enabled) throw runUnavailable('no_host_agent');
    return host;
  }

  private async requireCase(ctx: RequestContextLike, id: string): Promise<EvalCaseRow> {
    const row = await this.repo.getCase(ctx.workspaceId, id);
    if (!row) throw new NotFoundError('Eval case not found');
    return row;
  }

  // ---- finding -> case -------------------------------------------------------

  async createFromFinding(
    ctx: RequestContextLike,
    findingId: string,
    rawBody: unknown,
  ): Promise<{ status: 200 | 201; body: FindingEvalCaseResponse }> {
    const parsedBody = FindingEvalCaseBody.safeParse(rawBody ?? undefined);
    if (!parsedBody.success) {
      throw invalidCase(parsedBody.error.issues.map((i) => ({ path: fieldPath(i.path), message: i.message })));
    }
    const skillTarget = parsedBody.data?.owner_kind === 'skill' ? parsedBody.data.owner_id : null;
    const reviewRepo = this.container.reviewRepo;
    const fctx = await reviewRepo.findingContext(findingId);
    // findingContext is not workspace-scoped: a foreign finding is a 404 (AC-13).
    if (!fctx || fctx.pull.workspaceId !== ctx.workspaceId) throw new NotFoundError('Finding not found');
    const { finding, review, pull } = fctx;

    // Skill target: workspace-scoped (404) and currently linked to the review's agent (AC-77).
    const skill = skillTarget ? await this.requireSkill(ctx, skillTarget) : null;

    const decision = finding.acceptedAt ? 'accepted' : finding.dismissedAt ? 'dismissed' : null;
    if (!decision) throw caseUnavailable('undecided');

    let owner: { kind: EvalOwnerKind; id: string; name: string };
    if (skill) {
      if (!review.agentId) throw caseUnavailable('skill_not_linked');
      const linked = await this.container.agentsRepo.skillIdsForAgent(review.agentId);
      if (!linked.includes(skill.id)) throw caseUnavailable('skill_not_linked');
      owner = { kind: 'skill', id: skill.id, name: skill.name };
    } else {
      const ownerId = parsedBody.data?.owner_id ?? review.agentId;
      if (!ownerId) throw caseUnavailable('agent_missing');
      const agent = await this.container.agentsRepo.getById(ctx.workspaceId, ownerId);
      if (!agent) throw caseUnavailable('agent_missing');
      owner = { kind: 'agent', id: agent.id, name: agent.name };
    }

    // Idempotent per (finding, owner): an existing case is returned unchanged (AC-9, AC-76, EC-3).
    const existing = (await this.repo.listCases(ctx.workspaceId, owner.kind, owner.id)).find(
      (c) => c.sourceFindingId === finding.id,
    );
    if (existing) {
      return { status: 200, body: { case: caseToDto(existing, undefined), created: false, owner_name: owner.name } };
    }

    const repoRow = await reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw caseUnavailable('no_diff');
    const diff = await loadDiff(this.container, reviewRepo, ctx.workspaceId, pull, repoRow);
    const fragment = extractFileFragment(diff, finding.file);
    const parsedFragment = parseUnifiedDiff(fragment ?? '');
    const built = buildCaseFromFinding({
      finding: {
        id: finding.id,
        severity: finding.severity as EvalExpectation['severity'] & string,
        category: finding.category as never,
        title: finding.title,
        file: finding.file,
        start_line: finding.startLine,
        end_line: finding.endLine,
      },
      decision,
      review: { id: review.id, agent_id: review.agentId },
      pull: { number: pull.number, title: pull.title, body: pull.body, head_sha: pull.headSha },
      repoFullName: repoRow.fullName,
      fragment,
      parsedFragment,
      ownerKind: owner.kind,
      ownerId: owner.id,
      existingNames: await this.repo.caseNames(ctx.workspaceId, owner.kind, owner.id),
    });
    if (!built.ok) throw caseUnavailable(built.reason);

    const v = built.value;
    const { row, created } = await this.repo.insertCaseFromFinding({
      workspaceId: ctx.workspaceId,
      ownerKind: owner.kind,
      ownerId: owner.id,
      name: v.name,
      inputDiff: v.input_diff,
      inputFiles: v.input_files,
      inputMeta: v.input_meta,
      expectedOutput: v.expected_output,
      notes: null,
      sourceFindingId: v.source_finding_id,
    });
    this.logger().info(
      { case_id: row.id, owner_kind: owner.kind, owner_id: owner.id, decision, created, warnings: v.warnings },
      'eval.case.create',
    );
    return { status: created ? 201 : 200, body: { case: caseToDto(row, undefined), created, owner_name: owner.name } };
  }

  /** `GET /findings/:id/eval-targets` (D18): the review's agent + its currently linked skills. */
  async evalTargets(ctx: RequestContextLike, findingId: string): Promise<EvalTargets> {
    const fctx = await this.container.reviewRepo.findingContext(findingId);
    if (!fctx || fctx.pull.workspaceId !== ctx.workspaceId) throw new NotFoundError('Finding not found');
    const agentId = fctx.review.agentId;
    const agent = agentId ? await this.container.agentsRepo.getById(ctx.workspaceId, agentId) : undefined;
    if (!agent) return { agent: null, skills: [] };
    const linked = await this.container.agentsRepo.linkedSkills(agent.id);
    return {
      agent: { id: agent.id, name: agent.name },
      skills: linked.map((l) => ({ id: l.skill.id, name: l.skill.name })),
    };
  }

  // ---- case CRUD -------------------------------------------------------------

  async listCases(
    ctx: RequestContextLike,
    ownerId: string,
    kind: EvalOwnerKind = 'agent',
  ): Promise<EvalCaseView[]> {
    await this.requireOwner(ctx, kind, ownerId);
    const rows = await this.repo.listCases(ctx.workspaceId, kind, ownerId);
    const last = await this.repo.lastResults(rows.map((r) => r.id));
    return rows.map((r) => caseToDto(r, last.get(r.id)));
  }

  async getCase(ctx: RequestContextLike, id: string): Promise<EvalCaseView> {
    const row = await this.requireCase(ctx, id);
    const last = await this.repo.lastResults([row.id]);
    return caseToDto(row, last.get(row.id));
  }

  /** Validate a diff (normalised) and derive its input files; throws 400 with field paths. */
  private checkDiff(raw: string) {
    const text = normalizeDiffText(raw);
    const parsed = parseUnifiedDiff(text);
    const errors = validateDiffInput(text, parsed);
    if (errors.length > 0) throw invalidCase(errors);
    return { text, files: inputFilesFrom(parsed) };
  }

  async createCase(
    ctx: RequestContextLike,
    ownerId: string,
    rawBody: unknown,
    kind: EvalOwnerKind = 'agent',
  ): Promise<EvalCaseView> {
    await this.requireOwner(ctx, kind, ownerId);
    const parsed = CreateEvalCaseBody.safeParse(rawBody);
    if (!parsed.success) {
      throw invalidCase(
        parsed.error.issues.map((i) => ({ path: fieldPath(i.path), message: i.message })),
      );
    }
    const body = parsed.data;
    const diff = this.checkDiff(body.input_diff);
    const row = await this.repo.insertCase({
      workspaceId: ctx.workspaceId,
      ownerKind: kind,
      ownerId,
      name: body.name,
      inputDiff: diff.text,
      inputFiles: diff.files,
      inputMeta: { ...EMPTY_META, title: body.input_meta?.title ?? '', body: body.input_meta?.body ?? '' },
      expectedOutput: body.expected_output,
      notes: body.notes ?? null,
    });
    return caseToDto(row, undefined);
  }

  async updateCase(ctx: RequestContextLike, id: string, rawBody: unknown): Promise<EvalCaseView> {
    const existing = await this.requireCase(ctx, id);
    const parsed = UpdateEvalCaseBody.safeParse(rawBody);
    if (!parsed.success) {
      throw invalidCase(
        parsed.error.issues.map((i) => ({ path: fieldPath(i.path), message: i.message })),
      );
    }
    const body = parsed.data;
    const diff = body.input_diff !== undefined ? this.checkDiff(body.input_diff) : null;
    const prevMeta = (existing.inputMeta as EvalCaseMeta | null) ?? EMPTY_META;
    const row = await this.repo.updateCase(ctx.workspaceId, id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(diff ? { inputDiff: diff.text, inputFiles: diff.files } : {}),
      ...(body.input_meta !== undefined
        ? {
            inputMeta: {
              ...prevMeta,
              ...(body.input_meta.title !== undefined ? { title: body.input_meta.title } : {}),
              ...(body.input_meta.body !== undefined ? { body: body.input_meta.body } : {}),
            },
          }
        : {}),
      ...(body.expected_output !== undefined ? { expectedOutput: body.expected_output } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });
    if (!row) throw new NotFoundError('Eval case not found');
    const last = await this.repo.lastResults([row.id]);
    return caseToDto(row, last.get(row.id));
  }

  async deleteCase(ctx: RequestContextLike, id: string): Promise<void> {
    const ok = await this.repo.deleteCase(ctx.workspaceId, id);
    if (!ok) throw new NotFoundError('Eval case not found');
  }

  // ---- runs --------------------------------------------------------------------

  /** Resolve the provider BEFORE any run row exists: a missing key is 409, not 500 (AC-44). */
  private async resolveLlm(provider: string) {
    try {
      return await this.container.llm(provider as 'openai' | 'anthropic' | 'openrouter');
    } catch (err) {
      if (err instanceof ConfigError) throw runUnavailable('llm_not_configured');
      throw err;
    }
  }

  /** Synchronous single-case run (<= 90 s). Not part of run history (AC-24/25). */
  async runSingleCase(ctx: RequestContextLike, id: string, rawBody: unknown): Promise<EvalCaseResult> {
    const evalCase = await this.requireCase(ctx, id);
    const body = RunEvalCaseBody.safeParse(rawBody ?? undefined);
    if (!body.success) {
      throw invalidCase(body.error.issues.map((i) => ({ path: fieldPath(i.path), message: i.message })));
    }
    let config: RunConfig;
    let provider: string;
    if (evalCase.ownerKind === 'skill') {
      // Skill case: needs a valid host agent (AC-79/82); engine sees only the tested skill.
      const skill = await this.requireSkill(ctx, evalCase.ownerId);
      if (!body.data) throw runUnavailable('no_host_agent');
      const host = await this.requireHost(ctx, body.data.host_agent_id);
      provider = host.provider;
      config = buildSkillRunConfig(host, skill);
    } else {
      const agent = await this.requireAgent(ctx, evalCase.ownerId);
      provider = agent.provider;
      config = await buildAgentRunConfig(this.container, agent);
    }
    const llm = await this.resolveLlm(provider);
    const out = await runCase({ config, evalCase, llm, timeoutMs: EVAL_CASE_TIMEOUT_MS });
    const row = await this.repo.insertResult({
      caseId: evalCase.id,
      suiteRunId: null,
      actualOutput: out.actualOutput,
      pass: out.pass,
      recall: out.recall,
      precision: out.precision,
      citationAccuracy: out.citationAccuracy,
      durationMs: out.durationMs,
      costUsd: out.costUsd,
      error: out.error,
    });
    this.logger().info(
      { case_id: evalCase.id, ms: out.durationMs, pass: out.pass, error_reason: out.error?.reason ?? null },
      'eval.case',
    );
    return resultToDto({ ...row, caseName: evalCase.name, caseExpected: evalCase.expectedOutput });
  }

  async startAgentRun(ctx: RequestContextLike, agentId: string): Promise<EvalSuiteRun> {
    const agent = await this.requireAgent(ctx, agentId);
    const cases = await this.repo.listCases(ctx.workspaceId, 'agent', agentId);
    if (cases.length === 0) throw runUnavailable('no_cases');
    if (cases.length > EVAL_MAX_CASES_PER_RUN) throw runUnavailable('too_many_cases');
    const llm = await this.resolveLlm(agent.provider);
    const config = await buildAgentRunConfig(this.container, agent);

    const created = await this.repo.createSuiteRun({
      workspaceId: ctx.workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      ownerVersion: agent.version,
      agentId: agent.id,
      agentVersion: config.agentVersion,
      casesTotal: cases.length,
      configSnapshot: config.snapshot,
      caseIds: cases.map((c) => c.id),
    });
    if ('conflict' in created) {
      throw new AppError(ERR_RUN_IN_PROGRESS, 'An eval run is already in progress', 409, {
        active_run_id: created.conflict,
      });
    }

    // Fire-and-forget (cf. reviews/service.ts): the response returns now, state is persisted
    // by the runner itself.
    void executeSuiteRun({
      repo: this.repo,
      runId: created.run.id,
      cases,
      config,
      llm,
      logger: this.logger(),
    }).catch((err) => {
      this.logger().error({ run_id: created.run.id, err: (err as Error).message }, 'eval: background run crashed');
    });

    return suiteRunToDto(created.run);
  }

  /** `POST /skills/:id/eval-runs` (AC-79..82): run the skill's cases on a host agent. */
  async startSkillRun(ctx: RequestContextLike, skillId: string, rawBody: unknown): Promise<EvalSuiteRun> {
    const skill = await this.requireSkill(ctx, skillId);
    const body = StartSkillEvalRunBody.safeParse(rawBody);
    if (!body.success) {
      throw invalidCase(body.error.issues.map((i) => ({ path: fieldPath(i.path), message: i.message })));
    }
    const host = await this.requireHost(ctx, body.data.host_agent_id);
    const cases = await this.repo.listCases(ctx.workspaceId, 'skill', skill.id);
    if (cases.length === 0) throw runUnavailable('no_cases');
    if (cases.length > EVAL_MAX_CASES_PER_RUN) throw runUnavailable('too_many_cases');
    const llm = await this.resolveLlm(host.provider);
    const config = buildSkillRunConfig(host, skill);

    const created = await this.repo.createSuiteRun({
      workspaceId: ctx.workspaceId,
      ownerKind: 'skill',
      ownerId: skill.id,
      ownerVersion: skill.version,
      agentId: host.id,
      agentVersion: host.version,
      casesTotal: cases.length,
      configSnapshot: config.snapshot,
      caseIds: cases.map((c) => c.id),
    });
    if ('conflict' in created) {
      throw new AppError(ERR_RUN_IN_PROGRESS, 'An eval run is already in progress', 409, {
        active_run_id: created.conflict,
      });
    }
    void executeSuiteRun({
      repo: this.repo,
      runId: created.run.id,
      cases,
      config,
      llm,
      logger: this.logger(),
    }).catch((err) => {
      this.logger().error({ run_id: created.run.id, err: (err as Error).message }, 'eval: background run crashed');
    });
    return suiteRunToDto(created.run);
  }

  async listSkillRuns(ctx: RequestContextLike, skillId: string, days: number): Promise<EvalSuiteRun[]> {
    await this.requireSkill(ctx, skillId);
    const rows = await this.repo.listSuiteRuns(ctx.workspaceId, 'skill', skillId, days);
    return rows.map(suiteRunToDto);
  }

  async listAgentRuns(ctx: RequestContextLike, agentId: string, days: number): Promise<EvalSuiteRun[]> {
    await this.requireAgent(ctx, agentId);
    const rows = await this.repo.listSuiteRuns(ctx.workspaceId, 'agent', agentId, days);
    return rows.map(suiteRunToDto);
  }

  async getRun(ctx: RequestContextLike, id: string): Promise<EvalRunDetail> {
    const run = await this.repo.getSuiteRun(ctx.workspaceId, id);
    if (!run) throw new NotFoundError('Eval run not found');
    const results = await this.repo.listResults(run.id);
    return { eval_run: suiteRunToDto(run), results: results.map(resultToDto) };
  }

  // ---- dashboards (DB-only: no LLM, no GitHub) ------------------------------------

  async agentDashboard(ctx: RequestContextLike, agentId: string, days: number): Promise<EvalDashboard> {
    await this.requireAgent(ctx, agentId);
    const [rows, counts] = await Promise.all([
      this.repo.listSuiteRuns(ctx.workspaceId, 'agent', agentId, days),
      this.repo.agentCaseCounts(ctx.workspaceId),
    ]);
    return buildAgentDashboard(agentId, counts.get(agentId) ?? 0, rows.map(suiteRunToDto));
  }

  /** `GET /eval/dashboard`: per-agent cards + latest 20 finished agent runs (AC-60..62, AC-86). */
  async overview(ctx: RequestContextLike): Promise<EvalOverview> {
    const ws = ctx.workspaceId;
    const [agents, counts, lastRuns, recalls, recent] = await Promise.all([
      this.container.agentsRepo.list(ws),
      this.repo.agentCaseCounts(ws),
      this.repo.lastFinishedAgentRuns(ws),
      this.repo.recentRecalls(ws, OVERVIEW_SPARK_POINTS),
      this.repo.recentFinishedAgentRuns(ws, OVERVIEW_RECENT_RUNS),
    ]);
    const names = new Map(agents.map((a) => [a.id, a.name]));
    return {
      agents: agents
        .filter((a) => (counts.get(a.id) ?? 0) > 0)
        .map((a) => {
          const last = lastRuns.get(a.id);
          return {
            agent_id: a.id,
            name: a.name,
            model: a.model,
            cases_total: counts.get(a.id) ?? 0,
            last_run: last ? suiteRunToDto(last) : null,
            recall_sparkline: recalls.get(a.id) ?? [],
          };
        }),
      recent_runs: recent
        .filter((r) => names.has(r.ownerId))
        .map((r) => ({ ...suiteRunToDto(r), agent_name: names.get(r.ownerId)! })),
    };
  }

  /** `POST /eval-runs {all:true}` (AC-63): start every runnable agent through `startAgentRun`. */
  async runAllAgents(ctx: RequestContextLike): Promise<RunAllEvalResponse> {
    const [agents, counts] = await Promise.all([
      this.container.agentsRepo.list(ctx.workspaceId),
      this.repo.agentCaseCounts(ctx.workspaceId),
    ]);
    const started: EvalSuiteRun[] = [];
    const skipped: RunAllEvalResponse['skipped'] = [];
    const skip = (agent_id: string, reason: EvalRunAllSkipReason) => skipped.push({ agent_id, reason });

    for (const agent of agents) {
      if (!agent.enabled) {
        skip(agent.id, 'disabled');
        continue;
      }
      if ((counts.get(agent.id) ?? 0) === 0) {
        skip(agent.id, 'no_cases');
        continue;
      }
      if ((counts.get(agent.id) ?? 0) > EVAL_MAX_CASES_PER_RUN) {
        skip(agent.id, 'too_many_cases');
        continue;
      }
      try {
        started.push(await this.startAgentRun(ctx, agent.id));
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        const reason = (err.details as { reason?: string } | undefined)?.reason;
        if (err.code === ERR_RUN_IN_PROGRESS) skip(agent.id, 'in_progress');
        else if (reason === 'llm_not_configured') skip(agent.id, 'llm_not_configured');
        else if (reason === 'no_cases') skip(agent.id, 'no_cases');
        else if (reason === 'too_many_cases') skip(agent.id, 'too_many_cases');
        else {
          // Unknown failure: never fail the whole batch.
          this.logger().info({ agent_id: agent.id, code: err.code, reason }, 'eval run-all: agent not started');
        }
      }
    }
    return { started, skipped };
  }
}
