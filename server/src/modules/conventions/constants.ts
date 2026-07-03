/**
 * Config files probed directly via `container.git.readFile` for convention
 * evidence, on top of the top-ranked source files from
 * `container.repoIntel.getConventionSampleFiles`. One read per candidate;
 * a missing file is skipped, never thrown (see `service.ts#gatherSamples`).
 */
export const CONFIG_CANDIDATE_FILENAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.yml',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'package.json',
] as const;

/** How many top-ranked files (by `repoIntel.getConventionSampleFiles`) to sample. */
export const CONVENTION_SAMPLE_FILE_COUNT = 12;
