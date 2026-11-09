import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(()=>({exec:vi.fn()}));
vi.mock('electron',()=>({app:{isPackaged:true,getVersion:()=> '0.4.4',getPath:()=>'/app/Contents/MacOS/app'},net:{isOnline:()=>true}}));
vi.mock('node:child_process',()=>({execFile:mocks.exec}));
vi.mock('electron-updater',()=>({autoUpdater:{setFeedURL:()=>{throw new Error('setup failed');}}}));
import {Updates} from './service';
import { createUpdates, windowsUpdateSupport } from './runtime';
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it.each(['throwing','hanging'])('returns immediately and fails closed for %s setup', async mode=>{
  vi.useFakeTimers();
  mocks.exec.mockImplementation(()=>{if(mode==='throwing')throw new Error('codesign failed');});
  let shown = ()=>{};
  const ready = new Promise<void>(resolve=>{shown=resolve;});
  const service = createUpdates({settings:{get:()=>({autoCheckUpdates:true}),set:vi.fn()}} as never,ready);
  expect(mocks.exec).not.toHaveBeenCalled();
  expect(service.snapshot().state.status).toBe('loading');
  const initialize = vi.spyOn(Updates.prototype, 'initialize');
  shown(); await vi.advanceTimersByTimeAsync(20_100);
  expect(initialize).toHaveBeenCalled();
  expect(service.snapshot().state).toEqual({status:'unsupported',reason:'unsigned'});
  await vi.advanceTimersByTimeAsync(80_100);
  expect(initialize).toHaveBeenCalledTimes(2);
  initialize.mockRestore(); service.dispose();
});

it.each(['', 'publisherName: []', 'publisherName: ""', 'publisherName: null'])(
  'disables unsigned Windows config %s',publisher=>{
    expect(windowsUpdateSupport(`provider: generic\nurl: https://github.com/ava-apple/vstudy-pro/releases/latest/download\n${publisher}`, 'x64',true)).toBe('unsigned');
  });
it('requires Windows x64, a publisher and NSIS installation',()=>{
  const config='provider: generic\nurl: https://github.com/ava-apple/vstudy-pro/releases/latest/download\npublisherName:\n - VStudy Publisher';
  expect(windowsUpdateSupport(config,'arm64',true)).toBe('platform');
  expect(windowsUpdateSupport(config,'x64',false)).toBe('portable');
  expect(windowsUpdateSupport(config,'x64',true)).toBeUndefined();
});
it('accepts a publisher containing an ampersand', () => {
  expect(windowsUpdateSupport('provider: generic\nurl: https://github.com/ava-apple/vstudy-pro/releases/latest/download\npublisherName: "A & B"', 'x64', true)).toBeUndefined();
});
