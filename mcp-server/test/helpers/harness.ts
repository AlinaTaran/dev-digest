import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import {
  createSilentLogger,
  FakeClock,
  FakeDevDigestApi,
} from '../../src/adapters/mocks';
import { loadConfig, type Config } from '../../src/composition/config';
import { createContainer, type Container } from '../../src/composition/container';
import { createMcpServer } from '../../src/delivery/mcp/server';

export interface Harness {
  client: Client;
  container: Container;
  api: FakeDevDigestApi;
  clock: FakeClock;
  logger: ReturnType<typeof createSilentLogger>;
  config: Config;
  /** client.callTool with `arguments`; resolves to the CallToolResult (isError is returned, not thrown). */
  callTool(name: string, args?: Record<string, unknown>): ReturnType<Client['callTool']>;
  close(): Promise<void>;
}

export interface HarnessOptions {
  api?: FakeDevDigestApi;
  clock?: FakeClock;
  config?: Partial<Config>;
}

/** MCP client <-> in-memory transport <-> createMcpServer(createContainer(config, fakes)). */
export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const api = options.api ?? new FakeDevDigestApi();
  const clock = options.clock ?? new FakeClock();
  const logger = createSilentLogger();
  const config: Config = { ...loadConfig({}), ...options.config };
  const container = createContainer(config, { api, clock, logger });

  const server = createMcpServer(container);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    container,
    api,
    clock,
    logger,
    config,
    callTool: (name, args = {}) => client.callTool({ name, arguments: args }),
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** Text of the first content block of a tool result. */
export function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const first = (result.content as { type: string; text?: string }[])[0];
  return first?.text ?? '';
}
