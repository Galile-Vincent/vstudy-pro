import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { Updates } from './service';
import { reduceUpdate, updateError } from './state';
class FakeUpdater extends EventEmitter {
  autoDownload = true; allowDowngrade = true; allowPrerelease = true; autoInstallOnAppQuit = true;
  checkForUpdates = vi.fn(async () => null);
  downloadUpdate = vi.fn(async () => []);
  quitAndInstall = vi.fn();
}
const services: Updates[] = [];
afterEach(() => { services.splice(0).forEach(service => service.dispose()); vi.useRealTimers(); });
function setup(unsupported?: 'unsigned') {
  const updater = new FakeUpdater();
  let now = 1_000_000, online = true;
  const saveAutomatic = vi.fn();
  const service = new Updates(updater as unknown as ConstructorParameters<typeof Updates>[0], {
    ...(unsupported ? {unsupported} : {}), version:'0.4.4', automatic:true,
    online:() => online, now:() => now, saveAutomatic,
  });
  services.push(service);
  return {updater, service, saveAutomatic, offline:() => {online = false;}, advance:() => {now += 600_000;}};
}
it('checks, offers, downloads with consent, clamps progress, and installs only when ready', async () => {
  const {service, updater} = setup();
  expect(updater.autoDownload).toBe(false);
  expect(updater.allowDowngrade).toBe(false);
  expect(updater.allowPrerelease).toBe(false);
  expect(updater.autoInstallOnAppQuit).toBe(false);
  service.install(); await service.download(); expect(updater.quitAndInstall).not.toHaveBeenCalled();
  await service.check(); expect(service.snapshot().state.status).toBe('checking');
  updater.emit('update-available', {version:'0.4.5'});
  expect(service.snapshot().state).toEqual({status:'available', version:'0.4.5',
    releaseUrl:'https://github.com/ava-apple/vstudy-pro/releases/tag/v0.4.5'});
  await service.download(); expect(updater.autoInstallOnAppQuit).toBe(true);
  updater.emit('download-progress', {percent:42.4}); expect(service.snapshot().state).toEqual({status:'downloading',percent:42});
  updater.emit('download-progress', {percent:120}); expect(service.snapshot().state).toEqual({status:'downloading',percent:100});
  updater.emit('update-downloaded', {version:'0.4.5'});
  expect(service.snapshot().state).toEqual({status:'ready',version:'0.4.5'});
  service.install(); expect(updater.quitAndInstall).toHaveBeenCalledOnce();
});
it('reports offline manual checks and keeps successful timestamps', async () => {
  const {service, updater, offline, advance} = setup();
  await service.check(); updater.emit('update-not-available');
  expect(service.snapshot().state.status).toBe('idle');
  await service.check(); expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  advance(); await service.check(); updater.emit('update-not-available');
  offline(); advance(); const previous = service.snapshot().lastCheckedAt;
  await service.check(); expect(service.snapshot().state).toEqual({status:'error',code:'offline'});
  expect(service.snapshot().lastCheckedAt).toBe(previous);
});
it('schedules at 15 seconds and six hours, persists opt-out, and disposes', async () => {
  vi.useFakeTimers();
  const {service, updater, saveAutomatic, advance} = setup();
  await vi.advanceTimersByTimeAsync(14999); expect(updater.checkForUpdates).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(updater.checkForUpdates).toHaveBeenCalledOnce();
  updater.emit('update-not-available'); advance();
  await vi.advanceTimersByTimeAsync(6*60*60_000-15000); expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  service.setAuto(false); expect(saveAutomatic).toHaveBeenCalledWith(false);
  updater.emit('update-not-available'); advance();
  await vi.advanceTimersByTimeAsync(6*60*60_000); expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  service.dispose(); expect(updater.listenerCount('error')).toBe(0);
});
it('quietly disables unsupported builds', async () => {
  const {service, updater} = setup('unsigned');
  await service.check(); await service.download(); service.install();
  expect(service.snapshot().state).toEqual({status:'unsupported',reason:'unsigned'});
  expect(updater.checkForUpdates).not.toHaveBeenCalled();
});
it.each([['ENOTFOUND','network'],['ECONNRESET','network'],['ETIMEDOUT','network'],
  ['ERR_UPDATER_INVALID_SIGNATURE','integrity'],['ERR_UPDATER_INVALID_SHA512','integrity'],['secret raw message','failed']])(
  'maps %s without exposing messages', async (code, expected) => {
    const {service, updater} = setup();
    updater.checkForUpdates.mockRejectedValueOnce({code});
    await service.check(); expect(service.snapshot().state).toEqual({status:'error',code:expected});
    expect(updateError({code})).toBe(expected);
  });
it('handles download rejection, offline consent, malformed metadata and illegal events', async () => {
  const {service, updater} = setup();
  await service.check(); updater.emit('update-available', {version:'0.4.5'});
  updater.downloadUpdate.mockRejectedValueOnce({code:'ENOTFOUND'});
  await service.download(); await Promise.resolve(); expect(service.snapshot().state).toEqual({status:'error',code:'network'});
  expect(updater.autoInstallOnAppQuit).toBe(false);
  await service.check(); expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  expect(reduceUpdate({status:'idle'}, {type:'ready',version:'0.4.5'})).toEqual({status:'idle'});
  expect(reduceUpdate({status:'idle'}, {type:'progress',percent:50})).toEqual({status:'idle'});
  expect(reduceUpdate({status:'downloading',percent:42}, {type:'progress',percent:NaN})).toEqual({status:'downloading',percent:42});
  const second = setup(); await second.service.check(); second.updater.emit('update-available',{version:'../../evil'});
  expect(second.service.snapshot().state).toEqual({status:'error',code:'failed'});
  const third = setup(); await third.service.check(); third.updater.emit('update-available',{version:'0.4.5'}); third.offline(); await third.service.download();
  expect(third.service.snapshot().state).toEqual({status:'error',code:'offline'});
});

it('manual checks bypass automatic interval after a short cooldown', async () => {
  const {service,updater} = setup();
  await service.check(); updater.emit('update-not-available');
  vi.spyOn(Date, 'now').mockReturnValue(1_010_000);
  Reflect.set(service, 'lastManualAttempt', 0);
  await service.check(); expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  vi.restoreAllMocks();
});
