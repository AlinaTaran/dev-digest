import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  Onboarding,
  OnboardingGenerateResponse,
  OnboardingTourResponse,
  EvalRun,
  MemoryItem,
  RunTrace,
  ContextListing,
  ContextAttachBody,
  AgentContextResponse,
  SkillContextResponse,
  SettingsKnown,
  Settings,
  Repo,
  PrDetail,
  PrMeta,
  PrBrief,
  PrBriefResponse,
  BriefModelOutput,
  BriefModelOutputCountsOnly,
  BriefBlastReason,
  BlastDegradedReason,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, findings: 3, grounding: '3/3 passed', cost_usd: 0.06 },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
    // Old traces predate project context: the new fields are absent, not required.
    expect(trace.specs_missing).toBeUndefined();
    expect(trace.specs_tokens).toBeUndefined();
  });

  it('RunTrace accepts specs_missing + specs_tokens', () => {
    const trace = RunTrace.parse({
      config: { agent: 'A', model: 'm' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, findings: 0, grounding: '0/0', cost_usd: null },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '{}',
      memory_pulled: [],
      specs_read: ['specs/a.md'],
      specs_missing: ['specs/gone.md'],
      specs_tokens: [{ path: 'specs/a.md', tokens: 12 }],
      log: [],
    });
    expect(trace.specs_tokens?.[0]?.tokens).toBe(12);
    expect(trace.specs_missing).toEqual(['specs/gone.md']);
  });
});

describe('project context contracts', () => {
  const uuid = '3f2b8c1e-6a4d-4e0a-9b1c-2d3e4f5a6b7c';

  it('ContextListing + attach body + responses parse fixtures', () => {
    const listing = ContextListing.parse({
      repo_id: uuid,
      globs: ['**/{specs,docs,insights}/**/*.md'],
      scanned_at: '2026-10-21T10:00:00.000Z',
      clone_sha: null,
      degraded: false,
      reason: null,
      truncated: false,
      total_found: 1,
      docs: [
        { path: 'specs/a.md', name: 'a.md', dir: 'specs', type: 'specs', size_bytes: 10, tokens: 3, too_large: false, used_by_agents: 2 },
      ],
    });
    expect(listing.docs[0]?.updated_at).toBeUndefined();
    expect(ContextAttachBody.parse({ repo_id: uuid, paths: ['specs/a.md'] }).paths).toHaveLength(1);
    expect(() => ContextAttachBody.parse({ repo_id: 'nope', paths: [] })).toThrow();

    const attached = [{ path: 'specs/a.md', position: 0, missing: false, tokens: 3 }];
    expect(
      AgentContextResponse.parse({
        repo_id: uuid,
        attached,
        inherited: [{ path: 'docs/b.md', skill_id: uuid, skill_name: 'S', missing: false, tokens: 5, duplicate_of_attached: false }],
        effective: [
          { path: 'specs/a.md', source: 'agent', missing: false, tokens: 3 },
          { path: 'docs/b.md', source: { skill_id: uuid, skill_name: 'S' }, missing: false, tokens: 5 },
        ],
        total_tokens: 8,
      }).effective,
    ).toHaveLength(2);
    expect(
      SkillContextResponse.parse({ repo_id: uuid, attached, total_tokens: 3, serialized: '## Project context\n- specs/a.md' })
        .serialized,
    ).toContain('- specs/a.md');
  });

  it('SettingsKnown.project_context_globs is optional', () => {
    expect(SettingsKnown.parse({}).project_context_globs).toBeUndefined();
    expect(SettingsKnown.parse({ project_context_globs: ['docs/**/*.md'] }).project_context_globs).toEqual(['docs/**/*.md']);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });

  it('PrMeta with inlined latest_findings (list popover)', () => {
    const pr = PrMeta.parse({
      number: 482,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      head_sha: 'sha',
      additions: 247,
      deletions: 38,
      files_count: 9,
      status: 'needs_review',
      score: 61,
      findings: { CRITICAL: 2, WARNING: 2, SUGGESTION: 2 },
      latest_findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(pr.latest_findings).toHaveLength(1);
  });
});

describe('Onboarding contract', () => {
  const node = (i: number) => ({ id: `n${i}`, label: `Node ${i}`, kind: 'module', path: null });
  const tour = () => ({
    generated_at: '2026-10-25T10:00:00.000Z',
    source_sha: 'abc1234',
    files_indexed: 42,
    index_status: 'full',
    degraded: false,
    reasons: [],
    model: { provider: 'openai', model: 'gpt-x' },
    dropped_refs: 0,
    sections: [
      {
        kind: 'architecture',
        empty_reason: null,
        summary_md: 'Layered API.',
        top_dirs: [{ path: 'src', files: 40 }],
        diagram: { nodes: [node(1), node(2)], edges: [{ from: 'n1', to: 'n2', label: null }] },
      },
      {
        kind: 'critical_paths',
        empty_reason: null,
        items: [{ path: 'src/a.ts', why: null, fan_in: 3 }],
      },
      {
        kind: 'run_locally',
        empty_reason: null,
        steps: [{ command: 'pnpm install', source_path: 'package.json', note: null }],
      },
      { kind: 'reading_path', empty_reason: null, steps: [{ path: 'src/a.ts', why: 'entry' }] },
      {
        kind: 'first_tasks',
        empty_reason: null,
        tasks: [{ title: 'Add test', path: 'src/a.ts', path_kind: 'file', complexity: 'low' }],
      },
    ],
  });
  type Tour = ReturnType<typeof tour>;
  const mutate = (fn: (t: Tour) => void) => {
    const t = tour();
    fn(t);
    return t;
  };
  // Sections are a heterogeneous tuple; tests poke at fields loosely.
  const sec = (t: Tour, i: number) => t.sections[i] as Record<string, any>;

  it('accepts a valid five-section tour and the API envelopes', () => {
    expect(() => Onboarding.parse(tour())).not.toThrow();
    const generation = {
      id: 'g1',
      status: 'generating',
      started_at: '2026-10-25T10:00:00.000Z',
      finished_at: null,
      error_reason: null,
    };
    expect(() => OnboardingGenerateResponse.parse({ generation })).not.toThrow();
    expect(() =>
      OnboardingTourResponse.parse({
        repo_id: 'r1',
        tour: null,
        generation,
        availability: { can_generate: false, reason: 'not_cloned' },
        stale: false,
        current_index_sha: null,
      }),
    ).not.toThrow();
  });

  it('rejects wrong section count, order, and the legacy shape', () => {
    expect(Onboarding.safeParse(mutate((t) => t.sections.pop())).success).toBe(false);
    expect(
      Onboarding.safeParse(
        mutate((t) => {
          [t.sections[0], t.sections[1]] = [t.sections[1]!, t.sections[0]!];
        }),
      ).success,
    ).toBe(false);
    expect(
      Onboarding.safeParse({
        sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }],
      }).success,
    ).toBe(false);
  });

  it('enforces caps at the contract level', () => {
    expect(
      Onboarding.safeParse(mutate((t) => (sec(t, 0).summary_md = 'x'.repeat(1201)))).success,
    ).toBe(false);
    expect(
      Onboarding.safeParse(
        mutate((t) => {
          sec(t, 0).diagram.nodes = Array.from({ length: 13 }, (_, i) => node(i));
        }),
      ).success,
    ).toBe(false);
    expect(
      Onboarding.safeParse(mutate((t) => (sec(t, 4).tasks[0].complexity = 'high'))).success,
    ).toBe(false);
    expect(
      Onboarding.safeParse(mutate((t) => (sec(t, 2).steps[0].command = 'x'.repeat(301)))).success,
    ).toBe(false);
    expect(
      Onboarding.safeParse(mutate((t) => (sec(t, 3).steps[0].why = 'x'.repeat(121)))).success,
    ).toBe(false);
  });
});

describe('PrBrief contract', () => {
  const risk = (refs: string[] = ['a.ts']) => ({
    kind: 'security',
    title: 'Title',
    explanation: 'Because.',
    severity: 'high' as const,
    file_refs: refs,
  });
  const validBrief = () => ({
    summary: 'Adds a thing.',
    risks: { risks: [risk()] },
    review_focus: [{ file: 'a.ts', line: 3, reason: 'Check this', line_adjusted: false }],
    intent: { intent: 'x', in_scope: [], out_of_scope: [] },
    blast: { changed_symbols: [], downstream: [], summary: '' },
    history: { history: [] },
    meta: {
      head_sha: 'abc',
      generated_at: '2026-10-25T00:00:00Z',
      model: { provider: 'openrouter', model: 'm' },
      missing_inputs: [],
      blast_reason: null,
      input_truncated: [],
      input_tokens_est: 10,
      specs_used: [],
      specs_skipped: [],
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: null,
      dropped_refs: 0,
      adjusted_lines: 0,
    },
  });
  const mutate = (fn: (b: ReturnType<typeof validBrief>) => void) => {
    const b = validBrief();
    fn(b);
    return PrBrief.safeParse(b).success;
  };

  it('parses valid, null-block and rejects legacy shapes', () => {
    expect(PrBrief.safeParse(validBrief()).success).toBe(true);
    expect(
      mutate((b) => {
        (b as any).intent = null;
        (b as any).blast = null;
        (b as any).history = null;
      }),
    ).toBe(true);
    expect(PrBrief.safeParse({ risks: [] }).success).toBe(false);
  });

  it('enforces caps', () => {
    expect(mutate((b) => (b.summary = 'x'.repeat(601)))).toBe(false);
    expect(mutate((b) => (b.risks.risks = Array.from({ length: 7 }, () => risk())))).toBe(false);
    expect(
      mutate((b) => (b.review_focus = Array.from({ length: 9 }, () => ({ ...b.review_focus[0]! })))),
    ).toBe(false);
    expect(mutate((b) => (b.review_focus[0]!.line = 0))).toBe(false);
    expect(mutate((b) => (b.risks.risks = [risk([])]))).toBe(false);
    expect(mutate((b) => (b.risks.risks = [risk(['a', 'b', 'c', 'd'])]))).toBe(false);
    expect(mutate((b) => (b.review_focus[0]!.reason = 'x'.repeat(161)))).toBe(false);
  });

  it('model output schemas', () => {
    const focus = { file: 'a.ts', line: 1, reason: 'r' };
    const base = { summary: 's', risks: [risk()], review_focus: [focus] };
    expect(BriefModelOutput.safeParse(base).success).toBe(true);
    expect(BriefModelOutput.safeParse({ ...base, summary: 'x'.repeat(601) }).success).toBe(false);
    expect(
      BriefModelOutput.safeParse({ ...base, review_focus: Array.from({ length: 13 }, () => focus) }).success,
    ).toBe(false);
    expect(
      BriefModelOutput.safeParse({ ...base, risks: Array.from({ length: 11 }, () => risk()) }).success,
    ).toBe(false);
    expect(
      BriefModelOutput.safeParse({ ...base, risks: [risk(['1', '2', '3', '4', '5'])] }).success,
    ).toBe(true);

    expect(BriefModelOutputCountsOnly.safeParse({ ...base, summary: 'x'.repeat(601) }).success).toBe(true);
    expect(
      BriefModelOutputCountsOnly.safeParse({ ...base, review_focus: Array.from({ length: 13 }, () => focus) })
        .success,
    ).toBe(false);
    expect(BriefModelOutputCountsOnly.safeParse({ ...base, risks: [risk([])] }).success).toBe(false);
  });

  it('keeps blast reason enum in parity and PrBriefResponse round-trips', () => {
    expect(BriefBlastReason.options).toEqual(BlastDegradedReason.options);
    const r = {
      pr_id: '00000000-0000-4000-8000-000000000000',
      brief: null,
      generating: false,
      stale: false,
      current_head_sha: 'abc',
    };
    expect(PrBriefResponse.parse(r)).toEqual(r);
  });
});
