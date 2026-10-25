import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/** NFR-10: the client's vendored contracts must stay byte-identical to the server's. */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));

describe('vendored contract sync', () => {
  for (const file of ['brief.ts', 'platform.ts']) {
    it(`${file} is identical in server and client`, () => {
      const server = read(`../src/vendor/shared/contracts/${file}`);
      const client = read(`../../client/src/vendor/shared/contracts/${file}`);
      expect(client.equals(server)).toBe(true);
    });
  }
});
