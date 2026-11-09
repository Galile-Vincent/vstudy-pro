import { expect, it, vi } from 'vitest';
import { UpdateProvider, updateFeed } from './provider';
it('requests only fixed metadata without staging identifiers or cache queries', async () => {
  const request = vi.fn<(options: unknown) => Promise<string>>().mockResolvedValue('version: 0.4.5\nfiles: []\npath: update.zip\nsha512: abc\n');
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
