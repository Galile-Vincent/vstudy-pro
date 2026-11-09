import { describe, expect, it } from 'vitest';
import { catalogDeadlines } from './deadline-groups';
import type { MoodleDeadline } from '../../shared/moodle';

describe('catalog deadline boundaries', () => {
  it('includes local day seven late, today late, recent overdue and undated work', () => {
    const now = new Date(2026, 10, 9, 12).getTime();
    const deadline = (id: string, dueAt: string) => ({ id, dueAt } as MoodleDeadline);
    const late = (day: number) => new Date(2026, 10, day, 23, 59).toISOString();
    const items = [deadline('today', late(9)), deadline('seven', late(16)),
      deadline('eight', late(17)), deadline('old', late(1)),
      deadline('months', new Date(2026, 5, 1).toISOString()),
      deadline('missing', ''), deadline('invalid', 'bad')];
    const result = catalogDeadlines(items, now);
    expect(result.dueSoon.map(d => d.id)).toEqual(['today', 'seven']);
    expect(result.overdue.map(d => d.id)).toEqual(['old', 'months']);
    expect(result.undated.map(d => d.id)).toEqual(['missing', 'invalid']);
  });
});
