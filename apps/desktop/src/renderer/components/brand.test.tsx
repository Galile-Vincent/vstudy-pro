// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { i18n } from '../../shared/i18n';
import { Brand } from './brand';

beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(cleanup);

it('shows an optional beta badge inside the decorative sidebar symbol', () => {
  const { container } = render(<Brand beta/>);
  expect(screen.getByText('beta')).toBeTruthy();
  expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
});

it('leaves the avatar fallback unbadged by default', () => {
  render(<span className="art-reader-avatar"><Brand/></span>);
  expect(screen.queryByText('beta')).toBeNull();
});

it('updates the badge when the interface language changes', async () => {
  render(<Brand beta/>);
  await act(async () => { await i18n.changeLanguage('zh-Hant'); });
  expect(screen.getByText('測試版')).toBeTruthy();
  await act(async () => { await i18n.changeLanguage('ja'); });
  expect(screen.getByText('ベータ')).toBeTruthy();
});
