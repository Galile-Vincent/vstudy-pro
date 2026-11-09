import { expect, it, vi } from 'vitest';
import { UpdateProvider, updateFeed } from './provider';
it('requests only fixed metadata without staging identifiers or cache queries', async () => {
  const request = vi.fn<(options: unknown) => Promise<string>>().mockResolvedValue(`version: 0.4.5\nfiles:\n  - url: VStudy-Pro-0.4.5-mac-arm64.zip\n    sha512: ${'a'.repeat(86)}==\n    size: 1\n`);
  const updater = {channel:null,isAddNoCacheQuery:true};
  const provider = new UpdateProvider({provider:'custom'},
    updater as unknown as ConstructorParameters<typeof UpdateProvider>[1],
    {platform:'darwin',executor:{request} as never,isUseMultipleRangeRequest:false});
  provider.setRequestHeaders({'x-user-staging-id':'private-installation-id'});
  expect((await provider.getLatestVersion()).version).toBe('0.4.5');
  const options = request.mock.calls[0]?.[0] as {hostname:string;path:string;headers:Record<string,string>} | undefined;
  expect(updateFeed).toBe('https://github.com/ava-apple/vstudy-pro/releases/latest/download');
  expect(options?.hostname).toBe('github.com');
  expect(options?.path).toBe('/ava-apple/vstudy-pro/releases/latest/download/latest-mac.yml');
  expect(options?.headers).not.toHaveProperty('x-user-staging-id');
});

it.each(['https://evil.test/a.zip', 'http://github.com/a.zip', '../evil.zip',
  'https://github.com/a.zip', 'VStudy-Pro-0.4.5-win-x64.exe'])('rejects unsafe Mac payload %s', url => {
  const provider = new UpdateProvider({provider:'custom'}, {} as never,
    {platform:'darwin',executor:{} as never,isUseMultipleRangeRequest:false});
  expect(() => provider.resolveFiles({version:'0.4.5',path:url,sha512:'abc',releaseDate:'',files:[{url,sha512:'abc',size:1}]})).toThrow();
});
