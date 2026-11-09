import { GenericProvider } from 'electron-updater/out/providers/GenericProvider';
export const updateFeed = 'https://github.com/ava-apple/vstudy-pro/releases/latest/download';
export class UpdateProvider extends GenericProvider {
  constructor(_options: {provider:'custom'},
    updater: ConstructorParameters<typeof GenericProvider>[1],
    runtime: ConstructorParameters<typeof GenericProvider>[2]) {
    // GenericProvider otherwise adds a timestamp query and a persistent staging identifier.
    super({provider:'generic', url:updateFeed, useMultipleRangeRequest:false},
      new Proxy(updater, { get(target, key, receiver) {
        return key === 'isAddNoCacheQuery' ? false : Reflect.get(target, key, receiver);
      } }), runtime);
  }
  override setRequestHeaders(headers: Parameters<GenericProvider['setRequestHeaders']>[0]) {
    void headers;
    super.setRequestHeaders({});
  }
}
