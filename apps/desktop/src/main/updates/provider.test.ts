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
  expect(() => provider.resolveFiles({version:'0.4.5',path:url,sha512:'a'.repeat(86)+'==',releaseDate:'',files:[{url,sha512:'a'.repeat(86)+'==',size:1}]})).toThrow();
});

it.each([
  `version: 0.4.5\nfiles: [{url: "https://evil.test/payload", sha512: ${'a'.repeat(86)}==, size: 1}]`,
  `version: 0.4.5\nfiles: [{url: "http://github.com/payload", sha512: ${'a'.repeat(86)}==, size: 1}]`,
  `version: 0.4.5\nfiles: [{url: "https://github.com/payload", sha512: ${'a'.repeat(86)}==, size: 1}]`,
  ['a0: &a0 [x,x,x]',...Array.from({length:25},(_,index)=>
    `a${index+1}: &a${index+1} [*a${index},*a${index},*a${index}]`)].join('\n'),
  `version: 0.4.5\nfiles:\n - url: VStudy-Pro-0.4.5-mac-arm64.zip\n   sha512: ${'a'.repeat(86)}==\n   size: 1\n   isAdminRightsRequired: true`,
])('rejects malicious metadata before resolving payloads: %s',async raw=>{
  const provider=new UpdateProvider({provider:'custom'},{} as never,
    {platform:'darwin',executor:{request:async()=>raw} as never,isUseMultipleRangeRequest:false});
  await expect(provider.getLatestVersion()).rejects.toThrow();
});
it('ignores prerelease metadata explicitly',async()=>{
  const provider=new UpdateProvider({provider:'custom'},{} as never,
    {platform:'darwin',executor:{request:async()=> 'version: 1.2.3-rc.1'} as never,isUseMultipleRangeRequest:false});
  await expect(provider.getLatestVersion()).rejects.toMatchObject({code:'NO_STABLE_UPDATE'});
});
it('rejects payloads larger than two GiB', () => {
  const provider = new UpdateProvider({provider:'custom'}, {} as never,
    {platform:'darwin',executor:{} as never,isUseMultipleRangeRequest:false});
  expect(() => provider.resolveFiles({version:'0.4.5',releaseDate:'',path:'VStudy-Pro-0.4.5-mac-arm64.zip',sha512:'a'.repeat(86)+'==',
    files:[{url:'VStudy-Pro-0.4.5-mac-arm64.zip',sha512:'a'.repeat(86)+'==',size:2**31+1}]})).toThrow();
});
