import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ExternalServiceError } from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';
import { briefFailed, briefUnavailable, classifyLlmError } from './errors.js';

describe('classifyLlmError', () => {
  it('maps timeouts, schema failures and everything else', () => {
    expect(classifyLlmError(new TimeoutError(10))).toBe('timeout');
    expect(classifyLlmError(new ExternalServiceError('openai call failed schema validation'))).toBe('invalid_output');
    expect(classifyLlmError(new Error('OpenRouter response failed schema validation after repair'))).toBe('invalid_output');
    const zerr = z.object({ a: z.string() }).safeParse({}).error;
    expect(classifyLlmError(zerr)).toBe('invalid_output');
    expect(classifyLlmError(new Error('boom'))).toBe('llm_failed');
    expect(classifyLlmError(undefined)).toBe('llm_failed');
  });
});

describe('error envelopes', () => {
  it('uses 409 brief_unavailable and 502 brief_generation_failed with details.reason', () => {
    const u = briefUnavailable('llm_not_configured');
    expect([u.code, u.statusCode, u.details]).toEqual(['brief_unavailable', 409, { reason: 'llm_not_configured' }]);
    const f = briefFailed('timeout');
    expect([f.code, f.statusCode, f.details]).toEqual(['brief_generation_failed', 502, { reason: 'timeout' }]);
  });
});
