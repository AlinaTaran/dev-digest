import { describe, expect, it } from 'vitest';
import { PathIndex, normalizeRepoPath } from './paths.js';

describe('normalizeRepoPath', () => {
  it('normalises valid paths and rejects unsafe ones', () => {
    expect(normalizeRepoPath(' ./src/app.ts ')).toBe('src/app.ts');
    expect(normalizeRepoPath('src//a/./b.ts')).toBe('src/a/b.ts');
    expect(normalizeRepoPath('src/')).toBe('src');
    expect(normalizeRepoPath('src/Привіт.ts')).toBe('src/Привіт.ts'); // EC-21
    for (const bad of ['/etc/passwd', '../x', 'a/../../x', 'a\\b', 'a\0b', '', '.', 'C:/x']) {
      expect(normalizeRepoPath(bad)).toBeNull();
    }
    expect(normalizeRepoPath('a'.repeat(513))).toBeNull(); // EC-20
  });
});

describe('PathIndex', () => {
  const idx = new PathIndex(['src/api/public/index.ts', 'src/app.ts', 'README.md']);
  it('classifies files and dirs and matches refs exactly', () => {
    expect(idx.classify('src/app.ts')).toBe('file');
    expect(idx.classify('src/api')).toBe('dir');
    expect(idx.hasDir('src/api/')).toBe(true);
    expect(idx.classify('src/App.ts')).toBeNull(); // case-sensitive (EC-9)
    expect(idx.matchesRef('src/api/')).toBe(true);
    expect(idx.matchesRef('src/api/*')).toBe(true); // AC-18
    expect(idx.matchesRef('src/api/**')).toBe(true);
    expect(idx.matchesRef('src/*.ts')).toBe(true);
    expect(idx.matchesRef('src/nope/*')).toBe(false);
    expect(idx.matchesRef('src/{api,x}/*')).toBe(false);
    expect(idx.matchesRef('../src/app.ts')).toBe(false);
  });
});
