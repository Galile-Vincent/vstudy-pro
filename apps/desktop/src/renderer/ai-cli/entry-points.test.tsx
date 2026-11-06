// @vitest-environment jsdom
/** Prove the Reader's existing settings route hands off to one usable global setup dialog. */
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { i18n } from '../../shared/i18n';
import { cliFixture } from './test-fixture';
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: bridge }));
vi.mock('@xterm/xterm', () => ({ Terminal: class {} }));
import { ProviderSettings } from '../providers';
import { ReaderOfflineNotice } from '../workspace/offline-notice';
import { AiCliSetupHost } from './setup';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('mounts Settings without ResizeObserver and reaches guided setup from the Reader', async () => {
  expect(typeof ResizeObserver).toBe('undefined');
  await i18n.changeLanguage('en');
  bridge.invoke.mockImplementation(cliFixture().invoke);
  function ReaderWithSettings() {
    const [open, setOpen] = useState(false);
    return <><ReaderOfflineNotice onSettings={() => setOpen(true)} />{open && <ProviderSettings initialTab="providers" providers={[]} onRefresh={async () => {}} onClose={() => setOpen(false)} />}<AiCliSetupHost /></>;
  }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<ReaderWithSettings />));
    await act(async () => host.querySelector<HTMLButtonElement>('.art-reader-offline-actions button')!.click());
    expect(document.querySelector('.settings-tabs[role=tablist]')).not.toBeNull();
    const intro = document.querySelector('.settings-intro')!;
    expect([...intro.querySelectorAll('ol > li')].map(item => item.textContent)).toEqual([i18n.t('novice:step_access'), i18n.t('novice:step_key')]);
    for (const key of ['privacy', 'step_access', 'step_key']) {
      expect(document.querySelector('.settings-pane:not([hidden])')!.textContent!.split(i18n.t(`novice:${key}`))).toHaveLength(2);
    }
    expect(intro.textContent).not.toContain(i18n.t('settings:key_help'));
    expect(intro.textContent).not.toContain(i18n.t('settings:keychain_help'));
    await act(async () => document.querySelector<HTMLButtonElement>('.settings-dialog .ai-cli-inventory-entry')!.click());
    expect(document.querySelector('.settings-dialog')).toBeNull();
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1);
    expect(document.querySelector('.ai-cli-sheet')).not.toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('opens setup directly from the Reader no-AI card', async () => {
  await i18n.changeLanguage('en');
  bridge.invoke.mockImplementation(cliFixture().invoke);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<><ReaderOfflineNotice onSettings={() => {}} /><AiCliSetupHost /></>));
    const entry = [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === 'Guided AI tool setup');
    await act(async () => entry!.click());
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1);
    expect(document.querySelector('.ai-cli-sheet')).not.toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
