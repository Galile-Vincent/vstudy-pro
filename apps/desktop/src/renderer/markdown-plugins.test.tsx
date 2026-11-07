// @vitest-environment jsdom
import { act, Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DocumentMarkdown, ReplyMarkdown } from './markdown';
import type { Document } from '../shared';

const { mathLoaded } = vi.hoisted(() => ({ mathLoaded: vi.fn() }));
vi.mock('./math-plugins', async importOriginal => {
  const module = await importOriginal();
  mathLoaded();
  return module;
});
vi.mock('./bridge', () => ({ desktop: { invoke: vi.fn() } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const source = '# Reading\n\n' + 'A paragraph with **emphasis** and a [link](https://example.com).\n\n'.repeat(512);

it.each(['document', 'reply'] as const)('commits plain %s Markdown once', async kind => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const commits: number[] = [];
  try {
    await act(async () => root.render(<Profiler id={kind} onRender={(_id, _phase, duration) => commits.push(duration)}>
      {kind === 'document' ? <DocumentMarkdown source={source} documentId={'00000000-0000-4000-8000-000000000001' as Document['id']} onSelect={() => {}} onNotice={() => {}} /> : <ReplyMarkdown text={source} />}
    </Profiler>));
    console.log(`${kind}: fixtureBytes=${source.length}, commits=${commits.length}, durationsMs=${commits.map(ms => ms.toFixed(2)).join(',')}`);
    expect(container.querySelector('strong')?.textContent).toBe('emphasis');
    expect(commits).toHaveLength(1);
    expect(mathLoaded).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});

it('loads the math plugin lazily and commits the rendered formula', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  let commits = 0;
  try {
    await act(async () => root.render(<Profiler id="math" onRender={() => commits++}><ReplyMarkdown text={'Formula: $x^2$'} /></Profiler>));
    await act(async () => {
      await vi.waitFor(() => expect(mathLoaded).toHaveBeenCalledOnce());
    });
    expect(container.querySelector('.katex')).not.toBeNull();
    console.log(`math: fixtureBytes=14, commits=${commits}`);
    expect(commits).toBe(2);
  } finally {
    await act(async () => root.unmount());
  }
});
