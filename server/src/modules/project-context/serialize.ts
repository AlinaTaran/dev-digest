import { createHash } from 'node:crypto';
import { wrapUntrusted } from '@devdigest/reviewer-core';

/** Same estimator as the client's `estimateTokenCount` and the server's `approxTokens`. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** AC-38: one `specs` entry — the path header goes INSIDE the untrusted block. */
export function specEntry(path: string, content: string): string {
  return `File: ${path}\n\n${content}`;
}

/**
 * The exact `## Project context` block `assemblePrompt` renders for these
 * `specs` entries (reviewer-core/src/prompt.ts). Empty input -> '' (no section).
 */
export function serializeBlock(entries: readonly string[]): string {
  if (entries.length === 0) return '';
  return `## Project context\n${entries.map((e, i) => wrapUntrusted(`spec-${i}`, e)).join('\n\n')}`;
}

/** AC-23: what a skill contributes — heading + one `- path` line per attached doc. */
export function skillSerializesAs(paths: readonly string[]): string {
  if (paths.length === 0) return '';
  return `## Project context\n${paths.map((p) => `- ${p}`).join('\n')}`;
}

/** Strict UTF-8 decode (a leading BOM is preserved so save round-trips byte-identically); `null` for invalid UTF-8 or any NUL byte (unreadable as text). */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
