/** Install local hooks only in Git checkouts outside CI. */
import { spawnSync } from 'node:child_process';

if (!process.env.CI && !process.env.LEFTHOOK && spawnSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' }).status === 0) {
  const result = spawnSync('lefthook', ['install'], { stdio: 'inherit' });
  if (result.status !== 0) console.warn('Hooks were not installed. Run pnpm exec lefthook install to retry.');
}
