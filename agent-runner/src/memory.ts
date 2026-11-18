import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Load the exported memory rules from `<devdigestDir>/memory.jsonl` (one JSON
 * object per line, `content` is the rule text). Unlike skills, memory is
 * optional context, so this is forgiving: a missing/unreadable file is `[]`
 * (normal — the studio exports an empty file when there is no memory) and a
 * malformed or content-less line is skipped, never thrown.
 */
export function loadMemory(devdigestDir: string, readFile: typeof readFileSync = readFileSync): string[] {
  let raw: string;
  try {
    raw = readFile(path.join(devdigestDir, 'memory.jsonl'), 'utf8') as unknown as string;
  } catch {
    return [];
  }

  const rules: string[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const content = (JSON.parse(trimmed) as { content?: unknown } | null)?.content;
      if (typeof content === 'string' && content.trim()) rules.push(content);
    } catch {
      // skip a broken line, keep the rest
    }
  }
  return rules;
}
