/** Export reversible client installation with entry-only diffs, backups, and atomic writes. @packageDocumentation */
import { existsSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { clientConfig, type ClientOptions } from './client-config';
import { editConfig, parseConfig } from './config-edit';
import { ensureDirectory, LocalFileError, readLocal, replaceLocal, writeExclusive } from './files';

export interface InstallResult { changed: boolean; diff: string; configPath: string; backupPath?: string }

export function installClient(options: ClientOptions): InstallResult { return changeClient(options, false); }
export function uninstallClient(options: ClientOptions): InstallResult { return changeClient(options, true); }

function changeClient(options: ClientOptions, uninstall: boolean): InstallResult {
  const config = clientConfig(options);
  const before = readLocal(config.path);
  const edit = editConfig(before, config, uninstall);
  const diff = edit.changed
    ? `${uninstall ? '-' : '+'} ${config.client} vstudy ${JSON.stringify(config.entry, null, 2)}`
    : `No change. ${config.client} vstudy entry is ${uninstall ? 'absent' : 'already installed'}.`;
  const result = { changed: edit.changed, diff, configPath: config.path };
  if (!edit.changed || options.dryRun) return result;
  ensureDirectory(dirname(config.path));
  const lock = `${config.path}.vstudy-lock`;
  writeExclusive(lock, 'VStudy client configuration transaction\n');
  try {
    if (readLocal(config.path) !== before) throw new LocalFileError('Configuration changed during installation. Retry after other clients finish writing.');
    const backupPath = before === undefined ? undefined : `${config.path}.vstudy-backup-${randomUUID()}`;
    if (backupPath) writeExclusive(backupPath, before!);
    replaceLocal(config.path, edit.text, before);
    return { ...result, ...(backupPath ? { backupPath } : {}) };
  } finally { if (existsSync(lock)) unlinkSync(lock); }
}

/** Restore an explicit VStudy backup, retaining the replaced config as another private backup. */
export function restoreConfigBackup(options: ClientOptions & { backupPath: string }): InstallResult {
  const config = clientConfig(options);
  if (!options.backupPath.startsWith(`${config.path}.vstudy-backup-`)
    || !/^[0-9a-f-]{36}$/.test(options.backupPath.slice(`${config.path}.vstudy-backup-`.length))) {
    throw new LocalFileError('Choose a VStudy backup beside this client configuration.');
  }
  const text = readLocal(options.backupPath, true);
  if (text === undefined) throw new LocalFileError('The selected backup is missing.');
  parseConfig(text, config.format);
  const before = readLocal(config.path);
  const changed = before !== text;
  const result = { changed, configPath: config.path, diff: changed ? 'Restore the selected VStudy configuration backup.' : 'No change. Backup matches the configuration.' };
  if (!changed || options.dryRun) return result;
  const lock = `${config.path}.vstudy-lock`;
  writeExclusive(lock, 'VStudy client configuration restore\n');
  try {
    const backupPath = before === undefined ? undefined : `${config.path}.vstudy-backup-${randomUUID()}`;
    if (backupPath) writeExclusive(backupPath, before!);
    replaceLocal(config.path, text, before);
    return { ...result, ...(backupPath ? { backupPath } : {}) };
  } finally { if (existsSync(lock)) unlinkSync(lock); }
}
