import { describe, it, expect } from 'vitest';
// classifyFile lives in the smart-diff module; this file is the homework's
// named entry point for `pnpm verify:l03`.
import { classifyFile } from '../smart-diff/classify.js';

describe('classifyFile (verify:l03)', () => {
  it.each([
    'pnpm-lock.yaml',
    'package-lock.json',
    '0001_migration.sql',
    'dist/bundle.js',
    'src/__snapshots__/foo.snap',
  ])('classifies %s as boilerplate', (path) => {
    expect(classifyFile(path)).toBe('boilerplate');
  });

  it.each([
    'src/index.ts',
    'vite.config.ts',
    'tsconfig.json',
    'src/server.ts',
    '.env.local',
  ])('classifies %s as wiring', (path) => {
    expect(classifyFile(path)).toBe('wiring');
  });

  it.each([
    'src/modules/reviews/service.ts',
    'src/db/schema.ts',
    'src/lib/helpers.ts',
    'src/middleware/ratelimit.ts',
    'README.md',
  ])('classifies %s as core', (path) => {
    expect(classifyFile(path)).toBe('core');
  });
});
