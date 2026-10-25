import type { OnboardingRunLocallySection } from '@devdigest/shared';
import { ONBOARDING_LIMITS, SECRET_COMMAND_PATTERNS, cutText } from './limits.js';
import { normalizeRepoPath, type PathIndex } from './paths.js';

export type RunStep = OnboardingRunLocallySection['steps'][number];

export interface CommandContext {
  /** Tracked tree at `source_sha`; `null` when `git ls-tree` failed. */
  tracked: PathIndex | null;
  /** Fallback existence set (key files actually read) used when `tracked` is null. */
  readable: Set<string>;
  /** `package.json` scripts by directory ('' = repo root). */
  manifests: Map<string, Set<string>>;
  /** Makefile targets by directory ('' = repo root). */
  makefiles: Map<string, Set<string>>;
}

/** `scripts` of a package.json; `null` when the JSON is invalid or has no plain `scripts` object. */
export function parsePackageScripts(json: string): Set<string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const scripts = (parsed as Record<string, unknown>).scripts;
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return null;
  return new Set(Object.keys(scripts));
}

/** Targets declared at the start of a line (`name:` but not `name:=`); `.PHONY` and friends skipped. */
export function parseMakeTargets(text: string): Set<string> {
  const targets = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_.-]+)\s*:(?!=)/.exec(line);
    if (m && m[1] && !m[1].startsWith('.')) targets.add(m[1]);
  }
  return targets;
}

/** Package-manager sub-commands that run no project script; kept without a lookup. */
const PM_BUILTINS = new Set([
  'install', 'i', 'ci', 'add', 'exec', 'dlx', 'x', 'create', 'init', 'rebuild', 'remove',
  'update', 'up', 'link', 'audit', 'prune', 'dedupe', 'store', 'env', 'setup', 'help',
  'config', 'cache', 'list', 'ls', 'why', 'outdated', 'rm', 'uninstall', 'run-script',
]);
const NPM_LIFECYCLE_ALIASES = new Set(['start', 'test', 'stop', 'restart']);
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=\S*$/;
/** Shell control/substitution/redirect syntax. `&&` is the only operator a step may use. */
const SHELL_META = /[;|&`<>]|\$\(/;
/** Heads that delete, escalate, download, or run arbitrary scripts — never a "run locally" step. */
const DENIED_HEADS = new Set([
  'rm', 'sudo', 'su', 'doas', 'curl', 'wget', 'sh', 'bash', 'zsh', 'fish', 'eval', 'exec',
  'source', '.', 'chmod', 'chown', 'dd', 'mkfs', 'kill', 'pkill',
]);

type Verdict = 'keep' | 'drop';

function dirHasFiles(dir: string, ctx: CommandContext): boolean {
  if (dir === '') return true;
  if (ctx.tracked) return ctx.tracked.hasDir(dir);
  for (const p of ctx.readable) if (p.startsWith(`${dir}/`)) return true;
  return false;
}

function scriptDeclared(name: string, dir: string, ctx: CommandContext): Verdict {
  return ctx.manifests.get(dir)?.has(name) ? 'keep' : 'drop';
}

function checkPackageManager(tokens: string[], dir: string, ctx: CommandContext): Verdict {
  const pm = tokens[0];
  const sub = tokens[1];
  if (sub === undefined) return 'keep'; // bare `yarn` / `npm`
  if (sub.startsWith('-')) return 'keep'; // `pnpm -r …`, `--version`, `--filter …`
  if (sub === 'run' || sub === 'run-script') {
    const name = tokens.slice(2).find((t) => !t.startsWith('-'));
    return name === undefined ? 'keep' : scriptDeclared(name, dir, ctx);
  }
  if (PM_BUILTINS.has(sub)) return 'keep';
  if (pm === 'npm') {
    return NPM_LIFECYCLE_ALIASES.has(sub) ? scriptDeclared(sub, dir, ctx) : 'keep';
  }
  if (pm === 'bun') return 'keep'; // `bun <file>` / `bun x` — only `bun run x` is a script
  return scriptDeclared(sub, dir, ctx); // `pnpm dev`, `yarn build`
}

function checkMake(tokens: string[], dir: string, ctx: CommandContext): Verdict {
  const args = tokens.slice(1);
  if (args.some((t) => t === '-C' || t === '-f' || t === '--directory' || t === '--file')) {
    return 'keep'; // custom makefile/dir: cannot be resolved here
  }
  const target = args.find((t) => !t.startsWith('-') && !t.includes('='));
  if (target === undefined) return 'keep';
  return ctx.makefiles.get(dir)?.has(target) ? 'keep' : 'drop';
}

function checkCommand(command: string, ctx: CommandContext): Verdict {
  // The command reaches the UI as copy-and-run text, so a prompt-injected
  // `pnpm install; curl … | sh` must not survive just because its head is declared.
  if (SHELL_META.test(command.split('&&').join(' '))) return 'drop';
  let dir = '';
  for (const segment of command.split('&&')) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    while (tokens[0] && ENV_ASSIGN.test(tokens[0])) tokens.shift();
    const head = tokens[0];
    if (head === undefined || DENIED_HEADS.has(head)) return 'drop';
    if (head === 'cd') {
      const target = tokens[1] === undefined ? null : normalizeRepoPath(tokens[1]);
      if (target === null || tokens.length !== 2) return 'drop';
      const next = dir === '' ? target : `${dir}/${target}`;
      if (!dirHasFiles(next, ctx)) return 'drop';
      dir = next;
      continue;
    }
    let verdict: Verdict = 'keep';
    if (head === 'npm' || head === 'pnpm' || head === 'yarn' || head === 'bun') {
      verdict = checkPackageManager(tokens, dir, ctx);
    } else if (head === 'make') {
      verdict = checkMake(tokens, dir, ctx);
    }
    if (verdict === 'drop') return 'drop';
  }
  return 'keep';
}

/**
 * Ground one model-proposed run step (AC-34, EC-19). Kept only when the command
 * is a single short line with no secret, no shell operator other than `&&`, no
 * destructive/download head, `source_path` exists, and any package script /
 * make target it invokes is declared in the right manifest/Makefile.
 */
export function groundRunStep(
  step: { command: string; source_path: string; note: string | null },
  ctx: CommandContext,
): RunStep | null {
  const command = step.command.trim();
  if (command.length === 0 || command.length > ONBOARDING_LIMITS.commandChars) return null;
  if (/[\r\n]/.test(command)) return null;
  if (SECRET_COMMAND_PATTERNS.some((re) => re.test(command))) return null;

  const sourcePath = normalizeRepoPath(step.source_path);
  if (sourcePath === null) return null;
  const exists = ctx.tracked ? ctx.tracked.hasFile(sourcePath) : ctx.readable.has(sourcePath);
  if (!exists) return null;

  if (checkCommand(command, ctx) === 'drop') return null;

  return {
    command,
    source_path: sourcePath,
    note: step.note === null ? null : cutText(step.note.trim(), ONBOARDING_LIMITS.noteChars),
  };
}
