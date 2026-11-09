// @vitest-environment jsdom
import { getRoles, getByRole } from '@testing-library/react';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { TooltipProvider } from '../components/ui/tooltip';
const renderToStaticMarkup = (node:React.ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>);
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
  expect(markup).toContain('Choose a file');
  expect(markup).toContain('Try a sample document');
  expect(markup).not.toContain('product-preview');
  expect(markup).not.toContain('home-stat');
  expect(markup).not.toContain('home-marker');
  expect(markup.match(/aria-labelledby/g)).toHaveLength(1);
});

it('names the document in recent activity', async () => {
 await i18n.changeLanguage('en');
 const markup=renderToStaticMarkup(<Home initialData={{...empty,recentActivity:[{id:'event',documentId:'00000000-0000-4000-8000-000000000001' as Dashboard['recentActivity'][number]['documentId'],kind:'chat',createdAt:'2026-11-04T00:00:00Z',documentTitle:'Networking notes'}]}} navigate={() => {}} onUsage={() => {}}/>);
 expect(markup).toContain('Conversation explored<strong>Networking notes</strong>');
});

it('uses singular English study and unpriced-call labels', async () => {
 await i18n.changeLanguage('en');
 expect(renderToStaticMarkup(<Streak streak={{current:1,best:1,today:true,days:[]}}/>)).toContain('>1 day</strong>');
 expect(i18n.t('usage:unknown_calls',{count:1})).toBe('1 call unpriced; total is a lower bound.');
});

it('uses one Resume action and at most five recent rows without a nested main', async () => {
  await i18n.changeLanguage('en');
  const recentDocuments = Array.from({ length: 8 }, (_, index) => ({
    document: { id: `doc-${index}`, title: `Notes ${index}`, sourceName: 'notes.pdf' },
    lastChat: 'A useful summary',
  })) as Dashboard['recentDocuments'];
  const markup = renderToStaticMarkup(<Home initialData={{ ...empty, recentDocuments }}
    navigate={() => {}} onUsage={() => {}}/>);
  const dom = document.createElement('div');
  dom.innerHTML = markup;
  expect(getRoles(dom).main).toBeUndefined();
  const resume = dom.querySelector('button[aria-label]')!;
  expect(getByRole(dom, 'button', { name: new RegExp(`^${resume.textContent!.trim()}`) })).toBe(resume);
  expect(markup.match(/data-slot="list-row"/g)).toHaveLength(5);
  expect(markup).toContain('Resume');
  expect(markup).not.toContain('Notes 6');
  expect(markup).not.toContain('art-reader-kicker');
});
