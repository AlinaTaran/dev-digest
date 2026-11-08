import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { EvalExpectation, Finding } from '@devdigest/shared';
import { scoreCase } from './scoring.js';
import { aggregateRun } from './aggregate.js';

const dir = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'));

const FORBIDDEN =
  /from\s+['"](?:drizzle-orm[^'"]*|fastify[^'"]*|node:(?!url)[^'"]*|fs|path|http|https|net|@anthropic-ai[^'"]*|openai|[^'"]*\/adapters\/[^'"]*|[^'"]*\/adapters(?:\/index)?(?:\.js)?|[^'"]*platform\/[^'"]*|[^'"]*\/db\/[^'"]*|@devdigest\/reviewer-core[^'"]*)['"]/;

describe('core purity (AC-33, NFR-9)', () => {
  it('imports no I/O, DB, adapter, container or LLM module', () => {
    expect(sources.length).toBeGreaterThan(5);
    for (const name of sources) {
      const text = readFileSync(join(dir, name), 'utf8');
      const imports = text.split('\n').filter((l) => /^(import|export)\s.*from\s/.test(l));
      for (const line of imports) expect(line, `${name}: ${line}`).not.toMatch(FORBIDDEN);
    }
  });

  it('scoring is deterministic and never touches an LLM stub', () => {
    let calls = 0;
    const ctx = {
      llm: {
        completeStructured: () => {
          calls++;
          throw new Error('LLM must not be called');
        },
      },
    };
    void ctx; // available to the scope, intentionally never passed: scoring takes no provider
    const finding = {
      id: 'x', severity: 'CRITICAL', category: 'security', title: 't', file: 'a.ts',
      start_line: 1, end_line: 2, rationale: 'r', confidence: 1,
    } as Finding;
    const exps: EvalExpectation[] = [{ expect: 'must_find', file: 'a.ts', start_line: 2 }];
    const input = { expectations: exps, kept: [finding], dropped: [] };
    const a = scoreCase(input);
    const b = scoreCase(input);
    expect(a).toEqual(b);
    const r = { name: 'n', pass: a.pass, error: null, counts: a.counts, cost_usd: 0 };
    expect(aggregateRun([r], 5)).toEqual(aggregateRun([r], 5));
    expect(calls).toBe(0);
  });
});
