// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { builtinThemes } from '../../shared/themes';
import { tr } from '../../shared/i18n';
import { ThemeTransfer } from './theme-editor';
afterEach(cleanup);
it.each([
  ['bad id', {...builtinThemes[0],id:'NOT VALID'}, 'invalid_id'],
  ['unknown field', {...builtinThemes[0],id:'custom-ok',extra:true}, 'unknown_field'],
  ['reserved id', builtinThemes[0], 'reserved_id'],
])('associates %s errors with the JSON input', async (_, value, key) => {
  render(<ThemeTransfer theme="import" onClose={vi.fn()} onSave={vi.fn()} />);
  const field = screen.getByRole('textbox');
  fireEvent.change(field,{target:{value:JSON.stringify(value)}});
  fireEvent.click(screen.getByRole('button',{name:tr('themes:import')}));
  const error = await screen.findByRole('alert');
  expect(error.textContent).toBe(tr(`themes:${key}`));
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(field.getAttribute('aria-describedby')).toBe(error.id);
});
