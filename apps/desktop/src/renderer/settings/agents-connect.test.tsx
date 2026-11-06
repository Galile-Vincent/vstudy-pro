// @vitest-environment jsdom
/** Client installation changes configuration only after the user reviews a preview and installs it. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { i18n } from '../../shared/i18n';
import { AgentConnect } from './agents-connect';
import { button, click } from './agents-test-helpers';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const client = { client: 'codex', detected: true, configPath: '/home/student/.codex/config.toml', command: 'vstudy-mcp install --client codex' };
const diff = '+ [mcp_servers.vstudy]\n+ command = "vstudy-mcp"';
beforeEach(async () => {
  await i18n.changeLanguage('en');
  invoke.mockReset().mockImplementation(async (channel, request) => {
    if (channel === 'mcp:clients') return [client, { ...client, client: 'cursor', detected: false }];
    if (channel === 'mcp:install') return { diff, changed: request.dryRun };
    if (channel === 'mcp:doctor') return { ok: false, checks: [{ name: 'bridge', ok: false, detail: 'Open VStudy.' }] };
  });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
const mount = () => act(() => root.render(<AgentConnect onClose={() => {}} />));

it('shows detected clients and copies the exact command without installing', async () => {
  await mount();
  expect(document.body.textContent).toContain('Detected on this computer');
  expect(document.body.textContent).toContain('Not detected');
  expect([...document.querySelectorAll('button')].filter(b => b.textContent === 'Preview change')).toHaveLength(1);
  await click('Copy command');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(client.command);
  expect(document.body.textContent).toContain('Command copied.');
  expect(invoke.mock.calls).toEqual([['mcp:clients', {}]]);
});

it('shows a literal diff before a separate explicit install, then runs doctor', async () => {
  await mount();
  expect(document.body.textContent).not.toContain('Install this change');
  await click('Preview change');
  expect(invoke).toHaveBeenCalledWith('mcp:install', { client: 'codex', dryRun: true });
  expect(document.querySelector('pre')?.textContent).toBe(diff);
  expect(invoke.mock.calls.filter(([channel]) => channel === 'mcp:install')).toHaveLength(1);
  await click('Install this change');
  expect(invoke).toHaveBeenCalledWith('mcp:install', { client: 'codex', dryRun: false });
  expect(document.body.textContent).toContain('Configuration installed.');
  await click('Test connection');
  expect(invoke).toHaveBeenCalledWith('mcp:doctor', {});
  expect(document.body.textContent).toContain('Some connection checks need attention.');
  expect(document.body.textContent).toContain('Open VStudy.');
});

it('blocks repeat preview and install clicks while the IPC is pending', async () => {
  await mount();
  let release!: (value: { diff: string; changed: boolean }) => void;
  invoke.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await act(() => { button('Preview change').click(); button('Preview change').click(); });
  expect(button('Preview change').disabled).toBe(true);
  expect(invoke.mock.calls.filter(([channel]) => channel === 'mcp:install')).toHaveLength(1);
  await act(() => release({ diff, changed: true }));
  invoke.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await act(() => { const install = button('Install this change'); install.click(); install.click(); });
  expect(invoke.mock.calls.filter(([channel]) => channel === 'mcp:install')).toHaveLength(2);
  await act(() => release({ diff, changed: true }));
});

it('requires another preview after an install error and never displays the raw error', async () => {
  await mount(); await click('Preview change');
  invoke.mockRejectedValueOnce(new Error('secret path and token'));
  await click('Install this change');
  expect(document.body.textContent).not.toContain('secret path');
  expect(document.body.textContent).not.toContain('Install this change');
  expect(document.body.textContent).toContain('Preview it again');
  expect(button('Preview change').disabled).toBe(false);
});

it('does not offer an install for an unchanged preview and keeps injected text inert', async () => {
  await mount();
  invoke.mockResolvedValueOnce({ diff: '<script>throw "unsafe"</script><a href="https://evil.test">link</a>', changed: false });
  await click('Preview change');
  expect(document.body.textContent).not.toContain('Install this change');
  expect(document.querySelector('pre')?.textContent).toContain('<script>');
  expect(document.querySelector('script,a')).toBeNull();
});

it('recovers from a client discovery error and keeps copy failures actionable', async () => {
  invoke.mockRejectedValueOnce(new Error('secret'));
  await mount();
  expect(document.body.textContent).toContain('Could not load client configurations.');
  await click('Refresh');
  vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('secret'));
  await click('Copy command');
  expect(document.body.textContent).toContain('Select and copy the text below.');
  expect(document.body.textContent).not.toContain('secret');
});
