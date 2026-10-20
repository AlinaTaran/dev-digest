export interface Config {
  apiUrl: string;
  webUrl: string;
  pollIntervalMs: number;
  runTimeoutMs: number;
  httpTimeoutMs: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type Env = Record<string, string | undefined>;

const DEFAULTS = {
  apiUrl: 'http://localhost:3001',
  webUrl: 'http://localhost:3000',
  pollIntervalMs: 2000,
  runTimeoutMs: 100_000,
  httpTimeoutMs: 30_000,
} as const;

function parseUrl(name: string, raw: string | undefined, fallback: string): string {
  const value = raw && raw.trim() !== '' ? raw.trim() : fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} must be an http(s) URL, got "${value}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`${name} must be an http(s) URL, got "${value}"`);
  }
  return value.replace(/\/+$/, '');
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);
  const value = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.min(max, Math.max(min, value));
}

/** env -> validated, clamped Config. Throws ConfigError on an invalid URL. */
export function loadConfig(env: Env): Config {
  return {
    apiUrl: parseUrl('DEVDIGEST_API_URL', env.DEVDIGEST_API_URL, DEFAULTS.apiUrl),
    webUrl: parseUrl('DEVDIGEST_WEB_URL', env.DEVDIGEST_WEB_URL, DEFAULTS.webUrl),
    pollIntervalMs: clampInt(env.DEVDIGEST_MCP_POLL_INTERVAL_MS, DEFAULTS.pollIntervalMs, 500, 10_000),
    runTimeoutMs: clampInt(env.DEVDIGEST_MCP_RUN_TIMEOUT_MS, DEFAULTS.runTimeoutMs, 5000, 600_000),
    httpTimeoutMs: clampInt(env.DEVDIGEST_MCP_HTTP_TIMEOUT_MS, DEFAULTS.httpTimeoutMs, 1000, 120_000),
  };
}
