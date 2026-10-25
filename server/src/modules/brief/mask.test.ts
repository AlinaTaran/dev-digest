import { describe, expect, it } from 'vitest';
import { maskBrief, maskSecrets } from './mask.js';

describe('mask', () => {
  it('masks one sample per pattern', () => {
    const samples = [
      'sk_' + 'live_' + 'abc123XYZ',
      'sk_' + 'test_' + 'abc123XYZ',
      'gh' + 'p_' + 'a'.repeat(24),
      'github' + '_pat_' + 'a'.repeat(24),
      'AK' + 'IA' + 'ABCDEFGHIJKLMNOP',
      '-----BEGIN RSA PRIVATE ' + 'KEY-----\nMIIB\n-----END RSA PRIVATE ' + 'KEY-----',
      'xo' + 'xb-123-abc',
    ];
    for (const s of samples) expect(maskSecrets(`leak ${s} end`)).toBe('leak *** end');
    expect(maskSecrets('plain text')).toBe('plain text');
  });

  it('masks text fields but never paths', () => {
    const key = 'sk_' + 'live_' + 'abc';
    const out = maskBrief({
      summary: key,
      risks: [{ kind: 'k', title: key, explanation: key, severity: 'low', file_refs: [`src/${key}.ts`] }],
      review_focus: [{ file: `src/${key}.ts`, line: 1, reason: key }],
    });
    expect(out.summary).toBe('***');
    expect(out.risks[0]!.title).toBe('***');
    expect(out.risks[0]!.file_refs[0]).toContain(key);
    expect(out.review_focus[0]!.file).toContain(key);
    expect(out.review_focus[0]!.reason).toBe('***');
  });
});
