/** Transport selection and address derivation keep Windows pipes separate from Unix permissions. @packageDocumentation */
import { expect, it, vi } from 'vitest';
import { createPlatformBridge } from './transport';
import { resolveMcpEndpoint, windowsPipeName } from './endpoint';
import { defaultAppDataPath } from '../platform/app-data';
const listener=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('./bridge',()=>({createUnixBridge:listener.create}));
it.each(['darwin','linux'] as const)('adapts %s to the existing authenticated Unix implementation',async platform=>{
  const dispose=vi.fn(async()=>{});listener.create.mockResolvedValueOnce({socketPath:'/private/profile/mcp/bridge.sock',dispose});
  const handleRequest=vi.fn(),onDisconnect=vi.fn();
  const transport=await createPlatformBridge({userData:'/private/profile',peerHelper:'/app/mcp-peer',handleRequest,onDisconnect},platform);
  expect(transport.endpoint).toEqual({kind:'unix',path:'/private/profile/mcp/bridge.sock'});
  await transport.dispose();expect(dispose).toHaveBeenCalledOnce();
  expect(listener.create).toHaveBeenLastCalledWith({userData:'/private/profile',peerHelper:'/app/mcp-peer',handleRequest,onDisconnect});
});
it('fails closed on Windows until the current-user ACL transport is supplied',async()=>{
  await expect(createPlatformBridge({userData:'C:\\profile',handleRequest:vi.fn(),onDisconnect:vi.fn()},'win32')).rejects.toMatchObject({code:'UNSUPPORTED'});
});
it('derives a local pipe name from the current user SID, never an account-controlled host',()=>{
  const first=resolveMcpEndpoint('C:\\profile','win32','S-1-5-21-111-222-333-1001');
  expect(first).toEqual({kind:'named-pipe',path:windowsPipeName('S-1-5-21-111-222-333-1001')});
  expect(first.path).toMatch(/^\\\\\.\\pipe\\vstudy-[a-f0-9]{32}$/);
  expect(first.path).not.toBe(windowsPipeName('S-1-5-21-111-222-333-1002'));
  expect(()=>windowsPipeName('\\\\remote\\pipe\\attack')).toThrow();
  expect(resolveMcpEndpoint('/profile','darwin')).toEqual({kind:'unix',path:'/profile/mcp/bridge.sock'});
});
it('shares the native app-name data directory layout on every platform',()=>{
  expect(defaultAppDataPath({platform:'darwin',home:'/Users/student',environment:{}})).toBe('/Users/student/Library/Application Support/@vstudy/desktop');
  expect(defaultAppDataPath({platform:'linux',home:'/home/student',environment:{XDG_CONFIG_HOME:'/config'}})).toBe('/config/@vstudy/desktop');
  expect(defaultAppDataPath({platform:'win32',home:'C:\\Users\\student',environment:{APPDATA:'C:\\Users\\student\\AppData\\Roaming'}})).toBe('C:\\Users\\student\\AppData\\Roaming\\@vstudy\\desktop');
});
