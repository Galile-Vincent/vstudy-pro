/**
 * Regression coverage for moodle webview-session.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
/** Fake-clock checks for autologin rate limits, cookie reuse, expiry, and cancellation. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AUTOLOGIN_INTERVAL, MoodleWebviewSession, WebviewSessionError } from './webview-session';

beforeEach(() => {vi.useFakeTimers();vi.setSystemTime(1_000_000);});
afterEach(() => vi.useRealTimers());
function fixture() {
  let cookie = false;
  const port = {credentials:vi.fn(async () => ({token:'WS_CANARY',privateToken:'PRIVATE_CANARY'})),hasCookie:vi.fn(async () => cookie),clear:vi.fn(async () => {cookie=false;}),exchange:vi.fn(async () => {cookie=true;})};
  const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({key:'one-use-key'}));
  const session = new MoodleWebviewSession('https://school.example',port,Date.now,request);
  return {port,request,session,expire:() => {cookie=false;}};
}
it('deduplicates concurrent opens and reuses the account cookie without more key requests',async () => {
  const {session,request,port} = fixture();
  await Promise.all([session.ensure(),session.ensure()]);
  await session.ensure();
  expect(session.phase).toBe('ready'); expect(request).toHaveBeenCalledTimes(1); expect(port.exchange).toHaveBeenCalledTimes(1);
  const [url,options] = request.mock.calls[0]!;
  expect(String(url)).not.toContain('CANARY');
  expect(new URLSearchParams(String(options?.body)).get('wstoken')).toBe('WS_CANARY');
  expect(new URLSearchParams(String(options?.body)).get('privatetoken')).toBe('PRIVATE_CANARY');
  expect(options?.redirect).toBe('error');
});
it('blocks expiry retries for six minutes and accepts one at the exact boundary',async () => {
  const {session,request,expire} = fixture();
  await session.ensure();expire();
  await expect(session.ensure(true)).rejects.toMatchObject({code:'session-expired',retryAt:1_000_000 + AUTOLOGIN_INTERVAL});
  vi.advanceTimersByTime(AUTOLOGIN_INTERVAL - 1);
  await expect(session.ensure(true)).rejects.toBeInstanceOf(WebviewSessionError);
  expect(request).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1); await session.ensure(true);
  expect(request).toHaveBeenCalledTimes(2);expect(session.phase).toBe('ready');
});
it('does not bypass the budget after a network failure',async () => {
  const {session,request} = fixture();
  request.mockRejectedValueOnce(new Error('upstream https://secret?token=CANARY'));
  await expect(session.ensure()).rejects.toEqual(new WebviewSessionError('offline',1_000_000 + AUTOLOGIN_INTERVAL));
  await expect(session.ensure()).rejects.toMatchObject({code:'session-expired'});
  expect(request).toHaveBeenCalledTimes(1);
});
it('fails closed without a private token and never falls back to a token URL',async () => {
  const {session,request,port} = fixture();
  port.credentials.mockResolvedValue({token:'WS_CANARY',privateToken:''});
  await expect(session.ensure()).rejects.toMatchObject({code:'unavailable'});
  expect(request).not.toHaveBeenCalled();expect(port.exchange).not.toHaveBeenCalled();
});
it('handles a Moodle error response or missing cookie without leaking diagnostics',async () => {
  const {session,request} = fixture();
  request.mockResolvedValueOnce(Response.json({exception:'moodle_exception',message:'PRIVATE_CANARY'}));
  await expect(session.ensure()).rejects.toMatchObject({message:'unavailable'});
  expect(session.phase).toBe('expired');
  const another = fixture();another.port.exchange.mockImplementation(async () => {});
  await expect(another.session.ensure()).rejects.toMatchObject({code:'session-expired'});
});
it('isolates rate limits across accounts',async () => {
  const first = fixture(), second = fixture();
  await first.session.ensure(); await second.session.ensure();
  expect(first.request).toHaveBeenCalledTimes(1);expect(second.request).toHaveBeenCalledTimes(1);
});
it('retains the account budget when a disposed partition is recreated',async () => {
  const first = fixture(), budget = {retryAt:0};
  const session = new MoodleWebviewSession('https://school.example',first.port,Date.now,first.request,budget);
  await session.ensure();await session.dispose();
  const second = fixture();
  const reopened = new MoodleWebviewSession('https://school.example',second.port,Date.now,second.request,budget);
  await expect(reopened.ensure()).rejects.toMatchObject({code:'session-expired',retryAt:1_000_000 + AUTOLOGIN_INTERVAL});
  expect(second.request).not.toHaveBeenCalled();
});
it('rejects oversized or malformed key responses without attempting a cookie exchange',async () => {
  const {session,request,port} = fixture();
  request.mockResolvedValueOnce(new Response('x'.repeat(65 * 1024)));
  await expect(session.ensure()).rejects.toMatchObject({code:'unavailable'});
  expect(port.exchange).not.toHaveBeenCalled();
});
it('aborts an in-flight exchange on disconnect and clears any late cookies',async () => {
  const {session,port} = fixture();
  let finish!:()=>void;
  port.exchange.mockImplementation(() => new Promise<void>(resolve => {finish=resolve;}));
  const pending = session.ensure();
  await vi.waitFor(() => expect(port.exchange).toHaveBeenCalled());
  const disposal = session.dispose();finish();
  await expect(pending).rejects.toMatchObject({code:'session-expired'});await disposal;
  expect(session.phase).toBe('disposed');expect(await port.hasCookie()).toBe(false);
  await expect(session.ensure()).rejects.toMatchObject({code:'session-expired'});
});
