// @vitest-environment jsdom
/** Exercise student-visible setup and privileged boundary payloads without Electron. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { i18n } from '../../shared/i18n';
import { cliFixture } from './test-fixture';
import { desktopPlatform } from '../../shared/platform';
import { manualInstallCommand } from '../../shared/ai-cli-manual';

const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
const terminalStrings = vi.hoisted(() => ({ promptLabel: '', tooMuchOutput: '' }));
const terminal = vi.hoisted(() => ({ writes: [] as string[], resets: 0, data: undefined as ((value: string) => void) | undefined }));
vi.mock('../bridge', () => ({ desktop: bridge }));
vi.mock('../../shared/platform', async importOriginal => ({ ...await importOriginal<typeof import('../../shared/platform')>(), desktopPlatform: vi.fn(() => 'darwin') }));
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  static get strings() { return terminalStrings; }
  options = {}; cols = 80; rows = 24; buffer = { active: { getLine: () => undefined } };
  loadAddon() {} open() {} dispose() {} reset() { terminal.resets++; }
  write(value: string) { terminal.writes.push(value); }
  onData(callback: (value: string) => void) { terminal.data = callback; return { dispose() {} }; }
  registerLinkProvider() { return { dispose() {} }; }
} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
import { AiCliSetup, AiCliSetupHost } from './setup';
import { CliPrivacyPreferences } from './preferences';
import { openAiCliSetup } from './entry';
import { CliTerminal } from './terminal';
import { ProviderChoice } from './choice';
import { terminalDelta } from './model';
import { AiCliInventory } from './inventory';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let fixture: ReturnType<typeof cliFixture>;
let host: HTMLDivElement;
let root: Root;
const close = vi.fn();
function button(text: string) {
  const match = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === text);
  expect(match, `button ${text}`).toBeDefined();
  return match!;
}
async function click(text: string) { await act(async () => button(text).click()); }
async function mount(node = <AiCliSetup onClose={close} />) { await act(async () => root.render(node)); }
async function allow() { await act(async () => document.querySelector<HTMLButtonElement>('button.ai-cli-consent')!.click()); }
const runs = () => fixture.calls.filter(call => call.channel === 'ai-cli:run');
beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.mocked(desktopPlatform).mockReturnValue('darwin');
  fixture = cliFixture(); bridge.invoke.mockReset().mockImplementation(fixture.invoke); close.mockReset();
  terminal.writes = []; terminal.resets = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'); vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each(['claude', 'codex', 'agy'] as const)('guides %s from missing through explicit consent, install, login and test', async provider => {
  await mount(<AiCliSetup initialProvider={provider} onClose={close} />);
  expect(document.body.textContent).toContain('Allow VStudy');
  expect(runs()).toHaveLength(0);
  expect(fixture.calls.some(call => call.channel === 'ai-cli:preview')).toBe(false);
  await allow();
  expect(document.querySelector('.ai-cli-preview')?.textContent).toContain('Download, verify SHA-256');
  expect(document.querySelector('.ai-cli-preview')?.textContent).toContain('/main/owned/folder');
  expect(document.querySelector('.ai-cli-preview')?.textContent).toContain('Action plan');
  expect([...document.querySelectorAll('button')].some(item => item.textContent === 'Open in my own Terminal')).toBe(false);
  expect(runs()).toHaveLength(0);
  await click('Run this plan');
  expect(document.body.textContent).toContain('Connect your account.');
  await click('Run this action');
  expect(document.body.textContent).toContain('Try your first answer.');
  await click('Test it');
  expect(document.body.textContent).toContain('Ready to study');
  expect(document.body.textContent).toContain('Your tool answered. Ready to study.');
  expect(runs().map(call => call.payload.actionId)).toEqual([`install-${provider}`, `login-${provider}`, `test-${provider}`]);
  for (const call of runs()) {
    expect(Object.keys(call.payload).sort()).toEqual(['actionId', 'token']);
    expect(fixture.calls.slice(0, fixture.calls.indexOf(call)).some(previous => previous.channel === 'ai-cli:preview' && previous.payload.actionId === call.payload.actionId)).toBe(true);
  }
});

it('recovers from checksum failure with a fresh preview before retry', async () => {
  fixture.fail('checksum'); await mount(); await allow(); await click('Run this plan');
  expect(document.querySelector('[role=alert]')?.textContent).toContain('integrity check');
  expect(document.querySelector('.ai-cli-recovery')?.textContent).toContain('Copy details');
  fixture.fail(null); await click('Try again');
  expect(runs()).toHaveLength(1);
  await click('Run this plan'); expect(runs()).toHaveLength(2);
  expect(document.body.textContent).toContain('Connect your account.');
});

it('stops a running action and closes the session when the sheet closes', async () => {
  fixture.hold(true); await mount(); await allow(); await click('Run this plan');
  await click('Stop this action');
  expect(fixture.calls.filter(call => call.channel === 'ai-cli:close')).toHaveLength(1);
  expect(document.body.textContent).toContain('Stopped.');
  await click('Run this plan');
  const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close setup and stop its action"]')!;
  await act(async () => closeButton.click());
  expect(close).toHaveBeenCalledOnce();
  expect(fixture.calls.filter(call => call.channel === 'ai-cli:close')).toHaveLength(2);
});

it('keeps output inert, shows login URLs, and sends them through external confirmation', async () => {
  fixture.output('<img src=x onerror="alert(1)">\nhttps://auth.openai.com/device\nDevice code ABCD-EFGH');
  await mount(); await allow(); await click('Run this plan');
  expect(document.querySelector('.ai-cli-output')?.textContent).toContain('<img src=x');
  expect(document.querySelector('.ai-cli-output img')).toBeNull();
  expect(document.body.textContent).toContain('ABCD-EFGH');
  expect(fixture.calls.some(call => call.channel === 'shell:openExternal')).toBe(false);
  await click('https://auth.openai.com/device');
  expect(fixture.calls.at(-1)).toEqual({ channel: 'shell:openExternal', payload: { url: 'https://auth.openai.com/device' } });
});

it('previews compatible updates and one-click rollback without disturbing existing chats', async () => {
  Object.assign(fixture.tools[0]!, { consented: true, tested: true, managed: true, version: '1.0.0', latestVersion: '2.0.0', status: 'update-available', releaseNotesUrl: 'https://example.com/release' });
  await mount(); await click('Review update to 2.0.0');
  expect(runs()).toHaveLength(0);
  await click('Run this plan');
  expect(document.body.textContent).toContain('Ongoing sessions continue');
  await click('Review rollback to 1.0.0'); await click('Run this plan');
  expect(runs().map(call => call.payload.actionId)).toEqual(['update-claude', 'rollback-claude']);
  expect(fixture.tools[0]!.version).toBe('1.0.0');
  await click('Release notes'); expect(fixture.calls.at(-1)?.channel).toBe('shell:openExternal');
});

it('does not offer an incompatible update', async () => {
  Object.assign(fixture.tools[0]!, { consented: true, version: '1.0.0', latestVersion: '2.0.0', status: 'update-available', tested: true });
  fixture.compatible(false); await mount();
  expect(document.body.textContent).toContain('not supported by VStudy');
  expect(document.body.textContent).not.toContain('Review update to 2.0.0');
  expect(runs()).toHaveLength(0);
});

it.each(['en', 'zh-Hant', 'ja'].flatMap(language => (['claude', 'codex', 'agy'] as const).map(provider => ({ language, provider }))))('guides manual installation for $provider in $language without executing the download', async ({ language, provider }) => {
  await i18n.changeLanguage(language);
  Object.assign(fixture.tools.find(tool => tool.provider === provider)!, { manualInstallRequired: true, manualUpdateRequired: true });
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    await mount(<AiCliSetup initialProvider={provider} onClose={close} />);
    expect(document.querySelector<HTMLDetailsElement>('.ai-cli-action-area details')?.open).toBe(true);
    const command = manualInstallCommand(provider, desktopPlatform());
    expect(command).not.toBeNull();
    expect(document.querySelector('.ai-cli-action-area code')?.textContent).toBe(command);
    expect(document.body.textContent!.split(i18n.t('ai-cli:manual_install_reason'))).toHaveLength(2);
    expect(document.querySelector('.ai-cli-manual-steps')?.textContent).toBe(['manual_step_copy', 'manual_step_terminal', 'manual_step_return'].map(key => i18n.t(`ai-cli:${key}`)).join(''));
    expect(document.querySelectorAll('.ai-cli-manual-steps li')).toHaveLength(3);
    expect(document.querySelector('.ai-cli-consent')?.textContent).toContain(i18n.t('ai-cli:consent_manual', { provider: provider === 'claude' ? 'Claude Code' : provider === 'codex' ? 'Codex' : 'Antigravity' }));
    expect(button(i18n.t('ai-cli:check_again')).dataset.variant).toBe('default');
    expect(button(i18n.t('ai-cli:open_terminal')).disabled).toBe(false);
    expect(document.querySelector('.ai-cli-workarea')?.textContent).not.toMatch(/managed copy|executable|reviewed action/i);
    await click(i18n.t('ai-cli:copy_command'));
    expect(writeText).toHaveBeenCalledWith(command);
    await click(i18n.t('ai-cli:official_source'));
    expect(fixture.calls.at(-1)).toEqual({ channel: 'shell:openExternal', payload: { url: { claude: 'https://code.claude.com/docs/en/setup', codex: 'https://developers.openai.com/codex/cli', agy: 'https://antigravity.google/docs/getting-started?tab=cli' }[provider] } });
    expect(fixture.calls.some(call => call.channel === 'ai-cli:preview')).toBe(false);
    await click(i18n.t('ai-cli:open_terminal'));
    expect(fixture.calls.at(-1)).toEqual({ channel: 'ai-cli:openTerminal', payload: { actionId: `terminal-${provider}`, token: '11111111-1111-4111-8111-111111111111' } });
    expect(document.body.textContent).toContain(i18n.t('ai-cli:manual_terminal_opened'));
    expect(runs()).toHaveLength(0);
  } finally { Reflect.deleteProperty(navigator, 'clipboard'); }
});

it('keeps unpinned updates manual and routes the vendor link through external confirmation', async () => {
  Object.assign(fixture.tools[0]!, { consented: true, tested: true, managed: true, version: '1.0.0', latestVersion: '2.0.0', status: 'update-available', manualUpdateRequired: true, releaseNotesUrl: 'https://example.com/release' });
  await mount();
  expect(document.body.textContent).toContain('New version available: install it yourself');
  expect(fixture.calls.some(call => call.channel === 'ai-cli:preview')).toBe(false);
  await act(async () => root.render(<AiCliInventory />));
  expect(document.querySelector('.ai-cli-versions')).toBeNull();
  await act(async () => root.render(<AiCliSetup onClose={close} />));
  await click(i18n.t('ai-cli:release_notes'));
  expect(fixture.calls.at(-1)).toEqual({ channel: 'shell:openExternal', payload: { url: 'https://example.com/release' } });
  expect(runs()).toHaveLength(0);
});

it('shows one Settings summary and opens the recommended tool through setup', async () => {
  Object.assign(fixture.tools[1]!, { version: '2.1.0', status: 'ready', consented: true, tested: true });
  await mount(<AiCliInventory settings />);
  expect(document.querySelectorAll('.ai-cli-tool')).toHaveLength(0);
  expect(document.querySelector('[role=status]')?.textContent).toBe('Codex · Ready to study');
  expect(document.querySelector('details')).toBeNull();
  await mount(<AiCliSetup onClose={close} />);
  expect(document.querySelector('.ai-cli-tool-heading strong')?.textContent).toBe('Codex');
  expect(document.querySelector<HTMLDetailsElement>('.ai-cli-more')?.open).toBe(false);
});

it.each(['en', 'zh-Hant', 'ja'].flatMap(language => (['claude', 'agy'] as const).map(provider => ({ language, provider }))))('shows Windows installation steps for $provider in $language', async ({ language, provider }) => {
  await i18n.changeLanguage(language);
  vi.mocked(desktopPlatform).mockReturnValue('win32');
  Object.assign(fixture.tools.find(tool => tool.provider === provider)!, { manualInstallRequired: true });
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    await mount(<AiCliSetup initialProvider={provider} onClose={close} />);
    expect(document.querySelector('.ai-cli-manual-steps')?.textContent).toContain('Windows Terminal');
    expect(document.querySelector('.ai-cli-manual-steps')?.textContent).toContain('Enter');
    const command = provider === 'claude' ? 'irm https://claude.ai/install.ps1 | iex' : 'irm https://antigravity.google/cli/install.ps1 | iex';
    expect(document.querySelector('.ai-cli-action-area code')?.textContent).toBe(command);
    await click(i18n.t('ai-cli:copy_command'));
    expect(writeText).toHaveBeenCalledWith(command);
    await click(i18n.t('ai-cli:open_terminal_windows'));
    expect(fixture.calls.at(-1)).toEqual({ channel: 'ai-cli:openTerminal', payload: { actionId: `terminal-${provider}`, token: '11111111-1111-4111-8111-111111111111' } });
    expect(runs()).toHaveLength(0);
  } finally { Reflect.deleteProperty(navigator, 'clipboard'); }
});

it('checks installed files again and moves to sign-in without running the newly found tool', async () => {
  Object.assign(fixture.tools[2]!, { consented: true, manualInstallRequired: true });
  await mount(<AiCliSetup initialProvider="agy" onClose={close} />);
  await click('Check again');
  expect(document.body.textContent).toContain("We haven't found it yet.");
  Object.assign(fixture.tools[2]!, { path: '/newly/installed/agy', status: 'installed-not-signed-in' });
  const checks = fixture.calls.filter(call => call.channel === 'ai-cli:list').length;
  await click('Check again');
  expect(fixture.calls.filter(call => call.channel === 'ai-cli:list')).toHaveLength(checks + 1);
  expect(document.querySelector('.ai-cli-steps [aria-current=step]')?.textContent).toContain('Sign in');
  expect(fixture.calls.at(-1)?.payload.actionId).toBe('login-agy');
  expect(runs()).toHaveLength(0);
});

it('keeps other Unix terminal instructions platform-neutral and Codex unavailable outside macOS', async () => {
  vi.mocked(desktopPlatform).mockReturnValue('linux');
  Object.assign(fixture.tools[2]!, { manualInstallRequired: true });
  Object.assign(fixture.tools[1]!, { manualInstallRequired: true });
  await mount(<AiCliSetup initialProvider="agy" onClose={close} />);
  expect(document.querySelector('.ai-cli-manual-steps')?.textContent).toContain('Open your terminal, paste it and press Enter.');
  expect(document.querySelector('.ai-cli-manual-steps')?.textContent).not.toContain('Mac');
  await act(async () => document.querySelectorAll<HTMLInputElement>('input[name=ai-cli-provider]')[1]!.click());
  expect(document.querySelector('.ai-cli-action-area')?.textContent).toContain('not supported on this device');
  expect(document.querySelector('.ai-cli-action-area [data-manual-terminal]')).toBeNull();
});

it('opens a manual terminal only with the preview capability, and treats cancellation as normal', async () => {
  Object.assign(fixture.tools[2]!, { manualInstallRequired: true });
  bridge.invoke.mockImplementation(async (channel, payload) => {
    const response = await fixture.invoke(channel, payload);
    return channel === 'ai-cli:openTerminal' ? { ok: false } : response;
  });
  await mount(<AiCliSetup initialProvider="agy" onClose={close} />);
  await click('Open Terminal');
  expect(fixture.calls.slice(-2)).toEqual([
    { channel: 'ai-cli:preview', payload: { actionId: 'terminal-agy' } },
    { channel: 'ai-cli:openTerminal', payload: { actionId: 'terminal-agy', token: '11111111-1111-4111-8111-111111111111' } },
  ]);
  expect(document.body.textContent).not.toContain('Your terminal is open');
  expect(document.querySelector('[role=alert]')).toBeNull();
  expect(fixture.tools[2]!.consented).toBe(false);
  expect(runs()).toHaveLength(0);
});

it('does not open a late manual terminal preview after setup closes', async () => {
  Object.assign(fixture.tools[2]!, { manualInstallRequired: true });
  let finish!: (value: unknown) => void;
  bridge.invoke.mockImplementation((channel, payload) => channel === 'ai-cli:preview' ? new Promise(resolve => { finish = resolve; }) : fixture.invoke(channel, payload));
  await mount(<AiCliSetup initialProvider="agy" onClose={close} />);
  await click('Open Terminal');
  await act(async () => root.render(null));
  await act(async () => finish({ actionId: 'terminal-agy', available: true, token: '11111111-1111-4111-8111-111111111111' }));
  expect(fixture.calls.some(call => call.channel === 'ai-cli:openTerminal')).toBe(false);
  expect(runs()).toHaveLength(0);
});

it('offers current account plans through the existing confirmed link boundary', async () => {
  await mount(<ProviderChoice />);
  await act(async () => document.querySelector('summary')!.click());
  expect(document.body.textContent).toContain('Installing a tool is free.');
  await click('Check Antigravity plans');
  expect(fixture.calls.at(-1)).toEqual({ channel: 'shell:openExternal', payload: { url: 'https://antigravity.google/pricing' } });
});

it('persists separate default-off privacy opt-ins and permits an explicit single update check', async () => {
  await mount(<CliPrivacyPreferences />);
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  expect(inputs).toHaveLength(3); expect(inputs.every(input => !input.checked)).toBe(true);
  await click('Check for updates now');
  expect(fixture.calls.some(call => call.channel === 'ai-cli:setPreferences')).toBe(false);
  for (const input of inputs) await act(async () => input.click());
  const saves = fixture.calls.filter(call => call.channel === 'ai-cli:setPreferences');
  expect(saves.at(-1)?.payload).toEqual({ updateChecks: true, autoUpdateWhenIdle: true, advancedShell: true });
});

it('opens the same global host through the exported entry seam', async () => {
  await mount(<AiCliSetupHost />); expect(document.querySelector('[role=dialog]')).toBeNull();
  await act(async () => openAiCliSetup('codex'));
  expect(document.querySelector<HTMLInputElement>('input[name=ai-cli-provider]:checked')?.parentElement?.textContent).toContain('Codex');
  await act(async () => openAiCliSetup('agy'));
  expect(document.querySelector<HTMLInputElement>('input[name=ai-cli-provider]:checked')?.parentElement?.textContent).toContain('Antigravity');
});

it.each(['en', 'zh-Hant', 'ja', 'en-XA'])('loads all setup copy in %s without namespace fallbacks', async language => {
  await i18n.changeLanguage(language); await mount();
  expect(document.body.textContent).not.toContain('ai-cli:');
});

it('appends only new terminal output, resets an evicted snapshot, and rejects input after completion', async () => {
  const session = { id: crypto.randomUUID(), actionId: 'login-codex' as const, phase: 'running' as const, output: 'one', truncated: false, exitCode: null, error: null };
  await mount(<CliTerminal session={session} />);
  await act(async () => root.render(<CliTerminal session={{ ...session, output: 'one two' }} />));
  expect(terminal.writes).toEqual(['one', ' two']);
  await act(async () => terminal.data?.('hello'));
  expect(fixture.calls.at(-1)).toEqual({ channel: 'ai-cli:input', payload: { id: session.id, data: 'hello' } });
  await act(async () => root.render(<CliTerminal session={{ ...session, output: 'two', phase: 'succeeded' }} />));
  expect(terminal.resets).toBe(1);
  const before = fixture.calls.length; await act(async () => terminal.data?.('blocked'));
  expect(fixture.calls).toHaveLength(before);
  expect(terminalDelta('same', 'same')).toEqual({ reset: false, text: '' });
});

it('guides an existing unprobed binary to sign-in without requiring a version probe first', async () => {
  Object.assign(fixture.tools[0]!, { consented: true, path: '/existing/claude', status: 'installed-not-signed-in' });
  await mount();
  expect(document.body.textContent).toContain('Connect your account.');
  expect(fixture.calls.find(call => call.channel === 'ai-cli:preview')?.payload.actionId).toBe('login-claude');
  expect(runs()).toHaveLength(0);
});

it('pauses session polling while hidden and resumes when visible', async () => {
  vi.useFakeTimers(); fixture.hold(true); await mount(); await allow(); await click('Run this plan');
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  const reads = () => fixture.calls.filter(call => call.channel === 'ai-cli:read').length;
  const before = reads(); await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(reads()).toBe(before);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(reads()).toBe(before + 1);
});

it('closes a session that finishes launching after its sheet is unmounted', async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise<unknown>(done => { resolve = done; });
  bridge.invoke.mockImplementation((channel, payload) => channel === 'ai-cli:run' ? pending : fixture.invoke(channel, payload));
  await mount(); await allow(); await click('Run this plan');
  await act(async () => root.render(null));
  const id = crypto.randomUUID();
  await act(async () => resolve({ id, actionId: 'install-claude', phase: 'running', output: '', truncated: false, exitCode: null, error: null }));
  expect(fixture.calls.at(-1)).toEqual({ channel: 'ai-cli:close', payload: { id } });
});

it('keeps the advanced shell disabled without its separate preference', async () => {
  await mount();
  expect(button('Review advanced shell action').disabled).toBe(true);
  expect(document.body.textContent).toContain('change or delete files');
  expect(runs()).toHaveLength(0);
});

it('previews the opted-in advanced shell separately from provider consent', async () => {
  await fixture.invoke('ai-cli:setPreferences', { updateChecks: false, autoUpdateWhenIdle: false, advancedShell: true });
  await mount(); await click('Review advanced shell action');
  expect(document.querySelector('.ai-cli-preview code')?.textContent).toContain('advanced-shell');
  expect(fixture.tools[0]!.consented).toBe(false);
  expect(runs()).toHaveLength(0);
  await click('Run this action');
  expect(runs()[0]?.payload.actionId).toBe('advanced-shell');
});

it('offers the main-owned command in an external terminal only after preview', async () => {
  Object.assign(fixture.tools[0]!, { consented: true, path: '/existing/claude', status: 'installed-not-signed-in' });
  await mount(); await click('Open in my own Terminal');
  const external = fixture.calls.find(call => call.channel === 'ai-cli:openTerminal');
  expect(external?.payload).toEqual({ actionId: 'login-claude', token: '11111111-1111-4111-8111-111111111111' });
  expect(document.body.textContent).toContain('Your terminal is open and the command is copied.');
  expect(runs()).toHaveLength(0);
});

it('keeps a manual terminal fallback when embedded sign-in is unsupported', async () => {
  Object.assign(fixture.tools[0]!, { consented: true, path: '/existing/claude', status: 'installed-not-signed-in' });
  bridge.invoke.mockImplementation(async (channel, payload) => {
    const response = await fixture.invoke(channel, payload);
    return channel === 'ai-cli:preview' ? { ...response, available: false, reason: 'unsupported' } : response;
  });
  await mount();
  expect(button('Run this action').disabled).toBe(true);
  expect(button('Open in my own Terminal').disabled).toBe(false);
  await click('Open in my own Terminal');
  expect(runs()).toHaveLength(0);
  expect(fixture.calls.some(call => call.channel === 'ai-cli:openTerminal')).toBe(true);
});

it('recovers an unsupported existing Codex version by offering the audited managed install', async () => {
  Object.assign(fixture.tools[1]!, { consented: true, path: '/existing/codex', version: '0.167.0', status: 'error', error: { code: 'wrong-version', hint: 'wrong-version' } });
  await mount(<AiCliSetup initialProvider="codex" onClose={close} />);
  expect(document.querySelector('.ai-cli-steps [aria-current=step]')?.textContent).toContain('Install');
  await click('Run this plan');
  expect(runs()[0]?.payload.actionId).toBe('install-codex');
});

it.each(['en', 'zh-Hant'])('keeps the three guided steps visible and advanced options closed in %s', async language => {
  await i18n.changeLanguage(language); await mount();
  expect(document.querySelectorAll('.ai-cli-steps li')).toHaveLength(3);
  expect(document.querySelectorAll('.ai-cli-steps [aria-current=step]')).toHaveLength(1);
  expect(document.querySelector<HTMLDetailsElement>('.ai-cli-more')?.open).toBe(false);
  expect(document.querySelector('.ai-cli-workarea')?.textContent).not.toMatch(/CLI|PATH|MCP/);
});
it('copies redacted details beside the failed action and offers sign-in recovery', async () => {
  Object.assign(fixture.tools[0]!, { consented: true, path: '/existing/claude', version: '1.0.0', status: 'ready' });
  fixture.fail('login-expired'); fixture.output('expired token=secret123 /Users/student/private');
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    await mount(); await click('Test it');
    expect(document.querySelector('.ai-cli-action-area [role=alert]')?.textContent).toContain('Your sign-in expired');
    await click('Copy details');
    expect(writeText.mock.calls[0]?.[0]).toContain('Exit code: 1');
    expect(writeText.mock.calls[0]?.[0]).not.toMatch(/secret123|student|Users/);
    const recovery = document.querySelector<HTMLButtonElement>('.ai-cli-recovery button')!;
    await act(async () => recovery.click());
    expect(fixture.calls.at(-1)?.payload.actionId).toBe('login-claude');
  } finally { Reflect.deleteProperty(navigator, 'clipboard'); }
});

it('previews only the detected recommendation when another tool already has consent', async () => {
  fixture.tools[0]!.consented = true;
  Object.assign(fixture.tools[1]!, { consented: true, version: '0.166.0', status: 'installed-not-signed-in' });
  await mount();
  expect(fixture.calls.filter(call => call.channel === 'ai-cli:preview').map(call => call.payload.actionId)).toEqual(['login-codex']);
});
