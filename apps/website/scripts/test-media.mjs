import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'tests/media-kit.test.mjs', 'tests/share-story.test.ts'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
