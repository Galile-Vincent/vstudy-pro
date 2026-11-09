import {parseFeed, validateFeed} from './validate.mjs';
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
    const info = parseFeed(raw ?? '', this.platform === 'darwin' ? 'mac-arm64.zip' : 'win-x64.exe');
    this.resolveFiles(info);
    return info;
  }
  override resolveFiles(info: Parameters<GenericProvider['resolveFiles']>[0]) {
    validateFeed(info, this.platform === 'darwin' ? 'mac-arm64.zip' : 'win-x64.exe');
    return super.resolveFiles(info);
  }
  override setRequestHeaders(headers: Parameters<GenericProvider['setRequestHeaders']>[0]) {
    void headers;
    super.setRequestHeaders({});
  }
}
