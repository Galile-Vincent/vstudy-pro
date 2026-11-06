/** Put the action-provided uv binary in the application's trusted installation directory. */
import { chmodSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

let source = process.env.UV_EXECUTABLE;
if (!source) throw new Error('setup-uv did not provide UV_EXECUTABLE');
if (process.platform === 'win32' && !existsSync(source) && !source.endsWith('.exe')) source += '.exe';
const directory = join(homedir(), '.local', 'bin');
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const executable = join(directory, process.platform === 'win32' ? 'uv.exe' : 'uv');
if (resolve(source) !== resolve(executable)) copyFileSync(source, executable);
chmodSync(executable, 0o700);
