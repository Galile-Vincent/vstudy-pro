/** Offline prepare guard for installs that skipped dependency scripts. Runtime remains guarded in CI. */
import { repairPtyHelpers } from '../apps/desktop/src/main/providers/setup/pty-helper.mts';

const skippedScripts = [process.env.npm_config_ignore_scripts, process.env.npm_config_ignore_dep_scripts].some(value => value === 'true' || value === '1');
if (process.platform !== 'win32' && (!process.env.CI || skippedScripts)) {
  try {
    const repaired = repairPtyHelpers();
    if (repaired) console.log(`Prepared ${repaired} node-pty spawn helper(s).`);
  } catch {
    console.error('Could not prepare the node-pty terminal helper. Run pnpm rebuild node-pty, or ask IT to repair permissions inside the installed node-pty package.');
    process.exitCode = 1;
  }
}
