import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../../platform/errors.js';
import type { BundleRunner } from './bundle.js';

/**
 * The CI runner is the `agent-runner/` package (a standalone CLI). `pnpm build`
 * there (ncc) emits `agent-runner/dist/`; the export commits every file of it
 * under `.devdigest/runner/`. ncc splits dynamic imports into extra chunks
 * (`310.index.js`, ...) that `index.js` loads relative to itself, so shipping
 * `index.js` alone would silently break the runner in the target repository.
 */
const DIST_DIR = fileURLToPath(new URL('../../../../agent-runner/dist/', import.meta.url));

/** Every file under `dir`, as `/`-separated paths relative to it. */
async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(path.join(dir, prefix), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory() ? listFiles(dir, `${prefix}${e.name}/`) : Promise.resolve([`${prefix}${e.name}`]),
    ),
  );
  return nested.flat();
}

/**
 * Read the built runner. `version` is a content hash of the whole bundle, so it
 * changes exactly when the shipped runner changes (what "Update CI config" needs).
 */
export async function loadRunner(distDir: string = DIST_DIR): Promise<BundleRunner> {
  let relPaths: string[] = [];
  try {
    relPaths = (await listFiles(distDir)).sort();
  } catch {
    // fall through: reported below as "not built"
  }
  if (!relPaths.includes('index.js')) {
    throw new AppError(
      'runner_not_built',
      'The CI runner is not built — run `cd agent-runner && pnpm install && pnpm build`',
      503,
    );
  }
  const files = await Promise.all(
    relPaths.map(async (p) => ({ path: p, contents: await readFile(path.join(distDir, p), 'utf8') })),
  );
  const hash = createHash('sha256');
  for (const f of files) hash.update(`${f.path}\0${f.contents}\0`);
  return { version: hash.digest('hex').slice(0, 12), files };
}
