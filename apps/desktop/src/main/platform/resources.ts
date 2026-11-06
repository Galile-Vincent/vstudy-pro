/** Resolve extra resources without loading Electron into the Node-only MCP runtime. */
import { join, resolve } from 'node:path';

export function desktopResourcePath(...parts: string[]): string {
  const runtime = process as NodeJS.Process & {resourcesPath?: string; defaultApp?: boolean};
  const root = runtime.resourcesPath && !runtime.defaultApp ? runtime.resourcesPath : resolve(__dirname, '../../resources');
  return join(root, ...parts);
}
