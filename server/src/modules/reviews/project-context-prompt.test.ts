import { describe, it, expect } from 'vitest';
import {
  PROJECT_CONTEXT_TASK_SENTENCE,
  formatResolveLog,
  withProjectContextSentence,
} from './project-context-prompt.js';

describe('project-context-prompt', () => {
  it('appends the sentence only when docs were injected', () => {
    expect(withProjectContextSentence('task', false)).toBe('task');
    expect(withProjectContextSentence('task', true)).toBe(`task\n\n${PROJECT_CONTEXT_TASK_SENTENCE}`);
  });

  it('formats the resolve log line', () => {
    expect(
      formatResolveLog({ included: 2, tokens: 317, missing: 1, cloneSha: 'abc1234def' }),
    ).toBe('project context: 2 docs, ≈317 tokens, 1 missing (clone abc1234)');
    expect(formatResolveLog({ included: 1, tokens: 5, missing: 0, cloneSha: null, mode: 'map-reduce' })).toBe(
      'project context: 1 doc, ≈5 tokens (clone unknown, map-reduce)',
    );
  });
});
