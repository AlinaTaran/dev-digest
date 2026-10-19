import { describe, it, expect } from 'vitest';
import { cleanTitle, firstLine, parsePrNumber } from './parse.js';

describe('parsePrNumber', () => {
  it('parses merge-commit and squash subjects, ignores bare mentions', () => {
    expect(parsePrNumber('Merge pull request #12 from x/y')).toBe(12);
    expect(parsePrNumber('feat: z (#34)')).toBe(34);
    expect(parsePrNumber('fix #5 in text')).toBeNull();
  });
});

describe('cleanTitle', () => {
  it('strips the (#N) suffix', () => {
    expect(cleanTitle('feat: z (#34)')).toBe('feat: z');
    expect(cleanTitle('plain')).toBe('plain');
  });
});

describe('firstLine', () => {
  it('handles empty, multiline and capped bodies', () => {
    expect(firstLine(null, 200)).toBe('');
    expect(firstLine('  \n\n', 200)).toBe('');
    expect(firstLine('\n  first line  \nsecond', 200)).toBe('first line');
    const capped = firstLine('abcdefghij', 5);
    expect(capped).toBe('abcd…');
    expect(capped.length).toBe(5);
  });
});
