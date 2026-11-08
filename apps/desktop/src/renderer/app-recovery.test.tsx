// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './app';
import { tr } from '../shared/i18n';
const state=vi.hoisted(()=>({route:{view:'home',documentId:'document-a'},fail:'home'}));
vi.mock('./bridge',()=>({desktop:{invoke:async()=>[]}}));
vi.mock('./shell',()=>({useNavigate:()=>({route:state.route,activeTabId:'test',tabs:{tabs:[{id:'test'}]}}),AppShell:({children}:{children:React.ReactNode})=><><nav>Shell navigation</nav>{children}</>}));
vi.mock('./home',()=>({HomeView:()=>{if(state.fail==='home')throw new Error('home');return <p>Home content</p>;}}));
vi.mock('./library',()=>({LibraryView:()=>{if(state.fail==='library')throw new Error('library');return <p>Library content</p>;},LibrarySidebar:()=>null}));
vi.mock('./workspace',()=>({Workspace:()=>{const [opened]=useState(state.route.documentId);if(state.fail==='workspace')throw new Error('workspace');return <p>Opened {opened}</p>;}}));
vi.mock('./courses',()=>({CoursesView:()=>{if(state.fail==='courses')throw new Error('courses');return <p>Courses content</p>;}}));
vi.mock('./providers',()=>({ProviderSettings:()=>{if(state.fail==='settings')throw new Error('settings');return <p>Settings content</p>;}}));
vi.mock('./history',()=>({HistoryView:()=>null,HistoryFinder:()=>null}));
vi.mock('./onboarding/help',()=>({LearningHelp:()=>null,ContextCoach:()=>null}));
vi.mock('./ai-cli/setup',()=>({AiCliSetupHost:()=>null}));
vi.mock('./settings/agents-state',()=>({AgentsProvider:({children}:{children:React.ReactNode})=>children}));
vi.mock('./settings/agents-navigation',()=>({AgentNavigation:()=>null}));
vi.mock('./settings/agents-consent',()=>({AgentConsent:()=>null,AgentStatus:()=>null}));
vi.stubGlobal('requestIdleCallback',()=>1);vi.stubGlobal('cancelIdleCallback',()=>{});
afterEach(()=>{cleanup();vi.restoreAllMocks();state.route={view:'home',documentId:'document-a'};state.fail='home';});
it.each(['home','library','workspace','courses'])('contains %s failures and recovers when navigating away',view=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  state.route.view=view;state.fail=view;
  const app=render(<App/>);
  expect(screen.getByText('Shell navigation')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain(tr('common:surface_render_error'));
  const destination=view==='library'?'home':'library';
  state.route={view:destination,documentId:'document-a'};state.fail='';app.rerender(<App/>);
  expect(screen.getByText(destination==='library'?'Library content':'Home content')).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();
});
it('contains settings render failures and retries without losing navigation',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});state.fail='settings';render(<App/>);
  await act(async()=>window.dispatchEvent(new Event('vstudy:open-settings')));
  expect(screen.getByRole('alert')).toBeTruthy();expect(screen.getByText('Shell navigation')).toBeTruthy();
  state.fail='';fireEvent.click(screen.getByRole('button',{name:tr('common:retry')}));
  expect(screen.getByText('Settings content')).toBeTruthy();
});
it('opens the new document when navigating directly between Workspace documents',()=>{
  state.fail='';state.route={view:'workspace',documentId:'document-a'};
  const app=render(<App/>);expect(screen.getByText('Opened document-a')).toBeTruthy();
  state.route={view:'workspace',documentId:'document-b'};app.rerender(<App/>);
  expect(screen.getByText('Opened document-b')).toBeTruthy();expect(screen.queryByText('Opened document-a')).toBeNull();
});
