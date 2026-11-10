// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Reminder } from './reminder';
import { createMockMoodleApi } from '../dev-mock';
import { i18n, tr } from '../../shared/i18n';
afterEach(cleanup);
it('describes an invalid custom reminder time and clears the error on edit', async () => {
  await i18n.changeLanguage('en');
  const api = createMockMoodleApi();
  const course = (await api.overview()).courses[0]!;
  const deadline = (await api.course(course.id)).deadlines[0]!;
  render(<Reminder deadline={deadline} reminders={[]} api={api}
    onChange={async () => {}} onError={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: tr('moodle:remind_for', { title: deadline.title }) }));
  const time = screen.getByLabelText(tr('moodle:custom_time'));
  fireEvent.change(time, { target: { value: '2000-01-01T12:00' } });
  fireEvent.click(screen.getByRole('button', { name: tr('moodle:save_reminder') }));
  expect(time.getAttribute('aria-invalid')).toBe('true');
  expect(document.getElementById(time.getAttribute('aria-describedby')!)).toBe(screen.getByRole('alert'));
  fireEvent.change(time, { target: { value: '2099-01-01T12:00' } });
  expect(time.hasAttribute('aria-invalid')).toBe(false);
  expect(screen.queryByRole('alert')).toBeNull();
});
