import { describe, expect, it } from 'vitest';
import { PrBrief, type PrBriefMeta } from '@devdigest/shared';
import { modelSchemaFor, toDraft } from './model-schema.js';

const meta: PrBriefMeta = {
  head_sha: 'abc',
  generated_at: '2026-01-01T00:00:00.000Z',
  model: { provider: 'openrouter', model: 'm' },
  missing_inputs: [],
  blast_reason: null,
  input_truncated: [],
  input_tokens_est: 0,
  specs_used: [],
  specs_skipped: [],
  tokens_in: 0,
  tokens_out: 0,
  cost_usd: null,
  dropped_refs: 0,
  adjusted_lines: 0,
};

const long = {
  summary: 's'.repeat(900),
  risks: [
    {
      kind: 'security',
      title: 't'.repeat(81),
      explanation: 'e',
      severity: 'high' as const,
      file_refs: ['a.ts:1'],
    },
  ],
  review_focus: [{ file: 'a.ts', line: 1, reason: 'r'.repeat(161) }],
};

describe('model schema modes', () => {
  it('counts-only: cuts string caps in code and the assembled brief passes PrBrief.parse', () => {
    const d = toDraft(long, 'counts-only');
    expect([d.summary.length, d.risks[0]!.title.length, d.review_focus[0]!.reason.length]).toEqual([600, 80, 160]);
    const brief = PrBrief.parse({
      summary: d.summary,
      risks: { risks: d.risks },
      review_focus: d.review_focus.map((f) => ({ ...f, line_adjusted: false })),
      intent: null,
      blast: null,
      history: null,
      meta,
    });
    expect(brief.summary).toHaveLength(600);
  });

  it('schema-caps: the same input fails the defensive parse (invalid_output)', () => {
    expect(() => toDraft(long, 'schema-caps')).toThrow();
    expect(modelSchemaFor('schema-caps').safeParse(long).success).toBe(false);
    expect(modelSchemaFor('counts-only').safeParse(long).success).toBe(true);
  });
});
