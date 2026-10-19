import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

/** No-DB smoke tests: path-param validation rejects before any DB access. */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('blast + pr-history routes (no DB)', () => {
  it.each(['/pulls/not-a-uuid/blast', '/pulls/not-a-uuid/history'])(
    'GET %s with a non-uuid id → 422 error envelope',
    async (url) => {
      const app = await buildApp({ config });
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error).toBeDefined();
      expect(typeof body.error.code).toBe('string');
      await app.close();
    },
  );
});
