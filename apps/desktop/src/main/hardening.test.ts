import { it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, stat, link, symlink, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { redact } from './logging';
import { safeFilename } from './security';
import { cliArgs, cliEnvironment } from './providers/cli';
import { validateImport } from './services/import-security';
import { containedPath } from './services/file-paths';
import { exportFile } from './services/export-file';
import { deleteAllData } from './services/delete-data';
it('redacts secrets and home paths centrally', () => {
  const result = redact(`sk-secret Bearer token x-api-key: abc ${homedir()}/Documents/book`);
  for (const value of ['sk-secret', 'token', 'abc', homedir()]) expect(result).not.toContain(value);
});
it('strips control, bidi, traversal and long export names', () => {
  expect(safeFilename('../a\u202e\n/b')).toBe('ab');
  expect(safeFilename('x'.repeat(1000))).toHaveLength(180);
});
it('spawns a fake CLI without inherited secrets in argv or environment', () => {
  const secret = 'sk-do-not-inherit';
  const env = cliEnvironment({ PATH: process.env.PATH, OPENAI_API_KEY: secret, NODE_OPTIONS: secret });
  const result = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify({argv:process.argv,env:process.env}))', ...cliArgs('claude', 'default')], { env, encoding: 'utf8' });
  // Node must not parse the fake CLI's flags.
  const probe = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify({argv:process.argv,env:process.env}))', '--', ...cliArgs('claude', 'default')], { env, encoding: 'utf8' });
  expect(probe.status).toBe(0);
  expect(probe.stdout).not.toContain(secret);
  expect(result.stdout).not.toContain(secret);
});
it('rejects symlinks, hardlinks and signature mismatches; deletes every data tree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vstudy-security-'));
  try {
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    const file = join(root, 'source.md'); await writeFile(file, 'safe', { mode: 0o600 });
    await symlink(file, join(root, 'sym.md'));
    expect(() => validateImport(join(root, 'sym.md'), 'md')).toThrow();
    await expect(exportFile(file, join(root, 'sym.md'))).rejects.toThrow();
    await expect(exportFile(file, file)).rejects.toThrow();
    await exportFile(file, join(root, 'export.md'));
    expect((await stat(join(root, 'export.md'))).mode & 0o777).toBe(0o600);
    await link(file, join(root, 'hard.md'));
    await expect(exportFile(file, join(root, 'hard.md'))).rejects.toThrow();
    expect(() => validateImport(file, 'md')).toThrow();
    expect(() => containedPath(root, file)).toThrow();
    await writeFile(join(root, 'bad.pdf'), 'not PDF');
    expect(() => validateImport(join(root, 'bad.pdf'), 'pdf')).toThrow();
    for (const name of ['library', 'converter-venv', 'Cache']) { await mkdir(join(root, name)); await writeFile(join(root, name, 'data'), 'private'); }
    await writeFile(join(root, 'secrets.json'), 'encrypted');
    await writeFile(join(root, 'vstudy.sqlite'), 'db');
    let stopped = false;
    await deleteAllData(root, async () => { stopped = true; });
    expect(stopped).toBe(true);
    await expect(access(root)).rejects.toThrow();
  } finally { await import('node:fs/promises').then(fs => fs.rm(root, { recursive: true, force: true })); }
});
it('repairs DB, library and secret file permissions on every start', async () => {
  const { chmod, rm } = await import('node:fs/promises');
  const { openStore } = await import('./db');
  const { DocumentService } = await import('./services/documents');
  const { createSecretStore } = await import('./services/secrets');
  const root = await mkdtemp(join(tmpdir(), 'vstudy-permissions-'));
  const database = join(root, 'vstudy.sqlite'), library = join(root, 'library'), secrets = join(root, 'secrets.json');
  await mkdir(library); await writeFile(secrets, '{}');
  try {
    for (let startup = 0; startup < 2; startup++) {
      if (startup) await chmod(database, 0o666);
      await chmod(library, 0o777); await chmod(secrets, 0o666);
      const store = openStore(database);
      const documents = new DocumentService({ store, userData: root, convert: async () => {} });
      createSecretStore(secrets, { isAsyncEncryptionAvailable: async () => false, encryptStringAsync: async () => { throw new Error('unused'); }, decryptStringAsync: async () => { throw new Error('unused'); } });
      expect((await stat(database)).mode & 0o777).toBe(0o600);
      expect((await stat(library)).mode & 0o777).toBe(0o700);
      expect((await stat(secrets)).mode & 0o777).toBe(0o600);
      documents.dispose(); store.close();
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
