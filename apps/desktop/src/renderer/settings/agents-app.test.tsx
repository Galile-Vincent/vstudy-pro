// @vitest-environment jsdom
/** The real App and shell keep agent controls available beyond the Settings route. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../shared/domain';
import { i18n, tr } from '../../shared/i18n';
import { App } from '../app';
import { stateFixture, proposalFixture, pairingFixture, click } from './agents-test-helpers';
import type { AgentsState } from '../../shared/mcp';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../home', () => ({ HomeView: () => <main>Home fixture</main> }));
vi.mock('../library', () => ({ LibraryView: () => null, LibrarySidebar: () => null }));
vi.mock('../workspace', () => ({ Workspace: () => null }));
vi.mock('../courses', () => ({ CoursesView: () => null }));
vi.mock('../history', () => ({ HistoryView: () => null, HistoryFinder: () => null }));
vi.mock('../onboarding/help', () => ({ LearningHelp: () => null, ContextCoach: () => null, HelpMenu: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement, state: AgentsState;
beforeEach(async () => {
  await i18n.changeLanguage('en');
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestIdleCallback', () => 0); vi.stubGlobal('cancelIdleCallback', () => {});
  state = { ...stateFixture(), enabled: true, activeCalls: 1 };
  invoke.mockReset().mockImplementation(async channel => {
    if (channel === 'mcp:state') return state;
    if (channel === 'settings:get') return defaultSettings;
    if (channel === 'settings:appearance') return { reducedTransparency: false };
    if (channel === 'settings:systemLocale') return 'en';
    if (channel === 'providers:list') return [];
    return { ok: true };
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('mounts the live indicator in the actual shell while Home is visible', async () => {
  await act(() => root.render(<App />));
  expect(host.querySelector('.shell-topbar [data-testid=agent-status]')?.textContent).toContain('Agent active');
  expect(host.textContent).toContain('Home fixture');
  expect(host.querySelector('[data-testid=agents-settings]')).toBeNull();
  await click('Agent active · 1 call');
  expect(document.querySelector('[data-testid=agents-settings]')).not.toBeNull();
  expect(document.querySelector('[role=tab][data-state=active]')?.textContent).toBe('Agents');
  expect(invoke.mock.calls.filter(([channel]) => channel === 'mcp:state')).toHaveLength(1);
  await click(tr('common:close_settings'));
  expect(document.querySelector('[data-testid=agents-settings]')).toBeNull();
});

it('keeps the live indicator outside the hidden workspace topbar', async () => {
  localStorage.setItem('vstudy-route', JSON.stringify({ view: 'workspace' }));
  await act(() => root.render(<App />));
  expect(host.querySelector('.shell-workspace-status [data-testid=agent-status]')?.textContent).toContain('Agent active');
  expect(host.querySelector('.shell-topbar [data-testid=agent-status]')).toBeNull();
});

it.each(['pairing', 'proposal'])('mounts global %s consent on Home with Settings closed', async kind => {
  if (kind === 'pairing') state.pairings = [pairingFixture()];
  else state.proposals = [proposalFixture()];
  await act(() => root.render(<App />));
  expect(host.textContent).toContain('Home fixture');
  expect(document.querySelector('[data-testid=agents-settings]')).toBeNull();
  expect(document.querySelector('[role=dialog]')?.textContent).toContain(tr(kind === 'pairing' ? 'agents:pair_title' : 'agents:proposal_title'));
});
