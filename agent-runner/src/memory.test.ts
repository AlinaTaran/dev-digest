import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadMemory } from './memory.js';

describe('loadMemory', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-memory-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns [] when memory.jsonl does not exist', () => {
    expect(loadMemory(dir)).toEqual([]);
  });

  it('returns [] for the empty file the studio exports when there is no memory', () => {
    writeFileSync(path.join(dir, 'memory.jsonl'), '');
    expect(loadMemory(dir)).toEqual([]);
  });

  it('keeps each rule\'s content in order and skips broken, blank and content-less lines', () => {
    writeFileSync(
      path.join(dir, 'memory.jsonl'),
      [
        JSON.stringify({ kind: 'fact', scope: 'global', content: 'uses pnpm' }),
        '',
        '{not json',
        JSON.stringify({ kind: 'fact', scope: 'global' }),
        JSON.stringify({ content: '   ' }),
        JSON.stringify({ content: 42 }),
        'null',
        JSON.stringify({ content: 'no default exports' }),
      ].join('\n'),
    );
    expect(loadMemory(dir)).toEqual(['uses pnpm', 'no default exports']);
  });
});
