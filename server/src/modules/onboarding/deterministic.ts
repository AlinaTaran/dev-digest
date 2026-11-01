import type { Onboarding } from '@devdigest/shared';
import { ONBOARDING_LIMITS as L, SECRET_COMMAND_PATTERNS, cutText } from './limits.js';

export interface DeterministicFacts {
  indexedFiles: string[];
  topRanked: string[];
  /** Dependency chains from `getCriticalPaths`, root first. */
  chains: string[][];
  fanIn: Map<string, number>;
  /** Raw root `package.json`, or null when absent/unreadable. */
  rootPackageJson: string | null;
  /** Tracked lockfile paths (only root-level names decide the package manager). */
  lockfiles: string[];
}

/** Cap on `top_dirs` entries so a monorepo with hundreds of top-level dirs stays readable. */
const TOP_DIRS_MAX = 12;
const SAFE_SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9:_.@/-]*$/;

function packageManager(lockfiles: string[]): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  const root = new Set(lockfiles.filter((p) => !p.includes('/')));
  if (root.has('pnpm-lock.yaml')) return 'pnpm';
  if (root.has('yarn.lock')) return 'yarn';
  if (root.has('bun.lockb') || root.has('bun.lock')) return 'bun';
  return 'npm';
}

function readScripts(json: string | null): Array<[string, string]> {
  if (json === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const scripts = (parsed as Record<string, unknown>).scripts;
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return [];
  return Object.entries(scripts).filter((e): e is [string, string] => typeof e[1] === 'string');
}

function topDirs(files: string[]): Array<{ path: string; files: number }> {
  const counts = new Map<string, number>();
  for (const f of files) {
    const slash = f.indexOf('/');
    if (slash <= 0) continue;
    const dir = f.slice(0, slash);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_DIRS_MAX)
    .map(([path, n]) => ({ path, files: n }));
}

/** The no-LLM tour (AC-49): everything derives from index facts and root scripts. English text only. */
export function buildDeterministicSections(facts: DeterministicFacts): Onboarding['sections'] {
  const pm = packageManager(facts.lockfiles);
  const steps: Onboarding['sections'][2]['steps'] = [];
  for (const [name, body] of readScripts(facts.rootPackageJson)) {
    if (steps.length >= L.stepsMax) break;
    if (!SAFE_SCRIPT_NAME.test(name)) continue;
    const command = `${pm} run ${name}`;
    if (command.length > L.commandChars) continue;
    const oneLine = body.replace(/\s+/g, ' ').trim();
    const secret = SECRET_COMMAND_PATTERNS.some((re) => re.test(oneLine));
    steps.push({
      command,
      source_path: 'package.json',
      note: secret ? null : cutText(`${name} → ${oneLine}`, L.noteChars),
    });
  }

  const reading: Onboarding['sections'][3]['steps'] = [];
  const seen = new Set<string>();
  for (const chain of facts.chains) {
    const root = chain[0];
    if (root === undefined) continue;
    for (let i = 0; i < chain.length; i += 1) {
      const path = chain[i] as string;
      if (seen.has(path)) continue;
      if (reading.length >= L.readingMax) break;
      seen.add(path);
      reading.push({
        path,
        why: cutText(`Step ${i + 1} of the dependency chain from ${root}`, L.whyChars),
      });
    }
  }

  const critical = facts.topRanked.slice(0, L.criticalMax).map((path) => ({
    path,
    why: null,
    fan_in: facts.fanIn.get(path) ?? 0,
  }));
  const dirs = topDirs(facts.indexedFiles);

  return [
    {
      kind: 'architecture',
      empty_reason: dirs.length === 0 ? 'no_data' : null,
      summary_md: null,
      top_dirs: dirs,
      diagram: null,
    },
    { kind: 'critical_paths', empty_reason: critical.length === 0 ? 'no_data' : null, items: critical },
    { kind: 'run_locally', empty_reason: steps.length === 0 ? 'no_data' : null, steps },
    { kind: 'reading_path', empty_reason: reading.length === 0 ? 'no_data' : null, steps: reading },
    { kind: 'first_tasks', empty_reason: 'needs_llm', tasks: [] },
  ];
}
