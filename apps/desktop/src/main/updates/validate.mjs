import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {parseUpdateInfo} from 'electron-updater/out/providers/Provider.js';
export function validateFeed(info, suffix) {
  const invalid = () => { throw new Error('Invalid update metadata'); };
  if (!info || !/^\d+\.\d+\.\d+$/.test(info.version) || 'packages' in info ||
    !Array.isArray(info.files) || info.files.length !== 1) invalid();
  const expected = `VStudy-Pro-${info.version}-${suffix}`;
  if (info.path && info.path !== expected) invalid();
  for (const file of info.files) {
    if (file.url !== expected || Object.keys(file).some(key =>
      !['url', 'sha512', 'size', 'blockMapSize'].includes(key)) ||
      !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512) ||
      !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 2 ** 31) invalid();
  }
  return info;
}
export function parseFeed(raw, suffix) {
  if (!raw || Buffer.byteLength(raw) > 65536 || /[&*!]/.test(raw)) {
    throw new Error('Invalid update metadata');
  }
  let info;
  try { info = parseUpdateInfo(raw, 'latest.yml', new URL('https://github.com/')); }
  catch { throw Object.assign(new Error('Invalid update metadata'), {code:'ERR_UPDATER_INVALID_UPDATE_INFO'}); }
  if (/^\d+\.\d+\.\d+-/.test(info?.version)) {
    throw Object.assign(new Error('Prerelease ignored'), {code:'NO_STABLE_UPDATE'});
  }
  return validateFeed(info, suffix);
}
