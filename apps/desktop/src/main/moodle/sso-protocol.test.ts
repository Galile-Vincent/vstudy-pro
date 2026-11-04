import { it, expect, vi, beforeEach } from 'vitest';
const mock = vi.hoisted(() => ({packaged:false,registration:true,handlers:new Map<string,(...args:unknown[]) => void>(),register:vi.fn(),open:vi.fn()}));
vi.mock('electron',() => ({app:{get isPackaged() {return mock.packaged;},on:(name:string,handler:(...args:unknown[]) => void) => mock.handlers.set(name,handler),whenReady:async () => undefined,setAsDefaultProtocolClient:(scheme:string) => {mock.register(scheme);return mock.registration;}},shell:{openExternal:mock.open}}));
import { initializeMoodleProtocol, routeMoodleCallback, ssoProtocol } from './sso-protocol';
beforeEach(() => {mock.packaged=false;mock.registration=true;mock.register.mockClear();});
it.each([[false,true,false],[true,false,false],[true,true,true]])('selects external availability for packaged=%s registration=%s',async (packaged,registration,available) => {
  mock.packaged=packaged;mock.registration=registration;
  initializeMoodleProtocol();await Promise.resolve();
  expect(ssoProtocol.available).toBe(available);
  expect(mock.register.mock.calls).toEqual(packaged ? [['vstudymoodle']] : []);
});
it('routes macOS URLs and Windows/Linux argv only to active subscribers',async () => {
  initializeMoodleProtocol();await Promise.resolve();
  const first = vi.fn(() => false), second = vi.fn((url:string) => url === 'vstudymoodle://token=valid');
  const offFirst = ssoProtocol.subscribe(first), offSecond = ssoProtocol.subscribe(second);
  const event = {preventDefault:vi.fn()};
  mock.handlers.get('open-url')!(event,'vstudymoodle://token=valid');
  expect(event.preventDefault).toHaveBeenCalledOnce();expect(second).toHaveBeenCalledWith('vstudymoodle://token=valid');
  mock.handlers.get('second-instance')!({},['app','/tmp/file','https://example.com','vstudymoodle://token=valid']);
  expect(second).toHaveBeenCalledTimes(2);expect(first).toHaveBeenCalledTimes(2);
  offFirst();offSecond();
  expect(routeMoodleCallback('vstudymoodle://token=valid')).toBe(false);
  expect(routeMoodleCallback('file:///tmp/private')).toBe(false);
});
it('opens only a validated HTTPS launch URL',async () => {
  mock.open.mockClear();
  await ssoProtocol.open('https://school.example/launch.php?passport=fixture');
  expect(mock.open).toHaveBeenCalledExactlyOnceWith('https://school.example/launch.php?passport=fixture');
  for (const url of ['file:///tmp/private','http://school.example','https://127.0.0.1','https://user:pass@school.example']) await expect(ssoProtocol.open(url)).rejects.toThrow();
  expect(mock.open).toHaveBeenCalledTimes(1);
});
