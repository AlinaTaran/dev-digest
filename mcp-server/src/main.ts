import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { ConfigError, loadConfig } from './composition/config';
import { createContainer } from './composition/container';
import { createMcpServer } from './delivery/mcp/server';

function fatal(message: string): never {
  process.stderr.write(`[devdigest-mcp] fatal: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    fatal(err instanceof ConfigError ? err.message : String(err));
  }

  const container = createContainer(config);
  const server = createMcpServer(container);
  await server.connect(new StdioServerTransport());
  container.logger.info('devdigest MCP server ready', { apiUrl: config.apiUrl });

  const shutdown = (): void => {
    void server.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  fatal(err instanceof Error ? (err.stack ?? err.message) : String(err));
});
