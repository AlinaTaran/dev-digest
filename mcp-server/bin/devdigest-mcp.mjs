#!/usr/bin/env node
// Plain-JS launcher: registers the tsx ESM loader, then runs the TypeScript entry.
// stdout is reserved for JSON-RPC; nothing here may print to it.
import { register } from 'tsx/esm/api';

register();
await import('../src/main.ts');
