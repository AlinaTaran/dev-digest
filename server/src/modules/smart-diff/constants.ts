/**
 * Smart Diff classification patterns + thresholds.
 *
 * Kept as data (not inlined into `classify.ts`'s logic) per the task
 * acceptance criteria — extending the boilerplate/wiring definitions should
 * never require touching the classifier's control flow.
 */

/** Globs/substrings that mark a file as mechanical/generated — reviewed last, collapsed by default. */
export const BOILERPLATE_PATTERNS: RegExp[] = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /\.snap$/,
  /(^|\/)__snapshots__\//,
  /\.min\.[^/]+$/,
  /(^|\/)package\.json$/,
  /\.test\.[^/]+$/,
  /\.spec\.[^/]+$/,
  /(^|\/)test\//,
  /(^|\/)__tests__\//,
  /\.sql$/,
  /(^|\/)migrations?\//,
];

/** Globs/substrings that mark a file as app wiring/config — hooks core into the app. */
export const WIRING_PATTERNS: RegExp[] = [
  /\.config\.[^/]+$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)index\.tsx?$/,
  /(^|\/)server\.[^/]+$/,
  /(^|\/)main\.[^/]+$/,
  /\.env[^/]*$/,
  /(^|\/)src\/config\.[^/]+$/,
];

/** Above this total line count (additions+deletions across the PR), suggest a split. */
export const TOO_BIG_TOTAL_LINES = 400;
