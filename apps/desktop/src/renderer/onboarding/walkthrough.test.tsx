// @vitest-environment jsdom
import '../astryx-test-dom';
/** Captions remain usable with reduced motion, paused playback, and replay after completion. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Walkthrough } from './walkthrough';
import { i18n } from '../../shared/i18n';
vi.mock('./progress', () => ({ markLearned: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root, reduced = false;
beforeEach(async () => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }) });
  await i18n.changeLanguage('en');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); reduced = false; });
const button = (name: string) => Array.from(host.querySelectorAll('button')).find(node => node.textContent === name)!;
const active = () => host.querySelector('[data-active=true]')?.textContent;
it('pauses captions and restarts playback from the beginning after completion', async () => {
  await act(async () => root.render(<Walkthrough lesson="school"/>));
  await act(async () => button('Pause').click());
  await act(async () => vi.advanceTimersByTime(15000));
  expect(active()).toContain('Courses');
  await act(async () => button('Play').click());
  await act(async () => vi.advanceTimersByTime(5000));
  expect(active()).toContain('Find your school');
  await act(async () => vi.advanceTimersByTime(5000));
  expect(active()).toContain('Sync courses');
  await act(async () => button('Play').click());
  expect(active()).toContain('Courses');
  expect(host.querySelector('.walkthrough')?.getAttribute('data-playing')).toBe('true');
});
it('starts static with the transcript open when reduced motion is requested', async () => {
  reduced = true;
  await act(async () => root.render(<Walkthrough lesson="selection"/>));
  expect(host.querySelector('details')?.open).toBe(true);
  expect(host.querySelector('.walkthrough')?.getAttribute('data-playing')).toBe('false');
  await act(async () => vi.advanceTimersByTime(20000));
  expect(active()).toContain('Open a document');
  await act(async () => button('Next caption').click());
  expect(active()).toContain('Select a sentence');
});

it('teaches global History search and the Escape return path in every language', async () => {
  for (const language of ['en', 'zh-Hant', 'ja', 'en-XA']) {
    await act(async () => { await i18n.changeLanguage(language); root.render(<Walkthrough key={language} lesson="history"/>); });
    const text = host.querySelector('.walkthrough-transcript')!.textContent!;
    expect(text).toMatch(/(?:Cmd|Ctrl)\+K/);
    expect(text).toMatch(/Escape|Ëscápë/);
    expect(text).not.toContain('ux:');
    expect(text).not.toContain('not all coursework');
  }
});
