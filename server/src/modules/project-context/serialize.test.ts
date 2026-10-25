import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import {
  contentHash,
  decodeUtf8Strict,
  estimateTokens,
  serializeBlock,
  skillSerializesAs,
  specEntry,
} from './serialize.js';
import { resolveEffective } from './effective.js';

describe('serialize', () => {
  it('estimates ceil(chars/4) (AC-30)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('puts the path header first inside the entry (AC-38)', () => {
    expect(specEntry('specs/a.md', '# A')).toBe('File: specs/a.md\n\n# A');
  });

  it('serializeBlock is exactly the "## Project context" section assemblePrompt renders (AC-31)', () => {
    const entries = [specEntry('specs/a.md', 'one </untrusted> two'), specEntry('docs/b.md', 'two')];
    const block = serializeBlock(entries);
    const assembled = assemblePrompt({
      system: 's',
      task: 't',
      diff: 'd',
      specs: entries,
    } as never);
    expect(assembled.messages[1]!.content).toContain(block);
    expect(block).toBe(`## Project context\n${assembled.assembly.specs}`);
    expect(block.split('## Project context').length).toBe(2);
    expect(block).not.toContain('one </untrusted> two');
    expect(serializeBlock([])).toBe('');
  });

  it('skillSerializesAs lists paths in order (AC-23)', () => {
    expect(skillSerializesAs(['specs/a.md', 'docs/b.md'])).toBe(
      '## Project context\n- specs/a.md\n- docs/b.md',
    );
    expect(skillSerializesAs([])).toBe('');
  });

  it('decodeUtf8Strict rejects NUL bytes and invalid UTF-8 (AC-44)', () => {
    expect(decodeUtf8Strict(new TextEncoder().encode('héllo ✓'))).toBe('héllo ✓');
    expect(decodeUtf8Strict(new Uint8Array([0x61, 0x00, 0x62]))).toBeNull();
    expect(decodeUtf8Strict(new Uint8Array([0xff, 0xfe, 0x41]))).toBeNull();
  });

  it('contentHash is stable sha256 hex', () => {
    const h = contentHash(new TextEncoder().encode('x'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash(new TextEncoder().encode('x'))).toBe(h);
  });
});

describe('BOM round-trip', () => {
  it('keeps a leading UTF-8 BOM so read -> save of unchanged content is byte-identical', () => {
    const raw = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('# A\n')]);
    const text = decodeUtf8Strict(raw);
    expect(text).toBe('\uFEFF# A\n');
    const saved = new TextEncoder().encode(text as string);
    expect(Array.from(saved)).toEqual(Array.from(raw));
    expect(contentHash(saved)).toBe(contentHash(raw));
  });
});

describe('resolveEffective (AC-34–36)', () => {
  const skill = (id: string, paths: string[], enabled = true) => ({
    skillId: id,
    skillName: `S-${id}`,
    enabled,
    paths,
  });

  it('agent first, then enabled skills in link order', () => {
    const out = resolveEffective(['a', 'b'], [skill('1', ['c']), skill('2', ['d'])]);
    expect(out.map((o) => o.path)).toEqual(['a', 'b', 'c', 'd']);
    expect(out[2]!.source).toEqual({ skill_id: '1', skill_name: 'S-1' });
  });

  it('dedupes keeping the first occurrence and its source', () => {
    const out = resolveEffective(['a'], [skill('1', ['b', 'a'])]);
    expect(out).toEqual([
      { path: 'a', source: 'agent' },
      { path: 'b', source: { skill_id: '1', skill_name: 'S-1' } },
    ]);
  });

  it('drops disabled skills', () => {
    expect(resolveEffective([], [skill('1', ['x'], false)])).toEqual([]);
  });
});
