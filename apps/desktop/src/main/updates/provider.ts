import { parseUpdateInfo } from 'electron-updater/out/providers/Provider';
import { GenericProvider } from 'electron-updater/out/providers/GenericProvider';
export const updateFeed = 'https://github.com/ava-apple/vstudy-pro/releases/latest/download';
export class UpdateProvider extends GenericProvider {
  private platform: string;
  constructor(_options: {provider:'custom'},
    updater: ConstructorParameters<typeof GenericProvider>[1],
    runtime: ConstructorParameters<typeof GenericProvider>[2]) {
    // Suppress the cache query and staging header; the library still writes .updaterId locally.
    super({provider:'generic', url:updateFeed, useMultipleRangeRequest:false},
      new Proxy(updater, { get(target, key, receiver) {
        return key === 'isAddNoCacheQuery' ? false : Reflect.get(target, key, receiver);
      } }), runtime);
    this.platform = runtime.platform;
  }
  override async getLatestVersion() {
    const name = this.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml';
    const url = new URL(`${updateFeed}/${name}`);
    const raw = await this.httpRequest(url);
    if (!raw || raw.length > 65536 || /[&*!]/.test(raw)) throw new Error('Invalid update feed');
    const info = parseUpdateInfo(raw, name, url);
    if (/^\d+\.\d+\.\d+-/.test(info.version)) {
      throw Object.assign(new Error('Prerelease ignored'), {code:'NO_STABLE_UPDATE'});
    }
    this.resolveFiles(info);
    return info;
  }
  override resolveFiles(info: Parameters<GenericProvider['resolveFiles']>[0]) {
    if (!/^\d+\.\d+\.\d+$/.test(info.version) || 'packages' in info ||
      !Array.isArray(info.files) || !info.files.length) throw new Error('Invalid update feed');
    const suffix = this.platform === 'darwin' ? 'mac-arm64.zip' : 'win-x64.exe';
    const expected = `VStudy-Pro-${info.version}-${suffix}`;
    if (info.path && info.path !== expected) throw new Error('Invalid update path');
    for (const file of info.files) {
      if (file.url !== expected || Object.keys(file).some(key =>
        !['url', 'sha512', 'size', 'blockMapSize'].includes(key)) ||
        !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512) ||
        !Number.isSafeInteger(file.size) || file.size! <= 0) throw new Error('Invalid update file');
    }
    return super.resolveFiles(info);
  }
  override setRequestHeaders(headers: Parameters<GenericProvider['setRequestHeaders']>[0]) {
    void headers;
    super.setRequestHeaders({});
  }
}
