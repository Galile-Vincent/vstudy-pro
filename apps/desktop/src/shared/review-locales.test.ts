import { expect, it } from 'vitest';
import en from './locales/en/review.json';
import ja from './locales/ja/review.json';
import zhHant from './locales/zh-Hant/review.json';

const catalogs = { en, ja, 'zh-Hant': zhHant };
const allKeys = [...new Set(Object.values(catalogs).flatMap(Object.keys))].sort();

it.each(Object.entries(catalogs))('provides every review key in %s', (_language, catalog) => {
  expect(Object.keys(catalog).sort()).toEqual(allKeys);
});

it.each([
  ['en', 'Submitting locks only this answer and shows its feedback immediately.', 'After finishing the test, confirm separately to update your review list. Reported questions are excluded.'],
  ['ja', '送信するとこの問題の回答だけが確定し、すぐにフィードバックが表示されます。', 'テストを終えた後、別途確認して復習リストを更新します。報告済みの問題は除外されます。'],
  ['zh-Hant', '送出後只會鎖定本題答案，並立即顯示本題回饋。', '完成整份測驗後，需另行確認才會更新複習清單。已回報的題目不列入計算。'],
] as const)('explains per-item submission and separate test confirmation in %s', (language, commitNotice, confirmNotice) => {
  expect(catalogs[language].commit_notice).toBe(commitNotice);
  expect(catalogs[language].confirm_notice).toBe(confirmNotice);
});
