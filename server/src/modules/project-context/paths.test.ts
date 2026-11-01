import { describe, it, expect } from 'vitest';
import { DEFAULT_PROJECT_CONTEXT_GLOBS } from '@devdigest/shared';
import { docType, validateContextPath, validateGlobs } from './paths.js';

const G = DEFAULT_PROJECT_CONTEXT_GLOBS;

describe('docType (AC-4)', () => {
  it('derives the type from the first typed directory segment', () => {
    expect(docType('specs/api.md')).toBe('specs');
    expect(docType('server/docs/a.md')).toBe('docs');
    expect(docType('a/insights/b.md')).toBe('insights');
    expect(docType('x/notes/y.md')).toBe('other');
    expect(docType('specs.md')).toBe('other');
  });
});

describe('validateContextPath (AC-26)', () => {
  it('accepts glob-matching .md paths at any depth', () => {
    for (const p of ['specs/a.md', 'docs/x/b.md', 'insights/c.md', 'server/docs/d.md']) {
      expect(validateContextPath(p, G)).toBeNull();
    }
  });

  it('rejects every unsafe or non-matching variant', () => {
    const bad = [
      '',
      '/specs/a.md',
      'C:/specs/a.md',
      'specs\\a.md',
      'specs/../secret.md',
      '../specs/a.md',
      'specs/a.txt',
      'src/d.md',
      'specs/a\u0000.md',
      'specs//a.md',
      'specs/./a.md',
      `specs/${'a'.repeat(520)}.md`,
    ];
    for (const p of bad) expect(validateContextPath(p, G), JSON.stringify(p)).not.toBeNull();
  });

  it('follows custom globs', () => {
    expect(validateContextPath('adr/1.md', ['**/adr/**/*.md'])).toBeNull();
    expect(validateContextPath('specs/a.md', ['**/adr/**/*.md'])).not.toBeNull();
  });
});

describe('validateGlobs (AC-13)', () => {
  it('accepts a sane list and rejects empty/absolute/..-escaping/oversized lists', () => {
    expect(validateGlobs(['**/adr/**/*.md'])).toBeNull();
    expect(validateGlobs([])).not.toBeNull();
    expect(validateGlobs(['/etc/*.md'])).not.toBeNull();
    expect(validateGlobs(['../x/*.md'])).not.toBeNull();
    expect(validateGlobs(['a/../b/*.md'])).not.toBeNull();
    expect(validateGlobs([''])).not.toBeNull();
    expect(validateGlobs(['a'.repeat(201)])).not.toBeNull();
    expect(validateGlobs(['**/{specs,docs,insights}/**/*.md'])).toBeNull();
    expect(validateGlobs(['{1..1000}{1..1000}/*.md'])).not.toBeNull();
    expect(validateGlobs(['{a..z}/*.md'])).not.toBeNull();
    expect(validateGlobs(['{a,b}{c,d}{e,f}{g,h}/*.md'])).not.toBeNull();
    expect(validateGlobs(['{a,b,c,d,e,f,g,h,i,j,k,l,m,n}/*.md'])).not.toBeNull();
    expect(validateGlobs(Array.from({ length: 11 }, (_, i) => `d${i}/*.md`))).not.toBeNull();
  });
});

describe('validateGlobs nested braces (M3)', () => {
  it('rejects nested brace groups that bypass the alternatives cap', () => {
    const alts = Array.from({ length: 70 }, (_, i) => `a${i}`).join(',');
    const more = Array.from({ length: 11 }, (_, i) => `b${i}`).join(',');
    expect(validateGlobs([`{${alts},{q}}{${more}}*.md`])).not.toBeNull();
    expect(validateGlobs(['{a,{b,c}}/*.md'])).not.toBeNull();
  });

  it('still accepts the default glob and common flat globs', () => {
    expect(validateGlobs(['**/{specs,docs,insights}/**/*.md'])).toBeNull();
    expect(validateGlobs(['docs/**/*.md', '{adr,rfc}/*.md', 'README.md'])).toBeNull();
    expect(validateGlobs(['{a,b}/{c,d}/*.md'])).toBeNull();
  });
});
