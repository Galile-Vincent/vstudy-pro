/**
 * Verify a packaged application's native startup without enabling remote debugging or provisioning Python.
 * The caller isolates userData before ownership and invokes the smoke after the real renderer loads.
 * @packageDocumentation
 */
import { app, safeStorage, type BrowserWindow } from 'electron';
import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { access, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Store } from './db';
import { installDirectories, resolveInstalledExecutable } from './providers/trusted-executable';
import { scrubbedEnvironment } from '../../resources/converter/contracts';

const execute = promisify(execFile);

/** Validate the runner's temporary directory and set userData before app readiness and single-instance locking. */
export function prepareDistributionSmoke(): string | undefined {
  const requested = process.env.VSTUDY_DISTRIBUTION_SMOKE_DIR;
  if (!requested) return undefined;
  if (!app.isPackaged || app.isReady()) throw new Error('Distribution smoke requires an unstarted packaged application');
  const root = realpathSync(requested);
  const child = relative(realpathSync(tmpdir()), root);
  if (isAbsolute(child) || child.includes(sep) || !/^vstudy-distribution-smoke-[\w-]+$/.test(child) || lstatSync(requested).isSymbolicLink()) {
    throw new Error('Distribution smoke must use a private temporary directory created by its runner');
  }
  const userData = join(root, 'user-data');
  mkdirSync(userData, { mode: 0o700 });
  app.setPath('userData', userData);
  return root;
}

async function converterProbe(userData: string) {
  const resources = join(process.resourcesPath, 'converter');
  for (const file of ['convert.py', 'limits.py', 'requirements.lock.txt', 'pdf_md/__init__.py']) await access(join(resources, file));
  const executables: { name: string; path: string | null; available: boolean; version?: string; stdlibProbe?: boolean; error?: string }[] = [];
  for (const name of process.platform === 'win32' ? ['uv', 'python', 'python3'] : ['uv', 'python3']) {
    const path = await resolveInstalledExecutable(name, [...installDirectories(), '/usr/bin', '/bin']);
    if (!path) { executables.push({ name, path: null, available: false }); continue; }
    try {
      const python = name.startsWith('python');
      const args = python ? ['-I', '-S', '-c', 'import json,sys; print(json.dumps({"version":sys.version,"stdlibProbe":True}))'] : ['--version'];
      const { stdout, stderr } = await execute(path, args, {
        cwd: userData, env: scrubbedEnvironment(userData), shell: false, windowsHide: true,
        timeout: 5000, maxBuffer: 16 * 1024,
      });
      executables.push({ name, path, available: true, version: (stdout + stderr).trim(), stdlibProbe: python });
    } catch (error) {
      executables.push({ name, path, available: false, error: String(error) });
    }
  }
  return { resourcesPresent: true, executables, bootstrapAttempted: false, conversionTested: false };
}

/** Report native window, renderer, SQLite durability, and converter probe results, then exit with an explicit status. */
export async function runDistributionSmoke(window: BrowserWindow, store: Store, root: string): Promise<void> {
  const report: Record<string, unknown> = {
    schemaVersion: 1, ok: false, exitCode: 1, platform: process.platform, arch: process.arch,
    appVersion: app.getVersion(), runtime: process.versions, userData: app.getPath('userData'),
    windowCreated: false, rendererLoaded: false,
  };
  try {
    if (!app.isPackaged || app.getPath('userData') !== join(root, 'user-data')) throw new Error('Smoke userData isolation was not configured');
    if (window.isDestroyed()) throw new Error('Main window was destroyed before smoke');
    report.windowCreated = true;
    const rendererLoaded: unknown = await window.webContents.executeJavaScript(
      `new Promise(resolve => { const deadline = Date.now() + 15000; const check = () => {
        const loaded = document.readyState === 'complete' && !!document.getElementById('root')?.childElementCount && !!window.desktop && typeof window.require === 'undefined';
        if (loaded || Date.now() >= deadline) resolve(loaded); else setTimeout(check, 50);
      }; check(); })`,
    );
    if (rendererLoaded !== true || !window.webContents.getURL().startsWith('vstudy://app/')) throw new Error('Packaged renderer did not mount with its preload bridge');
    report.rendererLoaded = true;
    const capture = await window.webContents.capturePage();
    if (capture.isEmpty()) throw new Error('Native window capture was empty');
    await writeFile(join(root, 'window.png'), capture.toPNG());
    report.windowCapture = 'window.png';
    const settings = store.settings.get();
    const chatSide = settings.chatSide === 'left' ? 'right' : 'left';
    store.settings.set({ ...settings, chatSide });
    if (store.settings.get().chatSide !== chatSide) throw new Error('Application SQLite write/read failed');
    const reopened = new DatabaseSync(join(app.getPath('userData'), 'vstudy.sqlite'), { readOnly: true });
    try {
      const row = reopened.prepare("SELECT value FROM settings WHERE key='app'").get();
      if (typeof row?.value !== 'string' || JSON.parse(row.value).chatSide !== chatSide) throw new Error('SQLite write did not persist to disk');
      if (reopened.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') throw new Error('SQLite integrity check failed');
      report.database = { engine: 'node:sqlite', version: reopened.prepare('SELECT sqlite_version() AS version').get()?.version, integrity: 'ok', writeRead: true, persisted: true };
    } finally { reopened.close(); }
    if (process.platform === 'win32') {
      if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('Windows async safeStorage is unavailable');
      const synthetic = 'vstudy-distribution-smoke-synthetic-value';
      const encrypted = await safeStorage.encryptStringAsync(synthetic);
      try {
        if ((await safeStorage.decryptStringAsync(encrypted)).result !== synthetic) throw new Error('Windows DPAPI round-trip failed');
      } finally { encrypted.fill(0); }
      report.safeStorage = { backend: 'dpapi', roundTrip: true, ciphertextCleared: true };
    } else {
      report.safeStorage = { probed: false, reason: 'Mac Keychain remains lazy during distribution smoke' };
    }
    report.converter = await converterProbe(app.getPath('userData'));
    report.ok = true;
    report.exitCode = 0;
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
  }
  await writeFile(join(root, 'smoke-result.json'), JSON.stringify(report, null, 2) + '\n');
  app.exit(report.ok ? 0 : 1);
}
