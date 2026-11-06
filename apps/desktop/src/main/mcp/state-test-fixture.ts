/** Portable domain tests use fake file persistence on Windows. This does not test Windows ACL enforcement. @packageDocumentation */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpStatePersistence } from '../../shared/mcp-platform';
export function testStatePersistence(root: string): McpStatePersistence | undefined {
  if (process.platform !== 'win32') return undefined;
  const path = join(root, 'mcp', 'state.json');
  return {
    read: () => existsSync(path) ? readFileSync(path, 'utf8') : undefined,
    write: (_userData, text) => {
      mkdirSync(join(root, 'mcp'), {recursive: true});
      writeFileSync(path, text);
    },
  };
}
