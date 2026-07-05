import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractSkillCore } from '../src/modules/skills/helpers.js';
import { MAX_ZIP_ENTRIES, MAX_SKILL_FILE_BYTES } from '../src/modules/skills/constants.js';

/**
 * Unit coverage for `extractSkillCore` — pure, no I/O, no DB. Covers a plain
 * `.md` file (frontmatter + fallback), a `.zip` with `SKILL.md` plus an
 * ignored script, and a `.zip` with no `SKILL.md` falling back to the first
 * `*.md` entry.
 */

describe('extractSkillCore', () => {
  it('parses a plain .md with frontmatter', () => {
    const md = [
      '---',
      'name: Branch Coverage Gate',
      'description: Flag untested branches.',
      'type: rubric',
      '---',
      '',
      '# Branch Coverage Gate',
      '',
      'Every new conditional needs a test for both branches.',
    ].join('\n');

    const core = extractSkillCore('branch-coverage-gate.md', Buffer.from(md, 'utf-8'));

    expect(core.name).toBe('Branch Coverage Gate');
    expect(core.description).toBe('Flag untested branches.');
    expect(core.type).toBe('rubric');
    expect(core.body).not.toContain('---');
    expect(core.body).toContain('Every new conditional needs a test for both branches.');
    expect(core.ignored).toEqual([]);
  });

  it('falls back to the first heading + paragraph when there is no frontmatter', () => {
    const md = [
      '# Mock Overuse Gate',
      '',
      'Flag tests that mock everything instead of exercising real logic.',
      '',
      'More detail below.',
    ].join('\n');

    const core = extractSkillCore('mock-overuse-gate.md', Buffer.from(md, 'utf-8'));

    expect(core.name).toBe('Mock Overuse Gate');
    expect(core.description).toBe(
      'Flag tests that mock everything instead of exercising real logic.',
    );
    expect(core.type).toBe('custom'); // no frontmatter type -> defaults custom
    expect(core.ignored).toEqual([]);
  });

  it('reads SKILL.md from a .zip and reports every other entry as ignored', () => {
    const skillMd = [
      '---',
      'name: Corner Case Checklist',
      'description: Checklist for edge cases.',
      'type: convention',
      '---',
      '',
      'Body text.',
    ].join('\n');

    const zip = zipSync({
      'SKILL.md': strToU8(skillMd),
      'scripts/run.sh': strToU8('#!/bin/sh\necho hi\n'),
    });

    const core = extractSkillCore('skill-package.zip', Buffer.from(zip));

    expect(core.name).toBe('Corner Case Checklist');
    expect(core.description).toBe('Checklist for edge cases.');
    expect(core.type).toBe('convention');
    expect(core.body).toContain('Body text.');
    expect(core.ignored).toEqual(['scripts/run.sh']);
  });

  it('falls back to the first *.md entry when there is no SKILL.md', () => {
    const notesMd = '# Fallback Skill\n\nDescription paragraph.\n';

    const zip = zipSync({
      'README.txt': strToU8('not markdown'),
      'docs/notes.md': strToU8(notesMd),
      'scripts/run.sh': strToU8('#!/bin/sh\necho hi\n'),
    });

    const core = extractSkillCore('bundle.zip', Buffer.from(zip));

    expect(core.name).toBe('Fallback Skill');
    expect(core.description).toBe('Description paragraph.');
    expect(core.ignored.sort()).toEqual(['README.txt', 'scripts/run.sh'].sort());
  });

  it('never executes any zip entry — script contents are only ever read as ignored path strings', () => {
    const skillMd = '# Safe\n\nSafe body.\n';
    const zip = zipSync({
      'SKILL.md': strToU8(skillMd),
      'scripts/run.sh': strToU8('rm -rf / #dangerous'),
    });

    const core = extractSkillCore('bundle.zip', Buffer.from(zip));

    expect(core.ignored).toContain('scripts/run.sh');
    expect(core.body).not.toContain('rm -rf');
  });
});

describe('extractSkillCore — zip safety caps (decompression-bomb defense)', () => {
  it('rejects a .zip declaring too many entries', () => {
    const files: Record<string, Uint8Array> = { 'SKILL.md': strToU8('# T\n\nBody.\n') };
    for (let i = 0; i < MAX_ZIP_ENTRIES + 1; i++) files[`f${i}.txt`] = strToU8('x');
    const zip = zipSync(files);

    expect(() => extractSkillCore('too-many.zip', Buffer.from(zip))).toThrow(/too many entries/i);
  });

  it('rejects a .zip whose target markdown inflates past the size cap (zip bomb)', () => {
    // Highly compressible: tiny compressed, huge declared uncompressed size.
    const huge = 'a'.repeat(MAX_SKILL_FILE_BYTES + 1);
    const zip = zipSync({ 'SKILL.md': strToU8(`# Big\n\n${huge}`) });

    expect(() => extractSkillCore('bomb.zip', Buffer.from(zip))).toThrow(/too large/i);
  });

  it('still accepts a normal small .zip (cap is not over-eager)', () => {
    const zip = zipSync({ 'SKILL.md': strToU8('# Fine\n\nSmall body.\n') });
    const core = extractSkillCore('ok.zip', Buffer.from(zip));
    expect(core.name).toBe('Fine');
    expect(core.body).toContain('Small body.');
  });
});
