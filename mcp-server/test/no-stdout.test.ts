import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

// stdout carries JSON-RPC only; any other write corrupts the protocol stream.
const FORBIDDEN = /console\.(log|info|debug)\b|process\.stdout\.write/;

describe('stdout hygiene', () => {
  it('src/ never writes to stdout', () => {
    const offenders = sourceFiles(join(__dirname, '..', 'src')).filter((f) =>
      FORBIDDEN.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
