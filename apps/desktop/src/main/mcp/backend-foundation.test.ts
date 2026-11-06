/** Verify account isolation, authenticated cursors and the real scheduled main transport. @packageDocumentation */
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { backendHarness, accountA, accountB, courseA, courseB } from './backend-test-support';
import { BackendContext, selectAccount } from './backend-context';
import { BackendPages, contentText } from './backend-page';
import { BackendRemote } from './backend-remote';
import { backendBoundary, McpBackendError } from './backend-errors';

const harnesses:Awaited<ReturnType<typeof backendHarness>>[] = [];
afterEach(async () => { for (const harness of harnesses.splice(0)) await harness.close(); });
async function setup() { const harness = await backendHarness(); harnesses.push(harness); return harness; }

it('requires a selection with multiple grants and rejects a selected-account cross reference', async () => {
  const {repository} = await setup();
  expect(() => selectAccount(repository, [accountA, accountB], undefined)).toThrow(McpBackendError);
  expect(selectAccount(repository, [accountA], undefined)).toBe(accountA);
  expect(() => new BackendContext(repository, accountA, [accountA, accountB], {courseId:courseB, limit:20})).toThrow(expect.objectContaining({code:'DENIED'}));
  expect(() => new BackendContext(repository, accountA, [accountB], {courseId:courseA, limit:20})).toThrow(expect.objectContaining({code:'DENIED'}));
});

it('authenticates cursors and binds them to tool, account, query and limit', () => {
  const pages = new BackendPages();
  const binding = pages.binding('search_content', accountA, {query:'Algorithms', limit:1});
  const first = pages.page([1, 2, 3], binding, {limit:1});
  expect(first.content.items).toEqual([1]);
  expect(pages.page([1, 2, 3], binding, {limit:1, cursor:first.nextCursor!}).content.items).toEqual([2]);
  for (const scope of [pages.binding('list_courses', accountA, {}), pages.binding('search_content', accountB, {query:'Algorithms', limit:1}), pages.binding('search_content', accountA, {query:'History', limit:1})]) {
    expect(() => pages.offset(scope, first.nextCursor!)).toThrow(expect.objectContaining({code:'INVALID_ARGUMENT'}));
  }
  expect(() => pages.offset(binding, first.nextCursor!.slice(0, -8) + '12345678')).toThrow(McpBackendError);
  expect(Buffer.byteLength(JSON.stringify(pages.page(Array.from({length:50}, () => 'a'.repeat(3000)), binding, {limit:50}).content))).toBeLessThan(48_100);
  expect(contentText('<script>steal()</script><a href="https://evil.test/?token=secret">Read me</a> https://evil.test/file')).toBe('Read me [link removed]');
});

it('uses the service request injection, serial spacing, bounded queue and current capabilities', async () => {
  const h = await setup();
  h.replies.core_calendar_get_calendar_upcoming_view = {events:[]};
  const remote = new BackendRemote(h.options);
  const context = new BackendContext(h.repository, accountA, [accountA], {limit:20});
  const call = () => remote.call(context, 'core_calendar_get_calendar_upcoming_view', {}, z.object({events:z.array(z.unknown())}));
  const pending = Array.from({length:24}, call);
  await expect(call()).rejects.toMatchObject({code:'RATE_LIMITED'});
  await Promise.all(pending);
  expect(h.request).toHaveBeenCalledTimes(24);
  expect(h.waits).toHaveLength(23);
  expect(h.waits.every(ms => ms >= 250)).toBe(true);
  expect(new URLSearchParams(String(h.request.mock.calls[0]![1]?.body)).get('wstoken')).toBe('school-token-' + accountA);
  h.repository.saveCapabilities(accountA, {advancedfeatures:[], mobileConfig:{}});
  await expect(call()).rejects.toMatchObject({code:'UNSUPPORTED'});
  expect(h.request).toHaveBeenCalledTimes(24);
});

it('rechecks account removal inside a queued call and never leaks arbitrary diagnostics', async () => {
  const h = await setup();
  h.replies.core_calendar_get_calendar_upcoming_view = {events:[]};
  const remote = new BackendRemote(h.options);
  const context = new BackendContext(h.repository, accountA, [accountA], {limit:20});
  const pending = remote.call(context, 'core_calendar_get_calendar_upcoming_view', {}, z.unknown());
  h.repository.disconnect(accountA);
  await expect(pending).rejects.toMatchObject({code:'NOT_FOUND'});
  expect(h.request).not.toHaveBeenCalled();
  await expect(backendBoundary(() => { throw new Error('token=private /home/student'); })).rejects.toMatchObject({code:'INTERNAL', message:'VStudy could not finish the operation.'});
});
