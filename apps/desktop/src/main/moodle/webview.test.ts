/**
 * Regression coverage for page-initiated imports in Moodle content views.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  panes: [] as { contents: import('node:events').EventEmitter & { openHandler?: (details: { url: string }) => unknown; loadURL: ReturnType<typeof vi.fn> } }[],
  browsers: [] as (import('node:events').EventEmitter & { clearStorageData: ReturnType<typeof vi.fn>; clearCache: ReturnType<typeof vi.fn>; closeAllConnections: ReturnType<typeof vi.fn> })[],
  imports: vi.fn(async () => '5f0a7a2e-8d4b-4c63-9f0e-1b2c3d4e5f60'),
  log: vi.fn(),
}));
vi.mock('../logging', () => ({ log: mock.log }));
vi.mock('./webview-files', () => ({ importWebviewFile: () => mock.imports() }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Contents extends EventEmitter {
    openHandler?: (details: { url: string }) => unknown;
    navigationHistory = { canGoBack: () => false, canGoForward: () => false };
    setWindowOpenHandler(handler: (details: { url: string }) => unknown) { this.openHandler = handler; }
    loadURL = vi.fn(async () => undefined); stop = vi.fn(); focus = vi.fn(); close = vi.fn(); isDestroyed() { return false; }
  }
  class WebContentsView {
    webContents = new Contents();
    constructor() { mock.panes.push({ contents: this.webContents }); }
    setVisible = vi.fn(); setBounds = vi.fn(); setBackgroundColor = vi.fn();
  }
  const window = { contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }, isDestroyed: () => false, getContentSize: () => [800, 600] };
  return {
    BrowserWindow: { fromWebContents: () => window },
    WebContentsView,
    session: { fromPartition: () => {
      const browser = Object.assign(new EventEmitter(), {
        setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(), setDisplayMediaRequestHandler: vi.fn(),
        webRequest: { onBeforeRequest: vi.fn(), onBeforeSendHeaders: vi.fn() },
        cookies: { get: vi.fn(async () => [{ name: 'MoodleSession', value: 'cookie' }]) },
        clearStorageData: vi.fn(async () => undefined), clearCache: vi.fn(async () => undefined), closeAllConnections: vi.fn(async () => undefined),
        fetch: vi.fn(),
      });
      mock.browsers.push(browser); return browser;
    } },
    clipboard: { writeText: vi.fn() }, shell: { openExternal: vi.fn() }, dialog: { showMessageBox: vi.fn() },
  };
});
import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { MoodleWebviews } from './webview';

const accountId = '8b7f7a4e-3c1a-4a52-9a37-0f6d0c7e3a11', site = 'https://school.example';
const file = (name = 'a.pdf') => `${site}/pluginfile.php/1/mod_resource/content/0/${name}`;
const account = { status: 'connected', id: accountId, siteUrl: site, siteName: 'School', remoteUserId: 7 };
const users: MoodleWebviews[] = [];
async function open() {
  const owner = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false, focus: vi.fn(), getZoomFactor: () => 1 }) as unknown as WebContents;
  const views = new MoodleWebviews({ account: () => account as never, credentials: async () => ({ token: 't', privateToken: 'p' }), file: () => ({ account: account as never, url: file() }), documents: { importPath: vi.fn() } as never });
  users.push(views);
  const state = views.open(owner, accountId, { kind: 'page', url: `${site}/course/view.php?id=2` });
  await vi.waitFor(() => expect(mock.panes.at(-1)!.contents.loadURL).toHaveBeenCalled());
  vi.setSystemTime(1_000_000);
  const { contents } = mock.panes.at(-1)!;
  return { views, owner, state, contents, browser: mock.browsers.at(-1)! };
}
const settle = async () => { for (let turn = 0; turn < 5; turn++) await Promise.resolve(); };
const click = (contents: EventEmitter) => contents.emit('before-mouse-event', { preventDefault: vi.fn() }, { type: 'mouseDown', button: 'left' });
function navigate(contents: EventEmitter, url: string) {
  const event = { preventDefault: vi.fn() };
  contents.emit('will-navigate', event, url);
  return event;
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(1_000_000); mock.panes.length = 0; mock.browsers.length = 0; mock.imports.mockClear(); mock.log.mockClear(); });
afterEach(async () => { for (const views of users.splice(0)) await views.dispose(); vi.useRealTimers(); });

it('does not import a pluginfile navigation that no user input caused', async () => {
  const { contents, state, views, owner } = await open();
  vi.setSystemTime(1_000_000 + 60_000);
  const event = navigate(contents, file());
  await settle();
  expect(event.preventDefault).toHaveBeenCalled();
  expect(mock.imports).not.toHaveBeenCalled();
  expect(views.state(owner, state.id)).toMatchObject({ error: null, documentId: null });
  expect(mock.log).toHaveBeenCalledWith(expect.objectContaining({ phase: 'moodle-webview-import-refused', reason: 'no-gesture' }));
});

it('imports a pluginfile navigation that follows a click and spends that click once', async () => {
  const { contents } = await open();
  vi.setSystemTime(1_000_000 + 60_000);
  click(contents); navigate(contents, file()); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
  navigate(contents, file('b.pdf')); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('treats a keypress as a gesture and lets it expire after ten seconds', async () => {
  const { contents } = await open();
  vi.setSystemTime(1_000_000 + 60_000);
  contents.emit('before-input-event', { preventDefault: vi.fn() }, { type: 'keyDown', key: 'Enter' });
  vi.setSystemTime(1_000_000 + 60_000 + 10_001);
  navigate(contents, file()); await settle();
  expect(mock.imports).not.toHaveBeenCalled();
  contents.emit('before-input-event', { preventDefault: vi.fn() }, { type: 'keyDown', key: 'Enter' });
  vi.setSystemTime(1_000_000 + 60_000 + 20_000);
  navigate(contents, file()); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('gates popups on the same gesture', async () => {
  const { contents } = await open();
  vi.setSystemTime(1_000_000 + 60_000);
  expect(contents.openHandler!({ url: file() })).toEqual({ action: 'deny' }); await settle();
  expect(mock.imports).not.toHaveBeenCalled();
  click(contents);
  expect(contents.openHandler!({ url: file() })).toEqual({ action: 'deny' }); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('cancels scripted downloads and accepts only downloads the browser tied to a gesture', async () => {
  const { contents, browser } = await open();
  const download = (gesture: boolean) => {
    const event = { preventDefault: vi.fn() };
    browser.emit('will-download', event, { getURL: () => file(), hasUserGesture: () => gesture }, contents);
    return event;
  };
  expect(download(false).preventDefault).toHaveBeenCalled(); await settle();
  expect(mock.imports).not.toHaveBeenCalled();
  expect(download(true).preventDefault).toHaveBeenCalled(); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(1);
});

it('keeps the file the user opened from the app importable without a page gesture', async () => {
  const owner = Object.assign(new EventEmitter(), { id: 2, isDestroyed: () => false, focus: vi.fn(), getZoomFactor: () => 1 }) as unknown as WebContents;
  const views = new MoodleWebviews({ account: () => account as never, credentials: async () => ({ token: 't', privateToken: 'p' }), file: () => ({ account: account as never, url: file() }), documents: { importPath: vi.fn() } as never });
  users.push(views);
  views.open(owner, accountId, { kind: 'file', fileId: '1c9b5f0e-0f84-4d4e-8f44-3c1d2a5b6e70' });
  await vi.waitFor(() => expect(mock.imports).toHaveBeenCalledTimes(1));
});

it('refuses the sixth import in a minute with a blocked notice and allows imports again afterwards', async () => {
  const { contents, views, owner, state } = await open(), start = Date.now();
  for (let count = 1; count <= 5; count++) { click(contents); navigate(contents, file(`${count}.pdf`)); await settle(); }
  expect(mock.imports).toHaveBeenCalledTimes(5);
  click(contents); navigate(contents, file('6.pdf')); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(5);
  expect(views.state(owner, state.id)).toMatchObject({ status: 'error', error: 'blocked' });
  expect(mock.log).toHaveBeenCalledWith(expect.objectContaining({ phase: 'moodle-webview-import-refused', reason: 'rate-limit' }));
  vi.setSystemTime(start + 60_001);
  click(contents); navigate(contents, file('7.pdf')); await settle();
  expect(mock.imports).toHaveBeenCalledTimes(6);
});

it('clears the account partition storage on disconnect', async () => {
  const { views, browser } = await open();
  await views.disconnect(accountId);
  expect(browser.clearStorageData).toHaveBeenCalled();
  expect(browser.clearCache).toHaveBeenCalled();
  expect(browser.closeAllConnections).toHaveBeenCalled();
});
