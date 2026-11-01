import { describe, expect, it } from 'vitest';
import { cutText, isSecretFile } from './limits.js';

describe('isSecretFile', () => {
  it('flags secret-bearing files but not env templates', () => {
    for (const p of ['.env', '.env.local', 'a/.env.production', 'k.pem', 'a/b.key', 'id_rsa', 'secrets.yml', 'my-secret.json']) {
      expect(isSecretFile(p), p).toBe(true);
    }
    for (const p of ['.env.example', '.env.sample', '.env.template', 'src/app.ts', 'README.md']) {
      expect(isSecretFile(p), p).toBe(false);
    }
  });
});

describe('cutText', () => {
  it('cuts to cap-1 chars plus an ellipsis', () => {
    expect(cutText('abcdef', 4)).toBe('abc…');
    expect(cutText('abcd', 4)).toBe('abcd');
  });
});

describe('cutText: UTF-16 units', () => {
  it('counts UTF-16 length, so astral text never exceeds the cap', () => {
    const emoji = '😀'.repeat(10); // 10 code points, length 20
    const cut = cutText(emoji, 15);
    expect(cut.length).toBeLessThanOrEqual(15);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('never leaves a lone high surrogate', () => {
    const cut = cutText('a😀😀😀', 4); // cap-1 = 3 units would split the second emoji? 'a'+😀 = 3 units
    expect(cut).toBe('a😀…');
    const split = cutText('ab😀😀', 4); // 3 units ends on a high surrogate
    expect(split).toBe('ab…');
    expect(split).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it('returns text unchanged when UTF-16 length is within the cap', () => {
    expect(cutText('😀😀', 4)).toBe('😀😀');
  });
});
