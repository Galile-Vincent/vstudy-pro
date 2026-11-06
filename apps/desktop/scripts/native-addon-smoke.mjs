/** Exercise rebuilt Windows node-pty under stock Electron before the complete installer build. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';
import { clearTimeout, setTimeout } from 'node:timers';
import { spawn } from 'node-pty';

if (process.platform !== 'win32' || !process.versions.electron || process.arch !== process.env.VSTUDY_NATIVE_ARCH) {
  throw new Error('Native-addon smoke requires Electron on its matching Windows architecture');
}
const marker = 'VSTUDY_NATIVE_ADDON_OK';
const terminal = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe'), ['/d', '/c', `echo ${marker}`], {
  name: 'xterm-256color', cols: 80, rows: 24, cwd: process.cwd(), env: process.env,
});
let output = '', finished = false;
const deadline = setTimeout(() => finish(1, 'Native terminal timed out'), 20000);
terminal.onData(chunk => { output = (output + chunk).slice(-65536); });
terminal.onExit(({ exitCode }) => setTimeout(() => finish(exitCode), 250));
function finish(exitCode, error) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  const libraries = Object.keys(createRequire(import.meta.url).cache).filter(path => path.endsWith('.node')).map(path => ({
    name: basename(path), sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  }));
  const ok = exitCode === 0 && output.includes(marker) && libraries.length > 0;
  const report = { schemaVersion: 1, platform: process.platform, arch: process.arch, electron: process.versions.electron,
    node: process.versions.node, engine: 'node-pty', rebuilt: true, stockElectron: true, packaged: false,
    roundTrip: ok, exitCode, libraries, ...(error ? {error} : {}) };
  mkdirSync('release', {recursive: true});
  writeFileSync(join('release', `native-addon-${process.arch}.json`), JSON.stringify(report, null, 2) + '\n');
  if (!ok) { try { terminal.kill(); } catch { /* The child may already have exited. */ } }
  console.log(JSON.stringify(report));
  process.exit(ok ? 0 : 1);
}
