/**
 * Verify a packaged application's native startup without enabling remote debugging or provisioning Python.
 * The caller isolates userData before ownership and invokes the smoke after the real renderer loads.
 * @packageDocumentation
 */
import { app, safeStorage, type BrowserWindow } from 'electron';
import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { Wire } from '../../../mcp/src/transport';
import { pingWire } from '../../../mcp/src/bridge';
import { MCP_PROTOCOL_VERSION } from '../shared/mcp';
import type { Store } from './db';
import { installDirectories, resolveInstalledExecutable } from './providers/trusted-executable';
import { scrubbedEnvironment } from '../../resources/converter/contracts';
import { managedConverterPython, systemExecutable } from './platform/process';
import { ActionPty } from './providers/setup/pty';
import { createWindowsStatePersistence } from './mcp/windows-state';
import { resolveMcpEndpoint } from './mcp/endpoint';

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
  if (process.platform === 'win32' && process.env.VSTUDY_DISTRIBUTION_SMOKE_MCP_ENABLED === '1') {
    createWindowsStatePersistence().write(userData, JSON.stringify({version: 1, enabled: true, grants: [], activity: []}));
  }
  return root;
}

async function converterProbe(userData: string) {
  const resources = join(process.resourcesPath, 'converter');
  for (const file of ['convert.py', 'limits.py', 'figures.py', 'requirements.lock.txt', 'pdf_md/__init__.py']) await access(join(resources, file));
  let nativeWheel: { verified: boolean; version: string; sha256: string; minimumMacOS: string } | undefined;
  if (process.platform === 'darwin' && process.arch === 'x64') {
    const manifest: unknown = JSON.parse(await readFile(join(resources, 'wheels', 'native.json'), 'utf8'));
    const metadata = manifest as Record<string, unknown>;
    if (!metadata || metadata.schemaVersion !== 1 || typeof metadata.file !== 'string' ||
        !/^cryptography-[\d.]+-[\w.]+-[\w.]+-macosx_[\d_]+_x86_64\.whl$/.test(metadata.file) ||
        typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.sha256) || typeof metadata.version !== 'string' || typeof metadata.minimumMacOS !== 'string') {
      throw new Error('Packaged native converter metadata is invalid');
    }
    const hash = createHash('sha256').update(await readFile(join(resources, 'wheels', metadata.file))).digest('hex');
    const nativeLock = await readFile(join(resources, 'requirements.native.lock.txt'), 'utf8');
    if (hash !== metadata.sha256 || !nativeLock.includes(`--hash=sha256:${hash}`)) throw new Error('Packaged native converter checksum mismatch');
    nativeWheel = { verified: true, version: metadata.version, sha256: hash, minimumMacOS: metadata.minimumMacOS };
  }
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
  return { resourcesPresent: true, executables, managedPythonRequest: managedConverterPython(), nativeWheel, bootstrapAttempted: false, conversionTested: false };
}

async function mcpProbe(window: BrowserWindow, enabled: boolean) {
  const deadline = Date.now() + (process.arch === 'arm64' ? 95_000 : 35_000);
  while (true) {
    const state: unknown = await window.webContents.executeJavaScript('window.desktop.invoke("mcp:state", {})');
    if (!state || typeof state !== 'object' || !('enabled' in state) || !('unavailable' in state) || state.unavailable) {
      throw new Error('Packaged MCP startup is unavailable');
    }
    if (!enabled) {
      if (state.enabled !== false) throw new Error('Fresh packaged MCP state was not disabled');
      return {enabled: false, expectedEnabled: false, windowCreated: true, realPersistence: process.platform === 'win32',
        startupRestored: false, bridgeVerified: false};
    }
    let wire: Wire | undefined;
    try {
      wire = await Wire.connect(resolveMcpEndpoint(app.getPath('userData')).path,
        {signal: AbortSignal.timeout(Math.max(1, deadline - Date.now()))});
      const pong = await pingWire(wire);
      if (state.enabled === true && pong.enabled && pong.version === MCP_PROTOCOL_VERSION) return {
        enabled: true, expectedEnabled: true, windowCreated: true, realPersistence: process.platform === 'win32',
        startupRestored: true, bridgeVerified: true, hiddenBackground: !window.isVisible(),
      };
    } catch { /* Window creation can precede the guarded native host startup. */ }
    finally {wire?.close();}
    if (Date.now() >= deadline) throw new Error('Saved MCP opt-in did not restore an authenticated bridge');
    await delay(100);
  }
}

/** Report native window, renderer, SQLite durability, and converter probe results, then exit with an explicit status. */
export async function runDistributionSmoke(window: BrowserWindow, store: Store, root: string): Promise<void> {
  const updateConfig = await readFile(join(process.resourcesPath, 'app-update.yml'), 'utf8');
  if (!/^provider: generic$/m.test(updateConfig) ||
    !/^url: ['"]?https:\/\/github.com\/ava-apple\/vstudy-pro\/releases\/latest\/download['"]?$/m.test(updateConfig)) {
    throw new Error('Packaged update feed is missing or incorrect');
  }
  const report: Record<string, unknown> = {
    schemaVersion: 1, ok: false, exitCode: 1, platform: process.platform, arch: process.arch,
    appName: app.getName(), appVersion: app.getVersion(), runtime: process.versions, userData: app.getPath('userData'),
    windowCreated: false, rendererLoaded: false,
  };
  try {
    if (/electron/i.test(app.getName())) throw new Error('Unbranded runtime app name');
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
    const mcpEnabled = process.env.VSTUDY_DISTRIBUTION_SMOKE_MCP_ENABLED === '1';
    report.mcp = await mcpProbe(window, mcpEnabled);
    const capture = await window.webContents.capturePage(undefined, {stayHidden: true});
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
    const environment = Object.fromEntries(Object.entries(scrubbedEnvironment(app.getPath('userData')))
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const terminal = await new ActionPty().run({
      executable: process.platform === 'win32' ? systemExecutable('cmd.exe') : '/bin/sh',
      args: process.platform === 'win32' ? ['/d', '/c', 'echo VSTUDY_PTY_READY'] : ['-c', 'printf VSTUDY_PTY_READY'],
      cwd: app.getPath('userData'), env: environment,
    }, new AbortController().signal, () => {}, 15_000);
    if (terminal.exitCode !== 0 || !terminal.output.includes('VSTUDY_PTY_READY')) throw new Error('Packaged native terminal round-trip failed');
    report.nativeTerminal = {engine: 'node-pty', architecture: process.arch, roundTrip: true, exitCode: terminal.exitCode};
    report.converter = await converterProbe(app.getPath('userData'));
    report.ok = true;
    report.exitCode = 0;
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
  }
  await writeFile(join(root, 'smoke-result.json'), JSON.stringify(report, null, 2) + '\n');
  app.exit(report.ok ? 0 : 1);
}
