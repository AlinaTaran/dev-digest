import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/composition/config';

describe('loadConfig', () => {
  it('applies defaults and strips trailing slashes', () => {
    expect(loadConfig({})).toEqual({
      apiUrl: 'http://localhost:3001',
      webUrl: 'http://localhost:3000',
      pollIntervalMs: 2000,
      runTimeoutMs: 100_000,
      httpTimeoutMs: 30_000,
    });
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://api.test:9//' }).apiUrl).toBe('http://api.test:9');
  });

  it('clamps numeric settings and ignores garbage', () => {
    const c = loadConfig({
      DEVDIGEST_MCP_POLL_INTERVAL_MS: '1',
      DEVDIGEST_MCP_RUN_TIMEOUT_MS: '99999999',
      DEVDIGEST_MCP_HTTP_TIMEOUT_MS: 'abc',
    });
    expect(c.pollIntervalMs).toBe(500);
    expect(c.runTimeoutMs).toBe(600_000);
    expect(c.httpTimeoutMs).toBe(30_000);
  });

  it('rejects non-http URLs', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'ftp://x' })).toThrow(ConfigError);
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'nonsense' })).toThrow(ConfigError);
  });
});
