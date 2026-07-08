import { describe, it, expect } from 'vitest';
import { classifyFile } from './classify.js';

describe('classifyFile', () => {
  it.each([
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'foo.snap',
    'src/__snapshots__/foo.snap',
    'dist/x.js',
    'build/bundle.js',
    'lib.min.js',
    'package.json',
    'x.test.ts',
    'x.spec.ts',
    'test/helpers.ts',
    '__tests__/foo.ts',
  ])('classifies %s as boilerplate', (path) => {
    expect(classifyFile(path)).toBe('boilerplate');
  });

  it.each([
    'vite.config.ts',
    'jest.config.js',
    'tsconfig.json',
    'tsconfig.build.json',
    'src/api/index.ts',
    'src/api/index.tsx',
    'src/server.ts',
    'src/main.ts',
    '.env.local',
    'src/config.ts',
  ])('classifies %s as wiring', (path) => {
    expect(classifyFile(path)).toBe('wiring');
  });

  it('classifies a normal source file as core', () => {
    expect(classifyFile('src/middleware/ratelimit.ts')).toBe('core');
  });
});
