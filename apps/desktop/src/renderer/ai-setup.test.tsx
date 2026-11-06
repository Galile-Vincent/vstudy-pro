// @vitest-environment jsdom
/** Verify that students can escape unavailable AI and find account-free reading and school support. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { i18n } from '../shared/i18n';
import { AiSetupGuide, AiSetupNotice } from './ai-setup';
import { ModelControls } from './model-controls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement('div');
document.body.append(host);
const root = createRoot(host);
afterEach(async () => { await act(async () => root.render(null)); });

it.each(['en', 'zh-Hant', 'ja'])('explains optional AI and gives a working settings action in %s', async language => {
  await i18n.changeLanguage(language);
  const onSettings = vi.fn();
  await act(async () => root.render(<AiSetupNotice onSettings={onSettings} />));
  expect(host.querySelector('p')?.textContent).toBe(i18n.t('novice:without_ai'));
  expect(host.textContent).not.toContain('novice:');
  await act(async () => host.querySelector('button')!.click());
  expect(onSettings).toHaveBeenCalledOnce();
});

it('offers setup when no models exist instead of stranding the student in an empty picker', async () => {
  await i18n.changeLanguage('en');
  const onSettings = vi.fn();
  await act(async () => root.render(<ModelControls providers={[]} model="" onModel={vi.fn()} onSettings={onSettings} />));
  const setup = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Set up AI help');
  expect(setup).toBeDefined();
  await act(async () => setup!.click());
  expect(onSettings).toHaveBeenCalledOnce();
});

it('offers connection testing, a question, and a teacher fallback after the settings intro', async () => {
  await i18n.changeLanguage('en');
  const onClose = vi.fn();
  await act(async () => root.render(<AiSetupGuide onClose={onClose} />));
  const steps = [...host.querySelectorAll('li')].map(item => item.textContent);
  expect(steps).toHaveLength(1);
  expect(steps[0]).toContain('Test connection');
  expect(steps[0]).toContain('ask a question');
  expect(host.querySelector('blockquote')?.textContent).toContain('Does our school provide an approved AI service');
  for (const key of ['privacy', 'step_access', 'step_key']) {
    expect(host.textContent).not.toContain(i18n.t(`novice:${key}`));
  }
  await act(async () => host.querySelector('button')!.click());
  expect(onClose).toHaveBeenCalledOnce();
});
