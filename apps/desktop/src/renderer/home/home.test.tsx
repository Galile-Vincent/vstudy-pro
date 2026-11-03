// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('../bridge', () => ({ desktop:{} }));
import { Home, Streak, sparklinePoints, type Dashboard } from './home';
import { i18n } from '../../shared/i18n';
export const empty: Dashboard = { pinnedFolders:[], pinnedDocuments:[], recentDocuments:[], month:{inputTokens:0,outputTokens:0,costUsd:0,calls:0},series:[],streak:{current:0,best:0,today:false,days:[]},recentActivity:[] };
it('scales sparse, zero and huge sparkline values without invalid geometry', () => {
  expect(sparklinePoints([])).toBe(''); expect(sparklinePoints([0])).toBe('50,28');
  expect(sparklinePoints([0,1e12])).toBe('0,28 100,2');
});
it('shows calm zero and forty day streaks in all languages', async () => {
  for (const language of ['en','zh-Hant','ja']) {
    await i18n.changeLanguage(language);
    for (const current of [0,40]) {
      const markup = renderToStaticMarkup(<Streak streak={{ current,best:40,today:current>0,days:[{date:'2026-11-03',studied:current>0}] }}/>);
      expect(markup).toContain(String(current)); expect(markup).toContain('2026-11-03');
    }
  }
});
it('gives every empty card meaningful content and actions', async () => {
  await i18n.changeLanguage('en');
  const markup = renderToStaticMarkup(<Home initialData={empty} navigate={() => {}} onUsage={() => {}}/>);
  expect(markup).toContain('Pin a document'); expect(markup).toContain('Choose a file');
  expect(markup).toContain('Your discoveries will gather here'); expect(markup).toContain('Open Library');
  expect(markup.match(/aria-labelledby/g)).toHaveLength(6);
});
