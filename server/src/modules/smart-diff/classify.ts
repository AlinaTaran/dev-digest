import type { SmartDiffRole } from '@devdigest/shared';
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS } from './constants.js';

/**
 * Pure file-path classifier — no I/O, no LLM. Boilerplate is checked before
 * wiring (e.g. `package.json` must land in boilerplate, not be mistaken for
 * wiring); anything unmatched is `core`.
 */
export function classifyFile(path: string): SmartDiffRole {
  if (BOILERPLATE_PATTERNS.some((re) => re.test(path))) return 'boilerplate';
  if (WIRING_PATTERNS.some((re) => re.test(path))) return 'wiring';
  return 'core';
}
