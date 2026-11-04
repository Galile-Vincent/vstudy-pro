// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ConnectDialog, fuzzySiteMatch } from './connect';
import { createMockMoodleApi } from '../dev-mock';
import { i18n } from '../../shared/i18n';
import type { AuthPlan } from '../../shared/moodle';
vi.stubGlobal('ResizeObserver',class {observe() {} unobserve() {} disconnect() {}});
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(async () => {await i18n.changeLanguage('en');localStorage.clear();host = document.createElement('div');document.body.append(host);root = createRoot(host);});
afterEach(async () => {await act(async () => root.unmount());host.remove();});
async function click(name: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes(name));
  if (!button) throw new Error(`Missing button ${name}`);
  await act(async () => button.click());
}
async function mount(plan: AuthPlan = {kind:'password'}) {
  const api = createMockMoodleApi();
  const check = vi.fn(async () => ({siteUrl:'https://school.example/moodle',siteName:'Example University',authPlan:plan}));
  api.checkSite = check;
  const connected = vi.fn(async () => undefined), closed = vi.fn();
  const connect = vi.spyOn(api,'connect');
  await act(async () => root.render(<ConnectDialog open onOpenChange={closed} api={api} onConnected={connected} />));
  return {api,check,connect,connected,closed};
}
async function advance() {await click('Chung Yuan');await click('Continue to sign in');}
it('filters suggestions with fuzzy matching',() => {
  expect(fuzzySiteMatch('cycu','中原大學 Chung Yuan CYCU https://ilearning.cycu.edu.tw')).toBe(true);
  expect(fuzzySiteMatch('unknown','中原大學 CYCU')).toBe(false);
});
it('shows a checked site before asking for a password and clears form secrets on submit',async () => {
  const {connect,connected,closed} = await mount();
  expect(document.querySelector('input[type=password]')).toBeNull();
  await click('Chung Yuan');
  expect(document.querySelector('.moodle-site-result')?.textContent).toBe('Example Universityschool.example/moodleSign in with your Moodle username and password');
  expect(document.querySelector('[aria-current=step]')?.textContent).toBe('2Check site');
  expect(document.querySelector('input[type=password]')).toBeNull();
  await click('Continue to sign in');
  const username = document.querySelector<HTMLInputElement>('[name=username]')!, password = document.querySelector<HTMLInputElement>('[name=password]')!;
  username.value = 'student';password.value = 'password-secret';
  await act(async () => password.form!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(connect.mock.calls).toEqual([[{siteUrl:'https://school.example/moodle',username:'student',password:'password-secret'}]]);
  expect(password.value).toBe('');
  expect(localStorage.getItem('vstudy-moodle-recent-sites')).not.toContain('password-secret');
  expect(connected.mock.calls).toEqual([[]]);expect(closed.mock.calls).toEqual([[false]]);
});
it.each(['browser','embedded'] as const)('offers provider buttons without password inputs for %s',async kind => {
  const {connect} = await mount({kind,providers:[{name:'Campus ID',iconurl:'',url:'https://school.example/auth/oauth2/login.php?id=9'}]});
  await advance();
  expect(document.querySelector('input[type=password]')).toBeNull();
  await click('Continue with Campus ID');
  expect(connect.mock.calls).toEqual([[{siteUrl:'https://school.example/moodle',provider:0}]]);
});
it('shows an unavailable reason and administrator next steps',async () => {
  const {connect} = await mount({kind:'unavailable',reason:'mobile-disabled'});
  await click('Chung Yuan');
  expect(document.querySelector('[role=alert]')?.textContent).toBe('The Moodle mobile service is disabled.Ask your administrator to enable the official Moodle mobile web service.');
  expect(document.querySelector('input[type=password]')).toBeNull();
  expect(document.querySelector('[aria-current=step]')?.textContent).toBe('2Check site');
  expect(connect.mock.calls).toEqual([]);
});
it('shows a typed authentication error and leaves credentials empty',async () => {
  const {api} = await mount();
  api.connect = async () => {throw new Error('VSTUDY_STATUS:{"code":"moodle.auth_invalidlogin"}');};
  await advance();
  const password = document.querySelector<HTMLInputElement>('[name=password]')!;
  password.value = 'secret';
  await act(async () => password.form!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(document.querySelector('[role=alert]')?.textContent).toBe('The username or password was not accepted. Try again.');
  expect(password.value).toBe('');
});
it('ignores a completed check after the dialog closes',async () => {
  const {api} = await mount();let done!: (value: Awaited<ReturnType<typeof api.checkSite>>) => void;
  api.checkSite = () => new Promise(resolve => {done = resolve;});
  await click('Chung Yuan');
  expect(document.querySelector('[role=status]')?.textContent).toBe('Checking your school…');
  await act(async () => root.render(<ConnectDialog open={false} onOpenChange={() => {}} api={api} onConnected={async () => {}} />));
  await act(async () => done({siteUrl:'https://school.example',siteName:'Late result',authPlan:{kind:'password'}}));
  expect(document.querySelector('[role=dialog]')).toBeNull();
});
