import { ONBOARDING_LIMITS } from '@devdigest/shared';

export { ONBOARDING_LIMITS };

/** Input caps for the single LLM call (NFR-1). */
export const README_BYTES = 16 * 1024;
export const MAX_MANIFESTS = 10;
export const MANIFEST_BYTES = 32 * 1024;
export const MAX_COMPOSE_MAKE = 3;
export const COMPOSE_MAKE_BYTES = 16 * 1024;
export const MAX_RANKED = 200;
export const MAX_CHAINS = 30;
export const MAX_ENDPOINTS = 100;
export const MAX_INPUT_TOKENS = 20_000;

/** A run step matching any of these is dropped (EC-19). */
export const SECRET_COMMAND_PATTERNS: readonly RegExp[] = [
  /sk_live_/,
  /sk_test_/,
  /ghp_[A-Za-z0-9]/,
  /github_pat_/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN/,
  /xox[bpsa]-/,
];

const ENV_TEMPLATE_SUFFIX = /\.(example|sample|template)$/i;

/**
 * True when a repo path may hold secrets and must never be read into a prompt:
 * `.env`/`.env.*` (templates excepted), `*.pem`, `*.key`, `id_*`, `secrets.*`,
 * `*secret*`. Judged on the basename; case-insensitive.
 */
export function isSecretFile(path: string): boolean {
  const base = (path.split('/').pop() ?? path).toLowerCase();
  if (base === '.env' || base.startsWith('.env.')) return !ENV_TEMPLATE_SUFFIX.test(base);
  if (base.endsWith('.pem') || base.endsWith('.key')) return true;
  if (base.startsWith('id_')) return true;
  if (base.startsWith('secrets.') || base.includes('secret')) return true;
  return false;
}

/** The plan names this `SECRET_FILE_DENYLIST`; kept as an alias for T5. */
export const SECRET_FILE_DENYLIST = isSecretFile;

/**
 * Cut to `cap` UTF-16 code units (what Zod `.max()` counts): at most `cap - 1` units
 * plus an ellipsis. Never leaves a lone high surrogate from a split pair.
 */
export function cutText(text: string, cap: number): string {
  if (text.length <= cap) return text;
  let end = Math.max(cap - 1, 0);
  const last = text.charCodeAt(end - 1);
  if (end > 0 && last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}
