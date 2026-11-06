import { expect, it } from 'vitest';
import { notePrompt } from './index';
it.each(['en', 'zh-Hant'] as const)('makes retrieval scaffolds kind and explicit in %s', locale => {
  const prompt = notePrompt({}, locale);
  expect(prompt).toContain('Answers are hidden on purpose');
  expect(prompt).toContain('Worth another look');
  expect(prompt).toContain('Never quote the student');
  expect(prompt).toContain('No URLs, images');
  expect(prompt).toContain('地圖｜重點觀念');
  expect(prompt).toContain('Respect length and concept caps');
  expect(prompt).toContain('answers in a details block');
});
