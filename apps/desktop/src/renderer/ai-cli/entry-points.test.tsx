// @vitest-environment jsdom
/** Prove the Reader's existing settings route hands off to one usable global setup dialog. */
import { act } from 'react';
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
it('shows API setup content directly and keeps only the guide in a disclosure', async () => {
  await i18n.changeLanguage('en'); bridge.invoke.mockImplementation(cliFixture().invoke);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<ProviderSettings initialTab="providers" providers={[]} onRefresh={async () => {}} onClose={() => {}} />));
    expect(document.querySelector<HTMLDetailsElement>('.settings-pane:not([hidden]) > div > details')?.open).toBe(false);
    expect(document.querySelector('.settings-intro')?.closest('details')).toBeNull();
    expect(document.querySelectorAll('.settings-pane:not([hidden]) details')).toHaveLength(1);
    expect(document.querySelector('.settings-tabs [role=tablist]')).not.toBeNull();
    expect([...document.querySelectorAll('[data-slot=setting-row] label')].some(label => label.textContent === i18n.t('ai-cli:tools'))).toBe(false);
    expect(document.querySelector('.settings-pane:not([hidden]) [role=status]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it.each(['art-reader:setup', 'ai-cli:wizard'])('opens current Connect AI setup from the Reader %s action', async key => {
  await i18n.changeLanguage('en');
  bridge.invoke.mockImplementation(cliFixture().invoke);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<><ReaderOfflineNotice /><AiCliSetupHost /></>));
    expect(host.querySelectorAll('.art-reader-offline-actions button')).toHaveLength(3);
    const entry = [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === i18n.t(key));
    await act(async () => entry!.click());
    expect(document.querySelectorAll('dialog[open]')).toHaveLength(1);
    expect(document.querySelector('.ai-cli-sheet')).not.toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
