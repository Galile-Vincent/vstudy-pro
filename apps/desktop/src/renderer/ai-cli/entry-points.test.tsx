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
it('reaches guided setup from the Reader with no covering settings dialog', async () => {
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
    expect(document.querySelector('.settings-dialog')).not.toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('.settings-dialog .ai-cli-inventory-entry')!.click());
    expect(document.querySelector('.settings-dialog')).toBeNull();
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1);
    expect(document.querySelector('.ai-cli-sheet')).not.toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
