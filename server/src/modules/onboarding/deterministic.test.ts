import { describe, expect, it } from 'vitest';
import { buildDeterministicSections } from './deterministic.js';

describe('buildDeterministicSections', () => {
  it('derives the exact no-LLM shape (AC-49)', () => {
    const s = buildDeterministicSections({
      indexedFiles: ['src/a.ts', 'src/b.ts', 'lib/c.ts', 'root.ts'],
      topRanked: ['src/a.ts', 'lib/c.ts'],
      chains: [['src/a.ts', 'src/b.ts'], ['src/b.ts', 'lib/c.ts']],
      fanIn: new Map([['src/a.ts', 3]]),
      rootPackageJson: JSON.stringify({ scripts: { dev: 'tsx watch\nsrc/a.ts', 'bad name': 'x', build: 'k'.repeat(200) } }),
      lockfiles: ['pnpm-lock.yaml'],
    });
    expect(s).toEqual([
      { kind: 'architecture', empty_reason: null, summary_md: null, top_dirs: [{ path: 'src', files: 2 }, { path: 'lib', files: 1 }], diagram: null },
      { kind: 'critical_paths', empty_reason: null, items: [{ path: 'src/a.ts', why: null, fan_in: 3 }, { path: 'lib/c.ts', why: null, fan_in: 0 }] },
      {
        kind: 'run_locally',
        empty_reason: null,
        steps: [
          { command: 'pnpm run dev', source_path: 'package.json', note: 'dev → tsx watch src/a.ts' },
          { command: 'pnpm run build', source_path: 'package.json', note: expect.stringMatching(/^build → k+…$/) },
        ],
      },
      {
        kind: 'reading_path',
        empty_reason: null,
        steps: [
          { path: 'src/a.ts', why: 'Step 1 of the dependency chain from src/a.ts' },
          { path: 'src/b.ts', why: 'Step 2 of the dependency chain from src/a.ts' },
          { path: 'lib/c.ts', why: 'Step 2 of the dependency chain from src/b.ts' },
        ],
      },
      { kind: 'first_tasks', empty_reason: 'needs_llm', tasks: [] },
    ]);
  });

  it('handles absent facts and picks the package manager from the lockfile', () => {
    const s = buildDeterministicSections({ indexedFiles: [], topRanked: [], chains: [], fanIn: new Map(), rootPackageJson: '{bad', lockfiles: [] });
    expect(s.map((x) => x.empty_reason)).toEqual(['no_data', 'no_data', 'no_data', 'no_data', 'needs_llm']);
    const y = buildDeterministicSections({ indexedFiles: [], topRanked: [], chains: [], fanIn: new Map(), rootPackageJson: '{"scripts":{"a":"b"}}', lockfiles: ['server/pnpm-lock.yaml', 'yarn.lock'] });
    expect(y[2].kind === 'run_locally' && y[2].steps[0]?.command).toBe('yarn run a');
  });
});
