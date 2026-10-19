import type { LoggerPort } from '../../domain/ports';

/** stdout is reserved for JSON-RPC: every log line goes to stderr. */
export function createStderrLogger(): LoggerPort {
  const write = (level: string, message: string, meta?: Record<string, unknown>): void => {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
    process.stderr.write(`[devdigest-mcp] ${level} ${message}${suffix}\n`);
  };
  return {
    debug: (m, meta) => write('debug', m, meta),
    info: (m, meta) => write('info', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    error: (m, meta) => write('error', m, meta),
  };
}
