/** Confined execute-bit repair shared by Node install guards and the packaged PTY runner. @packageDocumentation */
import { accessSync, closeSync, constants, fchmodSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';

const nodePtyRequire = createRequire(typeof __filename === 'string' ? __filename : import.meta.url);
const directories = ['build/Release', 'build/Debug', 'prebuilds/darwin-arm64', 'prebuilds/darwin-x64', 'prebuilds/linux-arm64', 'prebuilds/linux-x64'];
type ChangeMode = (fd: number, mode: number) => void;

function packageRoot(packageJson: string) {
  const unpacked = packageJson.split(sep).map(part => ['app.asar', 'node_modules.asar'].includes(part) ? `${part}.unpacked` : part).join(sep);
  const root = realpathSync(dirname(unpacked)), manifest = join(root, 'package.json');
  const info = lstatSync(manifest);
  if (!info.isFile() || info.isSymbolicLink() || JSON.parse(readFileSync(manifest, 'utf8')).name !== 'node-pty') throw new Error('Invalid node-pty package');
  return root;
}

function helperFile(root: string, directory: string, required: boolean) {
  if (!directories.includes(directory)) throw new Error('Unexpected node-pty native directory');
  let path = root;
  for (const part of [...directory.split('/'), 'spawn-helper']) {
    path = join(path, part);
    let info;
    try { info = lstatSync(path); }
    catch (error) { if (!required && (error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    const last = part === 'spawn-helper';
    if (info.isSymbolicLink() || (last ? !info.isFile() : !info.isDirectory())) throw new Error('Unsafe node-pty helper path');
    const contained = relative(root, realpathSync(path));
    if (contained === '..' || contained.startsWith(`..${sep}`) || resolve(root, contained) !== path) throw new Error('Escaped node-pty package');
    if (last) return { path, info };
  }
  throw new Error('node-pty spawn-helper is missing');
}

function repair(root: string, directory: string, required: boolean, changeMode: ChangeMode) {
  const helper = helperFile(root, directory, required);
  if (!helper) return null;
  if ((helper.info.mode & 0o111) === 0o111) { accessSync(helper.path, constants.X_OK); return false; }
  const fd = openSync(helper.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.dev !== helper.info.dev || info.ino !== helper.info.ino || realpathSync(helper.path) !== helper.path) throw new Error('Changed node-pty helper');
    changeMode(fd, (info.mode & 0o777) | 0o111);
    if ((fstatSync(fd).mode & 0o111) !== 0o111) throw new Error('node-pty helper is not executable');
    accessSync(helper.path, constants.X_OK);
    return true;
  } finally { closeSync(fd); }
}

/** Repair the exact directory selected by the pinned native loader before any PTY spawn. */
export function repairPtyHelper(packageJson: string, directory: string, changeMode: ChangeMode = fchmodSync) {
  return repair(packageRoot(packageJson), directory, true, changeMode);
}

/** Install/build guard covers both Mac prebuild architectures as well as compiled Unix helpers. */
export function repairPtyHelpers(packageJson = nodePtyRequire.resolve('node-pty/package.json'), changeMode: ChangeMode = fchmodSync) {
  const root = packageRoot(packageJson);
  let found = 0, repaired = 0;
  for (const directory of directories) {
    const result = repair(root, directory, false, changeMode);
    if (result !== null) { found++; if (result) repaired++; }
  }
  if (!found) throw new Error('node-pty spawn-helper is missing');
  return repaired;
}

/** node-pty 1.1.0 chooses Release, Debug, then the host prebuild by loading its native binding. */
export function preparePtyHelper() {
  if (process.platform === 'win32') return;
  const packageJson = nodePtyRequire.resolve('node-pty/package.json');
  const loader = nodePtyRequire(join(dirname(packageJson), 'lib/utils.js')) as { loadNativeModule(name: string): { dir: string } };
  const native = loader.loadNativeModule('pty');
  const directory = relative(dirname(packageJson), resolve(dirname(packageJson), 'lib', native.dir)).split(sep).join('/');
  repairPtyHelper(packageJson, directory);
}
