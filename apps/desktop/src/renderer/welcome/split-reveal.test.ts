import { expect, it } from 'vitest';
import { resources } from '../../shared/i18n';
import { splitGroups } from './split-reveal';
it('keeps each localized headline intact in at most eight groups, with attached punctuation', () => {
  for (const locale of ['en', 'zh-Hant', 'ja'] as const) {
    const text = resources[locale].welcome.hero_title, groups = splitGroups(text, locale);
    expect(groups.join('')).toBe(text); expect(groups.length).toBeLessThanOrEqual(8);
    expect(groups.every(group => !/^[、。，.!?]/u.test(group))).toBe(true);
  }
});
