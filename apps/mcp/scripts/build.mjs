/** Bundle the CLI and installer API with all runtime dependencies for desktop packaging. */
import { build } from 'esbuild';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: { 'vstudy-mcp': 'src/cli.ts', installer: 'src/public.ts', 'windows-acl': 'src/windows-acl.ts' }, bundle: true,
  mainFields: ['module', 'main'], platform: 'node', target: 'node24', format: 'cjs', outdir: 'dist', outExtension: { '.js': '.cjs' },
  banner: { js: '#!/usr/bin/env node' }, sourcemap: false, legalComments: 'eof', logLevel: 'info' });
await chmod('dist/vstudy-mcp.cjs', 0o755);
for (const client of ['claude', 'agy', 'cursor']) {
  await mkdir(`plugins/${client}/dist`, { recursive: true });
  await copyFile('dist/vstudy-mcp.cjs', `plugins/${client}/dist/vstudy-mcp.cjs`);
}
