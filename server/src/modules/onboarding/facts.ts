import type { Container } from '../../platform/container.js';
import type { IndexState } from '../repo-intel/types.js';
import { parseMakeTargets, parsePackageScripts } from './commands.js';
import { envNamesOnly, selectKeyFiles, type KeyFiles } from './inputs.js';
import { MAX_CHAINS, MAX_ENDPOINTS, MAX_RANKED, isSecretFile } from './limits.js';
import type { OnboardingRepoRow } from './repository.js';

/** Names probed at the repo root when `git ls-tree` is unavailable (no secret files). */
const FALLBACK_PROBES = ['README.md', 'package.json', 'Makefile', 'docker-compose.yml', '.env.example'];

const ENV_TEMPLATE = /^\.env(\.[A-Za-z0-9_-]+)*\.(example|sample|template)$/i;

export interface Facts {
  sourceSha: string;
  indexedFiles: string[];
  topRanked: string[];
  chains: string[][];
  endpoints: { path: string; endpoints: string[] }[];
  /** Tracked tree at `sourceSha`; `null` when `git ls-tree` failed. */
  tracked: string[] | null;
  keyFiles: KeyFiles | null;
  /** Key files actually read (env templates reduced to names). */
  files: { path: string; content: string }[];
  manifests: Map<string, Set<string>>;
  makefiles: Map<string, Set<string>>;
  rootPackageJson: string | null;
  lockfiles: string[];
  /** False when the import graph looks empty (EC-5). */
  hasImportGraph: boolean;
  ms: number;
}

const basename = (p: string): string => p.split('/').pop() ?? p;
const dirname = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

function settled<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === 'fulfilled' ? r.value : fallback;
}

/**
 * Gather everything the generator needs from container ports. Never throws:
 * a failed source degrades to empty. Clone files are read only through
 * `container.git.readFile` (realpath-confined); secret files are never requested.
 * The caller has already resolved `repo` inside the workspace (IDOR).
 */
export async function collectFacts(
  container: Container,
  repo: OnboardingRepoRow,
  indexState: IndexState,
): Promise<Facts> {
  const started = Date.now();
  const sourceSha = indexState.lastIndexedSha;
  const ref = { owner: repo.owner, name: repo.name };
  const intel = container.repoIntel;

  const [filesR, rankedR, chainsR, endpointsR, trackedR] = await Promise.allSettled([
    intel.getIndexedFiles(repo.id),
    intel.getTopFilesByRank(repo.id, MAX_RANKED),
    intel.getCriticalPaths(repo.id),
    intel.getEndpointFacts(repo.id, MAX_ENDPOINTS),
    container.git.listTrackedFiles(ref, sourceSha),
  ]);
  const indexedFiles = settled(filesR, []);
  const topRanked = settled(rankedR, []);
  const chains = settled(chainsR, []).slice(0, MAX_CHAINS);
  const endpoints = settled(endpointsR, []);
  const tracked = trackedR.status === 'fulfilled' ? trackedR.value : null;

  const keyFiles = tracked ? selectKeyFiles(tracked) : null;
  const toRead = keyFiles
    ? [
        ...(keyFiles.readme ? [keyFiles.readme] : []),
        ...keyFiles.manifests,
        ...keyFiles.compose,
        ...keyFiles.makefiles,
        ...keyFiles.envTemplates,
      ]
    : FALLBACK_PROBES;

  const files: Facts['files'] = [];
  const manifests = new Map<string, Set<string>>();
  const makefiles = new Map<string, Set<string>>();
  let rootPackageJson: string | null = null;

  const reads = await Promise.allSettled(
    toRead
      .filter((p) => !isSecretFile(p))
      .map(async (path) => ({ path, content: await container.git.readFile(ref, path) })),
  );
  for (const r of reads) {
    if (r.status !== 'fulfilled' || r.value.content === '') continue; // unreadable (escape, missing) → skipped
    const { path, content } = r.value;
    const base = basename(path).toLowerCase();
    if (base === 'package.json') {
      const scripts = parsePackageScripts(content);
      if (scripts) manifests.set(dirname(path), scripts);
      if (dirname(path) === '') rootPackageJson = content;
    } else if (base === 'makefile' || base === 'gnumakefile') {
      makefiles.set(dirname(path), parseMakeTargets(content));
    }
    files.push({ path, content: ENV_TEMPLATE.test(basename(path)) ? envNamesOnly(content) : content });
  }

  // No facade method counts edges: an empty graph shows as no chains AND no
  // importer for any top-ranked file.
  let hasImportGraph = chains.length > 0;
  if (!hasImportGraph && topRanked.length > 0) {
    const fan = await intel.getFanIn(repo.id, topRanked).catch(() => new Map<string, number>());
    hasImportGraph = [...fan.values()].some((n) => n > 0);
  }

  return {
    sourceSha,
    indexedFiles,
    topRanked,
    chains,
    endpoints,
    tracked,
    keyFiles,
    files,
    manifests,
    makefiles,
    rootPackageJson,
    lockfiles: keyFiles?.lockfiles ?? [],
    hasImportGraph,
    ms: Date.now() - started,
  };
}
