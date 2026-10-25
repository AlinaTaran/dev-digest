import { PATH_MAX_CHARS } from './limits.js';

/** Trim and strip leading `./` and `/` repeatedly. Nothing else (case and `a/` `b/` stay). */
export function normalizeModelPath(p: string): string {
  let s = p.trim();
  for (;;) {
    if (s.startsWith('./')) s = s.slice(2);
    else if (s.startsWith('/')) s = s.slice(1);
    else break;
  }
  return s;
}

/** Rejects empty, over-long and control-character paths (untrusted repo input). */
export function isSafeFactPath(p: string): boolean {
  if (p.length === 0 || p.length > PATH_MAX_CHARS) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f]/.test(p);
}

export interface ParsedRef {
  path: string;
  start?: number;
  end?: number;
}

/** `path[:N[-M]]`; only the trailing numeric suffix is parsed so colons in paths survive. */
export function parseRef(ref: string): ParsedRef {
  const m = /:(\d+)(?:-(\d+))?$/.exec(ref);
  if (!m) return { path: ref };
  const start = Number(m[1]);
  const end = m[2] === undefined ? undefined : Number(m[2]);
  return {
    path: ref.slice(0, m.index),
    start,
    ...(end === undefined ? {} : { end: end < start ? start : end }),
  };
}
