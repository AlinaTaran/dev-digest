import { describe, expect, it } from 'vitest';
import { isSafeFactPath, normalizeModelPath, parseRef } from './paths.js';

describe('paths', () => {
  it('normalizes only leading ./ and /', () => {
    expect(normalizeModelPath(' ././/src/a.ts ')).toBe('src/a.ts');
    expect(normalizeModelPath('Src/Config.ts')).toBe('Src/Config.ts');
    expect(normalizeModelPath('a/src/x.ts')).toBe('a/src/x.ts');
  });
  it('rejects unsafe fact paths', () => {
    expect(isSafeFactPath('src/a.ts')).toBe(true);
    expect(isSafeFactPath('')).toBe(false);
    expect(isSafeFactPath('a'.repeat(513))).toBe(false);
    expect(isSafeFactPath('a\u0000b')).toBe(false);
    expect(isSafeFactPath('a\nb')).toBe(false);
  });
  it('parses refs and keeps colons inside paths', () => {
    expect(parseRef('src/a.ts')).toEqual({ path: 'src/a.ts' });
    expect(parseRef('src/a.ts:12')).toEqual({ path: 'src/a.ts', start: 12 });
    expect(parseRef('src/a.ts:12-18')).toEqual({ path: 'src/a.ts', start: 12, end: 18 });
    expect(parseRef('src/a.ts:18-12')).toEqual({ path: 'src/a.ts', start: 18, end: 18 });
    expect(parseRef('a:b/c.ts:5')).toEqual({ path: 'a:b/c.ts', start: 5 });
  });
});
