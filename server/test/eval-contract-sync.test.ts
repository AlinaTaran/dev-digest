import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { EvalExpectations, EvalExpectation } from '@devdigest/shared';

/** NFR-8: the client's vendored eval contracts must stay byte-identical to the server's. */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));

describe('eval contract sync', () => {
  it('eval.ts is identical in server and client', () => {
    const server = read('../src/vendor/shared/contracts/eval.ts');
    const client = read('../../client/src/vendor/shared/contracts/eval.ts');
    expect(client.equals(server)).toBe(true);
  });
});

describe('EvalExpectation', () => {
  it('rejects an unknown expect value at path [0].expect', () => {
    const r = EvalExpectations.safeParse([{ expect: 'maybe', file: 'a.ts', start_line: 1 }]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual([0, 'expect']);
  });

  it('accepts a missing end_line and rejects unknown keys', () => {
    expect(EvalExpectation.safeParse({ expect: 'must_find', file: 'a.ts', start_line: 3 }).success).toBe(true);
    expect(
      EvalExpectation.safeParse({ expect: 'must_find', file: 'a.ts', start_line: 3, extra: 1 }).success,
    ).toBe(false);
  });
});
