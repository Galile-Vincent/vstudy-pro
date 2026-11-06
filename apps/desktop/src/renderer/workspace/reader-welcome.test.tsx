// @vitest-environment jsdom
/** Prompt actions keep real document and selection context across supported languages. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { i18n } from '../../shared/i18n';
import { ReaderWelcome } from './reader-welcome';
import { ReaderOfflineNotice } from './offline-notice';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it.each(['en','zh-Hant','ja','en-XA'])('offers three prompts scoped to the selected passage in %s', async language => {
  await i18n.changeLanguage(language);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), onQuestion = vi.fn();
  try {
    await act(async () => root.render(<ReaderWelcome title="Attention & memory" hasSelection onQuestion={onQuestion}/>));
    const buttons = host.querySelectorAll<HTMLButtonElement>('[data-slot=suggestions] button');
    expect(buttons).toHaveLength(3);
    for (const button of buttons) await act(async () => button.click());
    for (const [prompt] of onQuestion.mock.calls) {
      expect(prompt).toContain('Attention & memory');
      expect(prompt).toContain(i18n.t('art-reader:selected_passage'));
    }
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('allows reading without AI and keeps the setup action explicit', async () => {
  await i18n.changeLanguage('en');
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), setup = vi.fn(), read = vi.fn();
  window.addEventListener('vstudy:read-without-ai', read);
  try {
    await act(async () => root.render(<ReaderOfflineNotice onSettings={setup}/>));
    await act(async () => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === i18n.t('art-reader:setup'))!.click());
    expect(setup).toHaveBeenCalledOnce();
    await act(async () => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === i18n.t('art-reader:without_ai'))!.click());
    expect(read).toHaveBeenCalledOnce();
    expect(host.querySelector('aside')).toBeNull();
  } finally { window.removeEventListener('vstudy:read-without-ai', read); await act(async () => root.unmount()); host.remove(); }
});
