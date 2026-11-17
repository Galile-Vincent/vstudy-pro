// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { version } from '../../../package.json';
import { i18n } from '../../shared/i18n';
import { AppVersion } from './app-version';

beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(cleanup);

it('shows the package version beside a separate beta badge', () => {
  const { container } = render(<AppVersion/>);
  const label = screen.getByText(`v${version}`);
  const badge = screen.getByText('beta');
  expect(label).not.toBe(badge);
  expect(label.closest('p')).toBe(badge.closest('p'));
  expect(container.textContent).toBe(`v${version} beta`);
});
